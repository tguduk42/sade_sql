const { contextBridge, ipcRenderer } = require('electron');
const invoke = name => data => ipcRenderer.invoke(name, data);
contextBridge.exposeInMainWorld('desktop', {
  load: invoke('workspace:load'), saveConnection: invoke('connection:save'), test: invoke('connection:test'),
  tables: invoke('connection:tables'),
  saveQuery: invoke('query:save'), remove: invoke('workspace:remove'), run: invoke('query:run'),
  export: invoke('query:export'), cancel: invoke('query:cancel'), openSQL: invoke('query:open'),
  showFile: invoke('file:show'),
  updateState: invoke('update:state'), checkUpdate: invoke('update:check'),
  downloadUpdate: invoke('update:download'), restartUpdate: invoke('update:restart'),
  onUpdate: callback => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('update:state', listener);
    return () => ipcRenderer.removeListener('update:state', listener);
  },
  onProgress: callback => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('export:progress', listener);
    return () => ipcRenderer.removeListener('export:progress', listener);
  }
});
