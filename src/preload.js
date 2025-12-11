const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const { pathToFileURL } = require('url');

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

const getDependencySearchRoots = () => {
  if (!pathModule) {
    return [];
  }
  // Worktree配下で起動すると app パス直下に node_modules が無いので、探索パスを明示して解決する
  return [
    __dirname,
    pathModule.resolve(__dirname, '..'),
    pathModule.resolve(__dirname, '..', '..'),
    pathModule.resolve(__dirname, '..', '..', '..'),
    process.cwd(),
    process.resourcesPath,
  ].filter(Boolean);
};

const resolveDependencyPath = (name) => {
  if (!pathModule) {
    return require.resolve(name);
  }

  const searchRoots = getDependencySearchRoots();
  let lastError = null;
  for (const base of searchRoots) {
    try {
      return require.resolve(name, { paths: [base] });
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }
  return null;
};

const resolveDependency = (name) => {
  if (!pathModule) {
    return require(name);
  }

  const searchRoots = getDependencySearchRoots();
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

let threeModuleUrl = null;

const getThreeModuleUrl = () => {
  if (threeModuleUrl) {
    return threeModuleUrl;
  }
  if (!pathModule) {
    return null;
  }
  try {
    const resolvedEntryPath = resolveDependencyPath('three');
    const entryDir = pathModule.dirname(resolvedEntryPath);
    const pkgDir = pathModule.basename(entryDir) === 'build'
      ? pathModule.dirname(entryDir)
      : entryDir;
    const modulePath = pathModule.join(pkgDir, 'build', 'three.module.js');
    if (!fs.existsSync(modulePath)) {
      throw new Error(`three.module.js が見つかりません: ${modulePath}`);
    }
    threeModuleUrl = pathToFileURL(modulePath).toString();
    return threeModuleUrl;
  } catch (error) {
    console.error('three.js の読み込みに失敗しました', error);
    return null;
  }
};

const subscribeWorkspaceGraphUpdates = (handler) => {
  if (typeof handler !== 'function') {
    return () => {};
  }
  const wrapped = (_event, payload) => handler(payload);
  ipcRenderer.on('workspace:graph-updated', wrapped);
  return () => ipcRenderer.removeListener('workspace:graph-updated', wrapped);
};

contextBridge.exposeInMainWorld('desktopBridge', {
  getSystemInfo: () => systemInfo,
  getNowIso: () => new Date().toISOString(),
  getWorkspaceDirectory: () => ipcRenderer.invoke('workspace:get-directory'),
  changeWorkspaceDirectory: () => ipcRenderer.invoke('workspace:change-directory'),
  openWorkspaceDirectory: () => ipcRenderer.invoke('workspace:open-directory'),
  openWorkspaceEntry: (entryId) => ipcRenderer.invoke('workspace:open-entry', entryId),
  openWorkspaceEntryDirectory: (entryId) => ipcRenderer.invoke('workspace:open-entry-directory', entryId),
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
  ensureSwMenuSetup: () => ipcRenderer.invoke('sw-menu:init'),
  getSwMenuStatus: () => ipcRenderer.invoke('sw-menu:status'),
  getSwMenuOverview: () => ipcRenderer.invoke('sw-menu:overview'),
  getSwMenuComponentSuggestions: () => ipcRenderer.invoke('sw-menu:suggestions'),
  upsertSwComponent: (component) => ipcRenderer.invoke('sw-menu:upsert-component', component),
  importSwComponentsFromCsv: (csvText) => ipcRenderer.invoke('sw-menu:import-components', csvText),
  upsertSwBomBatch: (boms) => ipcRenderer.invoke('sw-menu:upsert-bom-batch', boms),
  upsertSwBom: (bom) => ipcRenderer.invoke('sw-menu:upsert-bom', bom),
  recordSwFlow: (flow) => ipcRenderer.invoke('sw-menu:record-flow', flow),
  getThreeModuleUrl: () => getThreeModuleUrl(),
  onWorkspaceGraphUpdated: (handler) => subscribeWorkspaceGraphUpdates(handler),
});
