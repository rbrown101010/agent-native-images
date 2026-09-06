const { contextBridge, ipcRenderer } = require('electron');
const invoke = channel => async value => {
  const result = await ipcRenderer.invoke(channel, value);
  if (result.error) throw new Error(result.error);
  return result.value;
};
const on = channel => callback => { const listener = () => callback(); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); };
contextBridge.exposeInMainWorld('images', {
  search: invoke('search'), action: invoke('action'), library: invoke('library'), status: invoke('status'), configure: invoke('configure'),
  hide: invoke('hide'), downloads: invoke('downloads'), source: invoke('source'), forget: invoke('forget'), reveal: invoke('reveal'),
  onLibrary: on('library-changed'), onFocus: on('focus-search'), onSettings: on('open-settings'), onNewTab: on('new-tab'), onCloseTab: on('close-tab'),
});
