const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, nativeTheme, ipcMain } = require('electron');

const fsp = fs.promises;
const SETTINGS_FILE_NAME = 'settings.json';
let workspaceDirectory = null;

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

  ipcMain.handle('workspace:get-directory', async () => {
    const ensured = await ensureWorkspaceDirectory();
    if (ensured) {
      return ensured;
    }
    return getStoredWorkspaceDirectory();
  });
  ipcMain.handle('workspace:change-directory', changeWorkspaceDirectory);
  ipcMain.handle('workspace:get-stored-directory', getStoredWorkspaceDirectory);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
