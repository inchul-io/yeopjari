const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (cb) => ipcRenderer.on(ch, (e, data) => cb(data));

contextBridge.exposeInMainWorld('yeop', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (c) => ipcRenderer.invoke('save-config', c),
  newCode: () => ipcRenderer.invoke('new-code'),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getChatKeys: () => ipcRenderer.invoke('get-chat-keys'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistory: (entry) => ipcRenderer.send('add-history', entry),
  setIgnore: (v) => ipcRenderer.send('set-ignore', v),
  sendFromHistory: (text) => ipcRenderer.send('send-from-history', text),
  openHistory: () => ipcRenderer.send('open-history'),
  openSetup: () => ipcRenderer.send('open-setup'),
  onOpenInput: on('open-input'),
  onQuiet: on('quiet'),
  onMyStatus: on('my-status'),
  onSendText: on('send-text'),
  onGoingOffline: on('going-offline'),
  onHistory: on('history'),
  onUpdated: on('updated'),
});
