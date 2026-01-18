import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Setup related
  decryptEnvFile: (encryptedContent: string, password: string) =>
    ipcRenderer.invoke('decrypt-env-file', encryptedContent, password),
  saveTokens: (botToken: string, appToken: string) =>
    ipcRenderer.invoke('save-tokens', botToken, appToken),
  isSetupComplete: () => ipcRenderer.invoke('is-setup-complete'),

  // Thread related
  getRecentThreads: () => ipcRenderer.invoke('get-recent-threads'),
  startOverlay: (threadUrl: string) => ipcRenderer.invoke('start-overlay', threadUrl),
  stopOverlay: () => ipcRenderer.invoke('stop-overlay'),

  // App related
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // Events
  onStatusChange: (callback: (status: string) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, status: string) => callback(status)
    ipcRenderer.on('status-change', subscription)
    return () => ipcRenderer.removeListener('status-change', subscription)
  },
  onUpdateAvailable: (callback: (info: unknown) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, info: unknown) => callback(info)
    ipcRenderer.on('update-available', subscription)
    return () => ipcRenderer.removeListener('update-available', subscription)
  },
})
