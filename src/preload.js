const { contextBridge, ipcRenderer } = require('electron');

const systemInfo = {
  user: process.env.USERNAME ?? process.env.USER ?? 'unknown',
  platform: process.platform,
  release: typeof process.getSystemVersion === 'function'
    ? process.getSystemVersion()
    : process.release?.name ?? 'unknown',
};

contextBridge.exposeInMainWorld('desktopBridge', {
  getSystemInfo: () => systemInfo,
  getNowIso: () => new Date().toISOString(),
  getWorkspaceDirectory: () => ipcRenderer.invoke('workspace:get-directory'),
  changeWorkspaceDirectory: () => ipcRenderer.invoke('workspace:change-directory'),
  openWorkspaceDirectory: () => ipcRenderer.invoke('workspace:open-directory'),
  saveRecording: (buffer, mimeType) => ipcRenderer.invoke('recording:save', { buffer, mimeType }),
});
