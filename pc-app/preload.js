const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  deleteFile: (name) => ipcRenderer.invoke('delete-file', name),
  listFiles: () => ipcRenderer.invoke('list-files'),
  getAppPath: () => ipcRenderer.invoke('get-app-path')
});
