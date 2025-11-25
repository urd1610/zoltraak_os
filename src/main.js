const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, nativeTheme, ipcMain, shell } = require('electron');
const { AiMailMonitor } = require('./aiMailMonitor');

const fsp = fs.promises;
const SETTINGS_FILE_NAME = 'settings.json';
const RECORDING_DIR_NAME = 'Recording';
let workspaceDirectory = null;
let aiMailMonitor = null;

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

const getAiMailSettings = async () => {
  const settings = await readSettings();
  const aiMail = settings.aiMail ?? {};
  return {
    forwardTo: aiMail.forwardTo ?? '',
    forwardedCount: aiMail.forwardedCount ?? 0,
    seenUids: Array.isArray(aiMail.seenUids) ? aiMail.seenUids : [],
  };
};

const saveAiMailSettings = async (patch) => {
  const settings = await readSettings();
  const nextAiMail = { ...(settings.aiMail ?? {}), ...patch };
  const nextSettings = { ...settings, aiMail: nextAiMail };
  await writeSettings(nextSettings);
  return nextAiMail;
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
  return updateWorkspaceDirectory(selected);
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
    loadState: getAiMailSettings,
    saveState: saveAiMailSettings,
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
  ipcMain.handle('recording:save', async (_event, payload) => {
    const { buffer, mimeType } = payload ?? {};
    return saveRecordingBuffer(buffer, mimeType);
  });
  ipcMain.handle('ai-mail:get-status', async () => monitor?.getStatus());
  ipcMain.handle('ai-mail:update-forward', async (_event, forwardTo) => monitor?.updateForwardTo(forwardTo));
  ipcMain.handle('ai-mail:start', async () => monitor?.start());
  ipcMain.handle('ai-mail:stop', async () => monitor?.stop());
  ipcMain.handle('ai-mail:refresh', async () => monitor?.pollOnce());

  createWindow();

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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
