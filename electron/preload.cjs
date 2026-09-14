const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sunbirdDesktop', {
  runtimeInfo: () => ipcRenderer.invoke('sunbird:runtime-info'),
  openDouyin: () => ipcRenderer.invoke('sunbird:open-douyin'),
  syncDouyinSession: () => ipcRenderer.invoke('sunbird:sync-douyin-session'),
  getPiSettings: () => ipcRenderer.invoke('sunbird:get-pi-settings'),
  savePiSettings: (settings) => ipcRenderer.invoke('sunbird:save-pi-settings', settings),
  piPrompt: (payload) => ipcRenderer.invoke('sunbird:pi-prompt', payload)
})
