const os = require('os');
const { contextBridge } = require('electron');

const systemInfo = {
  user: os.userInfo().username,
  platform: os.platform(),
  release: os.release(),
};

contextBridge.exposeInMainWorld('desktopBridge', {
  getSystemInfo: () => systemInfo,
  getNowIso: () => new Date().toISOString(),
});
