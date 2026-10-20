const { contextBridge, ipcRenderer } = require('electron');
const invoke = name => data => ipcRenderer.invoke(name, data);
contextBridge.exposeInMainWorld('desktop', {
  load: invoke('workspace:load'), saveConnection: invoke('connection:save'), test: invoke('connection:test'),
  tables: invoke('connection:tables'),
  saveQuery: invoke('query:save'), remove: invoke('workspace:remove'), run: invoke('query:run'),
  export: invoke('query:export'), cancel: invoke('query:cancel'), openSQL: invoke('query:open'),
  showFile: invoke('file:show'),
  onProgress: callback => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('export:progress', listener);
    return () => ipcRenderer.removeListener('export:progress', listener);
  }
});
