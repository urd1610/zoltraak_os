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
  getAiMailStatus: () => ipcRenderer.invoke('ai-mail:get-status'),
  startAiMailMonitor: () => ipcRenderer.invoke('ai-mail:start'),
  stopAiMailMonitor: () => ipcRenderer.invoke('ai-mail:stop'),
  refreshAiMailStatus: () => ipcRenderer.invoke('ai-mail:refresh'),
  fetchAiMailOnce: () => ipcRenderer.invoke('ai-mail:fetch-once'),
  updateAiMailForward: (forwardTo) => ipcRenderer.invoke('ai-mail:update-forward', forwardTo),
});
