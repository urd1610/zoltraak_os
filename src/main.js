const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, nativeTheme, ipcMain, shell } = require('electron');
const { AiMailMonitor } = require('./aiMailMonitor');
const { AiFormatter, DEFAULT_PROMPT: DEFAULT_FORMATTING_PROMPT } = require('./aiFormatter');
const { createSwMenuService } = require('./swMenuService');
const { loadSwMenuEnv } = require('./envLoader');

const fsp = fs.promises;
const SETTINGS_FILE_NAME = 'settings.json';
const MAIL_DIR_NAME = 'Mail';
const PROMPT_DIR_NAME = 'Prompt';
const DEFAULT_PROMPT_FILE_NAME = 'default.txt';
const RECORDING_DIR_NAME = 'Recording';
loadSwMenuEnv({ baseDir: path.resolve(__dirname, '..') });
let workspaceDirectory = null;
let aiMailMonitor = null;
let swMenuService = null;
const MAX_GRAPH_NODES = 180;
const MAX_GRAPH_DEPTH = 4;
const GRAPH_IGNORE_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  '.worktrees',
]);
let workspaceWatcher = null;
let workspaceWatcherDebounce = null;

const isExistingDirectory = (dir) => {
  if (!dir) {
    return false;
  }

  try {
    return fs.statSync(dir).isDirectory();
  } catch (error) {
    return false;
  }
};

const isIgnoredWorkspaceRelativePath = (relativePath) => {
  if (!relativePath) {
    return false;
  }
  const parts = path.normalize(relativePath).split(path.sep).filter(Boolean);
  return parts.some((part) => GRAPH_IGNORE_NAMES.has(part));
};

const notifyWorkspaceGraphChanged = (reason = 'fs-change') => {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win?.isDestroyed?.() || win?.webContents?.isDestroyed?.()) {
      return;
    }
    win.webContents.send('workspace:graph-updated', { reason, ts: Date.now() });
  });
};

const scheduleWorkspaceGraphChanged = () => {
  if (workspaceWatcherDebounce) {
    clearTimeout(workspaceWatcherDebounce);
  }
  workspaceWatcherDebounce = setTimeout(() => {
    workspaceWatcherDebounce = null;
    notifyWorkspaceGraphChanged('fs-change');
  }, 350);
};

const stopWorkspaceWatcher = () => {
  if (workspaceWatcher) {
    workspaceWatcher.close?.();
    workspaceWatcher = null;
  }
  if (workspaceWatcherDebounce) {
    clearTimeout(workspaceWatcherDebounce);
    workspaceWatcherDebounce = null;
  }
};

const startWorkspaceWatcher = async () => {
  stopWorkspaceWatcher();
  const dir = await ensureWorkspaceDirectory();
  if (!dir) {
    return null;
  }
  const handleFsEvent = (_eventType, filename) => {
    if (!filename) {
      scheduleWorkspaceGraphChanged();
      return;
    }
    if (isIgnoredWorkspaceRelativePath(filename.toString())) {
      return;
    }
    scheduleWorkspaceGraphChanged();
  };
  const attachWatcherHandlers = (watcher) => {
    if (!watcher) return null;
    watcher.on('error', (error) => {
      console.warn('workspace watcher error', error);
    });
    return watcher;
  };
  try {
    workspaceWatcher = attachWatcherHandlers(fs.watch(dir, { recursive: true }, handleFsEvent));
    return workspaceWatcher;
  } catch (error) {
    if (error?.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
      console.warn('recursive fs.watch is unavailable on this platform, falling back to non-recursive watch');
      try {
        workspaceWatcher = attachWatcherHandlers(fs.watch(dir, { recursive: false }, handleFsEvent));
        return workspaceWatcher;
      } catch (fallbackError) {
        console.error('Failed to start non-recursive workspace watcher', fallbackError);
      }
    }
    console.error('Failed to start workspace watcher', error);
    workspaceWatcher = null;
    return null;
  }
};

const restartWorkspaceWatcher = async () => startWorkspaceWatcher();

const getDefaultWorkspaceDirectory = () => {
  const cwd = process.cwd();
  return isExistingDirectory(cwd) ? cwd : null;
};

const formatDateForFilename = (date) => {
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  return `${year}${month}${day}_${hour}${minute}${second}`;
};

const getSettingsPath = () => path.join(app.getPath('userData'), SETTINGS_FILE_NAME);

const readSettings = async () => {
  try {
    const raw = await fsp.readFile(getSettingsPath(), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
};

const writeSettings = async (settings) => {
  const settingsPath = getSettingsPath();
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
};

const buildDefaultFormattingSettings = (defaultPrompt = DEFAULT_FORMATTING_PROMPT) => {
  const formatter = new AiFormatter({ prompt: defaultPrompt });
  return formatter.getOptions();
};

const normalizeFormattingSettings = (value, defaultPrompt = DEFAULT_FORMATTING_PROMPT) => {
  const formatter = new AiFormatter({
    prompt: defaultPrompt,
    ...(value ?? {}),
  });
  return formatter.getOptions();
};

const getAiMailSettings = async () => {
  const settings = await readSettings();
  const aiMail = settings.aiMail ?? {};
  const defaultPrompt = await readDefaultFormattingPrompt();
  const defaultFormatting = buildDefaultFormattingSettings(defaultPrompt);
  return {
    forwardTo: aiMail.forwardTo ?? '',
    forwardedCount: aiMail.forwardedCount ?? 0,
    seenUids: Array.isArray(aiMail.seenUids) ? aiMail.seenUids : [],
    formatting: normalizeFormattingSettings(aiMail.formatting ?? defaultFormatting, defaultPrompt),
  };
};

const saveAiMailSettings = async (patch) => {
  const settings = await readSettings();
  const defaultPrompt = await readDefaultFormattingPrompt();
  const nextFormatting = normalizeFormattingSettings({
    ...(settings.aiMail?.formatting ?? {}),
    ...(patch?.formatting ?? {}),
  }, defaultPrompt);
  const nextAiMail = {
    ...(settings.aiMail ?? {}),
    ...patch,
    formatting: nextFormatting,
  };
  const nextSettings = { ...settings, aiMail: nextAiMail };
  await writeSettings(nextSettings);
  return nextAiMail;
};

const ensurePromptDirectory = async () => {
  const dir = await ensureWorkspaceDirectory();
  if (!dir) {
    throw new Error('作業ディレクトリが設定されていません');
  }
  const promptDir = path.join(dir, MAIL_DIR_NAME, PROMPT_DIR_NAME);
  await fsp.mkdir(promptDir, { recursive: true });
  return promptDir;
};

const getDefaultPromptPath = async () => {
  const promptDir = await ensurePromptDirectory();
  return path.join(promptDir, DEFAULT_PROMPT_FILE_NAME);
};

const ensureDefaultPromptFile = async () => {
  const promptPath = await getDefaultPromptPath();
  try {
    await fsp.access(promptPath, fs.constants.F_OK);
    return promptPath;
  } catch (error) {
    await fsp.writeFile(promptPath, DEFAULT_FORMATTING_PROMPT, 'utf8');
    return promptPath;
  }
};

const readDefaultFormattingPrompt = async () => {
  const promptPath = await ensureDefaultPromptFile();
  try {
    const content = await fsp.readFile(promptPath, 'utf8');
    const trimmed = content.trim();
    return trimmed || DEFAULT_FORMATTING_PROMPT;
  } catch (error) {
    return DEFAULT_FORMATTING_PROMPT;
  }
};

const registerDefaultFormattingPrompt = async (prompt) => {
  const normalized = (prompt ?? '').trim() || DEFAULT_FORMATTING_PROMPT;
  const promptPath = await ensureDefaultPromptFile();
  await fsp.writeFile(promptPath, normalized, 'utf8');
  return { prompt: normalized, path: promptPath };
};

const pickWorkspaceDirectory = async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '作業ディレクトリを選択',
    message: 'Actionで生成されるファイルの保存先に使用します。',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (!canceled && filePaths?.length) {
    return filePaths[0];
  }
  return null;
};

const promptWorkspaceDirectory = async () => {
  while (true) {
    const selected = await pickWorkspaceDirectory();

    if (selected) {
      return selected;
    }

    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['アプリを終了', '再選択'],
      defaultId: 1,
      cancelId: 0,
      title: '作業ディレクトリが必要です',
      message: '作業ディレクトリを選択してください。',
      detail: 'Action機能で生成されるファイルを保存するため、必須設定です。',
    });

    if (response === 0) {
      return null;
    }
  }
};

const getStoredWorkspaceDirectory = async () => {
  const settings = await readSettings();
  return settings.workspaceDirectory ?? null;
};

const updateWorkspaceDirectory = async (dir) => {
  const settings = await readSettings();
  workspaceDirectory = dir;
  await writeSettings({ ...settings, workspaceDirectory: dir });
  return workspaceDirectory;
};

const changeWorkspaceDirectory = async () => {
  const selected = await pickWorkspaceDirectory();
  if (!selected) {
    return workspaceDirectory;
  }
  const updated = await updateWorkspaceDirectory(selected);
  await restartWorkspaceWatcher();
  notifyWorkspaceGraphChanged('workspace-changed');
  return updated;
};

const ensureWorkspaceDirectory = async () => {
  if (isExistingDirectory(workspaceDirectory)) {
    return workspaceDirectory;
  }

  const savedDir = await getStoredWorkspaceDirectory();

  if (isExistingDirectory(savedDir)) {
    return updateWorkspaceDirectory(savedDir);
  }

  const fallbackDir = getDefaultWorkspaceDirectory();
  if (fallbackDir) {
    return updateWorkspaceDirectory(fallbackDir);
  }

  const selectedDir = await promptWorkspaceDirectory();
  if (selectedDir) {
    await updateWorkspaceDirectory(selectedDir);
  }

  return workspaceDirectory;
};

const buildWorkspaceGraph = async () => {
  const root = await ensureWorkspaceDirectory();
  if (!root) {
    return { root: null, nodes: [], links: [] };
  }

  const nodes = [];
  const links = [];
  const seen = new Set();

  const toRelativeId = (absPath) => {
    const rel = path.relative(root, absPath) || '.';
    return rel.split(path.sep).join('/');
  };

  const addNode = (id, type, depth) => {
    if (seen.has(id) || nodes.length >= MAX_GRAPH_NODES) {
      return false;
    }
    seen.add(id);
    const name = id === '.' ? path.basename(root) : path.basename(id);
    const ext = type === 'file' ? path.extname(name).replace(/^\./, '') : '';
    nodes.push({
      id,
      name,
      type,
      depth,
      ext,
    });
    return true;
  };

  addNode('.', 'directory', 0);

  const walk = async (currentDir, depth, parentId) => {
    if (depth > MAX_GRAPH_DEPTH || nodes.length >= MAX_GRAPH_NODES) {
      return;
    }
    let entries = [];
    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      return;
    }
    entries.sort((a, b) => {
      const aIsDir = a.isDirectory();
      const bIsDir = b.isDirectory();
      if (aIsDir !== bIsDir) {
        return aIsDir ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (nodes.length >= MAX_GRAPH_NODES) {
        break;
      }
      if (entry.isSymbolicLink()) {
        continue;
      }
      // three.js の表示対象から隠しファイル・ディレクトリを除外する
      if (entry.name.startsWith('.')) {
        continue;
      }
      if (GRAPH_IGNORE_NAMES.has(entry.name)) {
        continue;
      }
      const absChild = path.join(currentDir, entry.name);
      const childId = toRelativeId(absChild);
      const isDir = entry.isDirectory();
      const added = addNode(childId, isDir ? 'directory' : 'file', depth);
      if (added) {
        links.push({ source: parentId, target: childId });
      }
      if (isDir) {
        await walk(absChild, depth + 1, childId);
      }
    }
  };

  await walk(root, 1, '.');

  return { root, nodes, links };
};

const resolveWorkspaceEntryPath = async (entryId) => {
  const root = await ensureWorkspaceDirectory();
  if (!root) {
    throw new Error('作業ディレクトリが設定されていません');
  }
  const normalizedId = typeof entryId === 'string' && entryId.trim() ? entryId : '.';
  const resolved = path.resolve(root, normalizedId);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('作業ディレクトリ外のパスは開けません');
  }
  return resolved;
};

const openWorkspaceEntry = async (entryId) => {
  const targetPath = await resolveWorkspaceEntryPath(entryId);
  let stat = null;
  try {
    stat = await fsp.stat(targetPath);
  } catch (error) {
    throw new Error('指定のパスが見つかりません');
  }
  const result = await shell.openPath(targetPath);
  if (result) {
    throw new Error(`パスを開けませんでした: ${result}`);
  }
  return {
    path: targetPath,
    type: stat.isDirectory() ? 'directory' : 'file',
  };
};

const openWorkspaceEntryDirectory = async (entryId) => {
  const targetPath = await resolveWorkspaceEntryPath(entryId);
  let stat = null;
  try {
    stat = await fsp.stat(targetPath);
  } catch (error) {
    throw new Error('指定のパスが見つかりません');
  }
  const directory = stat.isDirectory() ? targetPath : path.dirname(targetPath);
  if (stat.isDirectory()) {
    const result = await shell.openPath(directory);
    if (result) {
      throw new Error(`ディレクトリを開けませんでした: ${result}`);
    }
  } else if (typeof shell.showItemInFolder === 'function') {
    const revealed = shell.showItemInFolder(targetPath);
    if (revealed === false) {
      throw new Error('ディレクトリを開けませんでした');
    }
  } else {
    const result = await shell.openPath(directory);
    if (result) {
      throw new Error(`ディレクトリを開けませんでした: ${result}`);
    }
  }
  return {
    directory,
    target: targetPath,
    type: stat.isDirectory() ? 'directory' : 'file',
  };
};

const ensureRecordingDirectory = async () => {
  const dir = await ensureWorkspaceDirectory();
  if (!dir) {
    throw new Error('作業ディレクトリが設定されていません');
  }
  const recordingDir = path.join(dir, RECORDING_DIR_NAME);
  await fsp.mkdir(recordingDir, { recursive: true });
  return recordingDir;
};

const buildAiMailMonitor = async () => {
  if (aiMailMonitor) {
    return aiMailMonitor;
  }
  const aiMailState = await getAiMailSettings();
  aiMailMonitor = new AiMailMonitor({
    forwardTo: aiMailState.forwardTo,
    forwardedCount: aiMailState.forwardedCount,
    seenUids: aiMailState.seenUids,
    formatting: aiMailState.formatting,
    loadState: getAiMailSettings,
    saveState: saveAiMailSettings,
    ensureWorkspaceDirectory,
    formatDateForFilename,
  });
  return aiMailMonitor;
};

const getExtensionFromMime = (mimeType) => {
  if (typeof mimeType !== 'string') return 'webm';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
};

const saveRecordingBuffer = async (arrayBuffer, mimeType) => {
  if (!arrayBuffer) {
    throw new Error('録音データが空です');
  }
  const recordingDir = await ensureRecordingDirectory();
  const timestamp = formatDateForFilename(new Date());
  const extension = getExtensionFromMime(mimeType);
  const fileName = `recording_${timestamp}.${extension}`;
  const filePath = path.join(recordingDir, fileName);
  const buffer = Buffer.from(arrayBuffer);
  await fsp.writeFile(filePath, buffer);
  return filePath;
};

const openWorkspaceDirectory = async () => {
  const dir = await ensureWorkspaceDirectory();
  if (!dir) {
    throw new Error('作業ディレクトリが設定されていません');
  }
  const result = await shell.openPath(dir);
  if (result) {
    throw new Error(`ディレクトリを開けませんでした: ${result}`);
  }
  return dir;
};

const createWindow = () => {
  nativeTheme.themeSource = 'dark';

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0c1224',
    autoHideMenuBar: true,
    titleBarOverlay: {
      color: '#0c1224',
      symbolColor: '#cbe3ff',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // three.js などをプリロードで解決するため、プリロード側では Node API を許可する
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '../public/index.html'));
};

app.whenReady().then(async () => {
  const dir = await ensureWorkspaceDirectory();
  if (!dir) {
    app.quit();
    return;
  }
  const monitor = await buildAiMailMonitor();
  swMenuService = createSwMenuService();
  try {
    await swMenuService.ensureSchema();
  } catch (error) {
    console.error('Failed to initialize SW menu database', error);
  }

  ipcMain.handle('workspace:get-directory', async () => {
    const ensured = await ensureWorkspaceDirectory();
    if (ensured) {
      return ensured;
    }
    return getStoredWorkspaceDirectory();
  });
  ipcMain.handle('workspace:change-directory', changeWorkspaceDirectory);
  ipcMain.handle('workspace:get-stored-directory', getStoredWorkspaceDirectory);
  ipcMain.handle('workspace:open-directory', openWorkspaceDirectory);
  ipcMain.handle('workspace:open-entry', async (_event, entryId) => openWorkspaceEntry(entryId));
  ipcMain.handle(
    'workspace:open-entry-directory',
    async (_event, entryId) => openWorkspaceEntryDirectory(entryId),
  );
  ipcMain.handle('workspace:get-graph', buildWorkspaceGraph);
  ipcMain.handle('recording:save', async (_event, payload) => {
    const { buffer, mimeType } = payload ?? {};
    return saveRecordingBuffer(buffer, mimeType);
  });
  ipcMain.handle('ai-mail:get-status', async () => monitor?.getStatus());
  ipcMain.handle('ai-mail:update-forward', async (_event, forwardTo) => monitor?.updateForwardTo(forwardTo));
  ipcMain.handle('ai-mail:update-formatting', async (_event, formatting) => monitor?.updateFormatting(formatting));
  ipcMain.handle('ai-mail:start', async () => monitor?.start());
  ipcMain.handle('ai-mail:stop', async () => monitor?.stop());
  ipcMain.handle('ai-mail:refresh', async () => monitor?.pollOnce());
  ipcMain.handle('ai-mail:fetch-once', async () => monitor?.pollOnce({ force: true }));
  ipcMain.handle('ai-mail:get-default-prompt', async () => readDefaultFormattingPrompt());
  ipcMain.handle('ai-mail:save-default-prompt', async (_event, prompt) => {
    const { prompt: saved } = await registerDefaultFormattingPrompt(prompt);
    return saved;
  });
  ipcMain.handle('sw-menu:init', async () => swMenuService?.ensureSchema());
  ipcMain.handle('sw-menu:status', async () => swMenuService?.getStatus());
  ipcMain.handle('sw-menu:overview', async () => swMenuService?.getOverview());
  ipcMain.handle('sw-menu:suggestions', async () => swMenuService?.getComponentSuggestions());
  ipcMain.handle('sw-menu:bom-matrix-sw-components', async (_event, query) => swMenuService?.getBomMatrixSwComponents(query));
  ipcMain.handle('sw-menu:upsert-component', async (_event, payload) => swMenuService?.upsertComponent(payload));
  ipcMain.handle('sw-menu:import-components', async (_event, csvText) => swMenuService?.importComponentsFromCsv(csvText));
  ipcMain.handle('sw-menu:record-flow', async (_event, payload) => swMenuService?.recordFlow(payload));
  ipcMain.handle('sw-menu:upsert-bom-batch', async (_event, payload) => swMenuService?.upsertBomLinks(payload));
  ipcMain.handle('sw-menu:upsert-bom', async (_event, payload) => swMenuService?.upsertBomLink(payload));
  ipcMain.handle('sw-menu:search-components', async (_event, query) => swMenuService?.searchComponents(query));

  createWindow();
  await startWorkspaceWatcher();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (aiMailMonitor) {
    aiMailMonitor.stop();
  }
  if (swMenuService) {
    swMenuService.dispose();
  }
  stopWorkspaceWatcher();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
