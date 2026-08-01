const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  launchOmniRoute: (cfg) => ipcRenderer.invoke('launch:omniroute', cfg),
  launchClaude: (cfg) => ipcRenderer.invoke('launch:claude', cfg),
  checkDeps: () => ipcRenderer.invoke('check:deps'),
  installOmniRoute: () => ipcRenderer.invoke('install:omniroute'),
  installClaude: () => ipcRenderer.invoke('install:claude'),
  stopAll: () => ipcRenderer.invoke('stop:all'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  checkOmniRouteStatus: () => ipcRenderer.invoke('check:omniroute-status')
});
