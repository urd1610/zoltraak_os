const { contextBridge, ipcRenderer } = require('electron');

let pathModule = null;

try {
  pathModule = require('path');
} catch (error) {
  console.warn('path モジュールをプリロードで解決できませんでした。標準の解決のみで依存読込を試みます。', error);
}

const systemInfo = {
  user: process.env.USERNAME ?? process.env.USER ?? 'unknown',
  platform: process.platform,
  release: typeof process.getSystemVersion === 'function'
    ? process.getSystemVersion()
    : process.release?.name ?? 'unknown',
};

const resolveDependency = (name) => {
  if (!pathModule) {
    return require(name);
  }
  // Worktree配下で起動すると app パス直下に node_modules が無いので、探索パスを明示して解決する
  const searchRoots = [
    __dirname,
    pathModule.resolve(__dirname, '..'),
    pathModule.resolve(__dirname, '..', '..'),
    pathModule.resolve(__dirname, '..', '..', '..'),
    process.cwd(),
    process.resourcesPath,
  ].filter(Boolean);

  let lastError = null;
  for (const base of searchRoots) {
    try {
      const resolved = require.resolve(name, { paths: [base] });
      return require(resolved);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }
  return null;
};

let three = null;

try {
  // three.js をプリロードしてレンダラー側へ露出しておく
  // （nodeIntegration: false でも使えるようにする）
  three = resolveDependency('three');
  contextBridge.exposeInMainWorld('THREE', three);
} catch (error) {
  // three がなくても他の機能は動くようにする
  console.error('three.js の読み込みに失敗しました', error);
}

contextBridge.exposeInMainWorld('desktopBridge', {
  getSystemInfo: () => systemInfo,
  getNowIso: () => new Date().toISOString(),
  getWorkspaceDirectory: () => ipcRenderer.invoke('workspace:get-directory'),
  changeWorkspaceDirectory: () => ipcRenderer.invoke('workspace:change-directory'),
  openWorkspaceDirectory: () => ipcRenderer.invoke('workspace:open-directory'),
  getWorkspaceGraph: () => ipcRenderer.invoke('workspace:get-graph'),
  saveRecording: (buffer, mimeType) => ipcRenderer.invoke('recording:save', { buffer, mimeType }),
  getAiMailStatus: () => ipcRenderer.invoke('ai-mail:get-status'),
  startAiMailMonitor: () => ipcRenderer.invoke('ai-mail:start'),
  stopAiMailMonitor: () => ipcRenderer.invoke('ai-mail:stop'),
  refreshAiMailStatus: () => ipcRenderer.invoke('ai-mail:refresh'),
  fetchAiMailOnce: () => ipcRenderer.invoke('ai-mail:fetch-once'),
  updateAiMailForward: (forwardTo) => ipcRenderer.invoke('ai-mail:update-forward', forwardTo),
  updateAiMailFormatting: (formatting) => ipcRenderer.invoke('ai-mail:update-formatting', formatting),
  getAiMailDefaultPrompt: () => ipcRenderer.invoke('ai-mail:get-default-prompt'),
  saveAiMailDefaultPrompt: (prompt) => ipcRenderer.invoke('ai-mail:save-default-prompt', prompt),
});
