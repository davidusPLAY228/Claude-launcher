const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  launchOmniRoute: (cfg) => ipcRenderer.invoke('launch:omniroute', cfg),
  launchClaude: (cfg) => ipcRenderer.invoke('launch:claude', cfg),
  checkDeps: () => ipcRenderer.invoke('check:deps'),
  installOmniRoute: () => ipcRenderer.invoke('install:omniroute'),
  installClaude: () => ipcRenderer.invoke('install:claude')
});
