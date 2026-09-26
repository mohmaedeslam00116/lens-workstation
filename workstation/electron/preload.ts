import { contextBridge, ipcRenderer } from 'electron';

// Expose safe, context-isolated native bridges
contextBridge.exposeInMainWorld('electronStorage', {
  get: (key: string) => ipcRenderer.invoke('storage:get', key),
  set: (key: string, value: unknown) => ipcRenderer.invoke('storage:set', key, value),
  delete: (key: string) => ipcRenderer.invoke('storage:delete', key),
});

contextBridge.exposeInMainWorld('electronNotifications', {
  show: (title: string, body: string) => ipcRenderer.invoke('notification:show', { title, body }),
});

contextBridge.exposeInMainWorld('electronDialogs', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
});

contextBridge.exposeInMainWorld('electronShell', {
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
});
