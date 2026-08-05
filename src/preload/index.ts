import { contextBridge, ipcRenderer } from 'electron'
import type { CallSheetApi } from '../shared/types'

const api: CallSheetApi = {
  getState: (refresh?: boolean) => ipcRenderer.invoke('state:get', refresh),
  launch: (appId: string) => ipcRenderer.invoke('app:launch', appId),
  openRepo: (appId: string) => ipcRenderer.invoke('app:openRepo', appId),
  openLatest: (appId: string) => ipcRenderer.invoke('app:openLatest', appId),
  reveal: (path: string) => ipcRenderer.invoke('path:reveal', path),
  openSuiteHub: () => ipcRenderer.invoke('hub:open'),
  getLoginItem: () => ipcRenderer.invoke('login:get'),
  setLoginItem: (open: boolean) => ipcRenderer.invoke('login:set', open),
  onStateChanged: (cb: () => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('state:changed', handler)
    return () => ipcRenderer.removeListener('state:changed', handler)
  }
}

contextBridge.exposeInMainWorld('callsheet', api)
