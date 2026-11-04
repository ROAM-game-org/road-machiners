import { contextBridge, ipcRenderer } from 'electron';

const call = (name: string) => (...args: unknown[]) => ipcRenderer.invoke(`roam:saves:${name}`, ...args);

contextBridge.exposeInMainWorld('roamDesktop', {
  kind: 'desktop',
  saves: {
    readAll: call('readAll'),
    put: call('put'),
    remove: call('remove'),
    appendLog: call('appendLog'),
    readLog: call('readLog'),
  },
});
