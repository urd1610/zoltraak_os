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
const AI_MODEL_PROVIDERS = new Set(['openrouter', 'lmstudio', 'openai', 'gemini']);
const AI_MODEL_FEATURES = {
  'ai-mail-monitor': { providers: new Set(['openrouter', 'lmstudio']) },
  chat: { providers: new Set(['openrouter', 'lmstudio', 'openai', 'gemini']) },
};
const DEFAULT_LM_STUDIO_ENDPOINT = 'http://localhost:1234/v1/chat/completions';
const DEFAULT_AI_MODEL_BY_PROVIDER = {
  openrouter: 'gpt-4o-mini',
  lmstudio: 'gpt-4o-mini',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
};
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

const getAiModelProviderLabel = (provider) => {
  switch (provider) {
    case 'lmstudio':
      return 'LM Studio';
    case 'openai':
      return 'ChatGPT (OpenAI)';
    case 'gemini':
      return 'Gemini';
    case 'openrouter':
    default:
      return 'OpenRouter';
  }
};

const buildDefaultAiModelProfiles = (legacyFormatting = {}) => {
  const legacyOpenRouter = legacyFormatting?.openRouter ?? {};
  const legacyLmStudio = legacyFormatting?.lmStudio ?? {};

  return [
    {
      id: 'local-lm',
      label: 'ローカルLLM (LM Studio)',
      provider: 'lmstudio',
      model: legacyLmStudio.model ?? DEFAULT_AI_MODEL_BY_PROVIDER.lmstudio,
      endpoint: legacyLmStudio.endpoint ?? DEFAULT_LM_STUDIO_ENDPOINT,
      apiKey: '',
    },
    {
      id: 'openrouter-default',
      label: 'OpenRouter',
      provider: 'openrouter',
      model: legacyOpenRouter.model ?? DEFAULT_AI_MODEL_BY_PROVIDER.openrouter,
      apiKey: legacyOpenRouter.apiKey ?? '',
    },
    {
      id: 'chatgpt-default',
      label: 'ChatGPT (OpenAI)',
      provider: 'openai',
      model: DEFAULT_AI_MODEL_BY_PROVIDER.openai,
      apiKey: '',
    },
    {
      id: 'gemini-default',
      label: 'Gemini',
      provider: 'gemini',
      model: DEFAULT_AI_MODEL_BY_PROVIDER.gemini,
      apiKey: '',
    },
  ];
};

const buildDefaultAiModelFeatureMap = (legacyFormatting = {}) => {
  const legacyProvider = String(legacyFormatting?.provider ?? '').toLowerCase();
  const aiMailProfile = legacyProvider === 'openrouter' ? 'openrouter-default' : 'local-lm';
  return {
    'ai-mail-monitor': aiMailProfile,
    chat: 'chatgpt-default',
  };
};

const normalizeAiModelProfile = (profile = {}, fallback = {}, index = 0) => {
  const rawProvider = String(profile.provider ?? fallback.provider ?? 'openrouter').toLowerCase();
  const provider = AI_MODEL_PROVIDERS.has(rawProvider) ? rawProvider : 'openrouter';
  const defaultModel = DEFAULT_AI_MODEL_BY_PROVIDER[provider] ?? DEFAULT_AI_MODEL_BY_PROVIDER.openrouter;
  const idCandidate = String(profile.id ?? fallback.id ?? '').trim();
  const id = idCandidate || `profile-${index + 1}`;
  const labelCandidate = String(profile.label ?? fallback.label ?? '').trim();
  const label = labelCandidate || getAiModelProviderLabel(provider);
  const modelCandidate = String(profile.model ?? fallback.model ?? '').trim();
  const model = modelCandidate || defaultModel;
  const endpointCandidate = String(profile.endpoint ?? fallback.endpoint ?? '').trim();
  const endpoint = provider === 'lmstudio'
    ? (endpointCandidate || DEFAULT_LM_STUDIO_ENDPOINT)
    : endpointCandidate;
  const apiKey = typeof profile.apiKey === 'string'
    ? profile.apiKey
    : typeof fallback.apiKey === 'string'
      ? fallback.apiKey
      : '';
  return {
    id,
    label,
    provider,
    model,
    endpoint,
    apiKey,
  };
};

const normalizeAiModelProfiles = (profiles = [], fallbackProfiles = []) => {
  const normalized = profiles.map((profile, index) => normalizeAiModelProfile(profile, fallbackProfiles[index], index));
  const seen = new Set();
  return normalized.map((profile, index) => {
    let nextId = profile.id;
    if (!nextId || seen.has(nextId)) {
      nextId = `profile-${index + 1}`;
    }
    seen.add(nextId);
    if (nextId === profile.id) {
      return profile;
    }
    return { ...profile, id: nextId };
  });
};

const resolveAiModelProfileId = (featureId, preferredId, profiles) => {
  const feature = AI_MODEL_FEATURES[featureId];
  const allowedProviders = feature?.providers ?? null;
  const preferredProfile = profiles.find((profile) => profile.id === preferredId);
  if (preferredProfile && (!allowedProviders || allowedProviders.has(preferredProfile.provider))) {
    return preferredProfile.id;
  }
  const fallback = profiles.find((profile) => !allowedProviders || allowedProviders.has(profile.provider));
  return fallback?.id ?? '';
};

const normalizeAiModelSettings = (value = {}, legacyFormatting = {}) => {
  const fallbackProfiles = buildDefaultAiModelProfiles(legacyFormatting);
  const fallbackFeatureMap = buildDefaultAiModelFeatureMap(legacyFormatting);
  const profilesInput = Array.isArray(value.profiles) && value.profiles.length > 0
    ? value.profiles
    : fallbackProfiles;
  const profiles = normalizeAiModelProfiles(profilesInput, fallbackProfiles);
  const featureMapInput = value.featureMap && typeof value.featureMap === 'object'
    ? value.featureMap
    : {};
  const featureMap = {};
  Object.keys(AI_MODEL_FEATURES).forEach((featureId) => {
    const preferredId = featureMapInput[featureId] ?? fallbackFeatureMap[featureId] ?? '';
    featureMap[featureId] = resolveAiModelProfileId(featureId, preferredId, profiles);
  });
  return { profiles, featureMap };
};

const getAiModelSettings = async () => {
  const settings = await readSettings();
  const legacyFormatting = settings.aiMail?.formatting ?? {};
  if (!settings.aiModels) {
    return normalizeAiModelSettings({}, legacyFormatting);
  }
  return normalizeAiModelSettings(settings.aiModels, legacyFormatting);
};

const resolveAiModelProfile = (featureId, aiModelSettings) => {
  if (!aiModelSettings) return null;
  const profiles = Array.isArray(aiModelSettings.profiles) ? aiModelSettings.profiles : [];
  const featureMap = aiModelSettings.featureMap ?? {};
  const preferredId = featureMap?.[featureId] ?? '';
  const resolvedId = resolveAiModelProfileId(featureId, preferredId, profiles);
  return profiles.find((profile) => profile.id === resolvedId) ?? null;
};

const applyAiModelProfileToFormatting = (formatting, modelProfile, defaultPrompt = DEFAULT_FORMATTING_PROMPT) => {
  if (!modelProfile) {
    return normalizeFormattingSettings(formatting, defaultPrompt);
  }
  const provider = modelProfile.provider === 'lmstudio' ? 'lmstudio' : 'openrouter';
  const next = { ...formatting, provider };
  if (provider === 'lmstudio') {
    next.lmStudio = {
      ...(formatting.lmStudio ?? {}),
      endpoint: modelProfile.endpoint || formatting.lmStudio?.endpoint || DEFAULT_LM_STUDIO_ENDPOINT,
      model: modelProfile.model || formatting.lmStudio?.model || DEFAULT_AI_MODEL_BY_PROVIDER.lmstudio,
    };
  } else {
    next.openRouter = {
      ...(formatting.openRouter ?? {}),
      apiKey: typeof modelProfile.apiKey === 'string' ? modelProfile.apiKey : (formatting.openRouter?.apiKey ?? ''),
      model: modelProfile.model || formatting.openRouter?.model || DEFAULT_AI_MODEL_BY_PROVIDER.openrouter,
    };
  }
  return normalizeFormattingSettings(next, defaultPrompt);
};

const getAiMailSettings = async () => {
  const settings = await readSettings();
  const aiMail = settings.aiMail ?? {};
  const defaultPrompt = await readDefaultFormattingPrompt();
  const defaultFormatting = buildDefaultFormattingSettings(defaultPrompt);
  const formatting = normalizeFormattingSettings(aiMail.formatting ?? defaultFormatting, defaultPrompt);
  const aiModelSettings = await getAiModelSettings();
  const modelProfile = resolveAiModelProfile('ai-mail-monitor', aiModelSettings);
  return {
    forwardTo: aiMail.forwardTo ?? '',
    forwardedCount: aiMail.forwardedCount ?? 0,
    seenUids: Array.isArray(aiMail.seenUids) ? aiMail.seenUids : [],
    formatting: applyAiModelProfileToFormatting(formatting, modelProfile, defaultPrompt),
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

const buildAiModelProfileSummary = (profile) => {
  if (!profile) return null;
  return {
    id: profile.id,
    label: profile.label,
    provider: profile.provider,
    model: profile.model,
    endpoint: profile.endpoint,
  };
};

const buildAiMailStatusWithModel = async (status) => {
  if (!status) return status;
  const aiModelSettings = await getAiModelSettings();
  const modelProfile = resolveAiModelProfile('ai-mail-monitor', aiModelSettings);
  return {
    ...status,
    modelProfile: buildAiModelProfileSummary(modelProfile),
  };
};

const syncAiMailModelSettings = async () => {
  if (!aiMailMonitor) return null;
  const aiMailState = await getAiMailSettings();
  if (!aiMailState?.formatting) {
    return aiMailMonitor.getStatus();
  }
  return aiMailMonitor.updateFormatting(aiMailState.formatting);
};

const saveAiModelSettings = async (payload) => {
  const settings = await readSettings();
  const legacyFormatting = settings.aiMail?.formatting ?? {};
  const normalized = normalizeAiModelSettings(payload ?? {}, legacyFormatting);
  const nextSettings = { ...settings, aiModels: normalized };
  await writeSettings(nextSettings);
  await syncAiMailModelSettings();
  return normalized;
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
  const withAiMailModelProfile = async (statusOrPromise) => buildAiMailStatusWithModel(await statusOrPromise);
  ipcMain.handle('ai-mail:get-status', async () => withAiMailModelProfile(monitor?.getStatus()));
  ipcMain.handle('ai-mail:update-forward', async (_event, forwardTo) => withAiMailModelProfile(monitor?.updateForwardTo(forwardTo)));
  ipcMain.handle('ai-mail:update-formatting', async (_event, formatting) => withAiMailModelProfile(monitor?.updateFormatting(formatting)));
  ipcMain.handle('ai-mail:start', async () => withAiMailModelProfile(monitor?.start()));
  ipcMain.handle('ai-mail:stop', async () => withAiMailModelProfile(monitor?.stop()));
  ipcMain.handle('ai-mail:refresh', async () => withAiMailModelProfile(monitor?.pollOnce()));
  ipcMain.handle('ai-mail:fetch-once', async () => withAiMailModelProfile(monitor?.pollOnce({ force: true })));
  ipcMain.handle('ai-mail:get-default-prompt', async () => readDefaultFormattingPrompt());
  ipcMain.handle('ai-mail:save-default-prompt', async (_event, prompt) => {
    const { prompt: saved } = await registerDefaultFormattingPrompt(prompt);
    return saved;
  });
  ipcMain.handle('ai-models:get', async () => getAiModelSettings());
  ipcMain.handle('ai-models:save', async (_event, payload) => saveAiModelSettings(payload));
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
