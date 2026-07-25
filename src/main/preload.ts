import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Theme operations
  getThemes: () => ipcRenderer.invoke('themes:list'),
  getTheme: (id: string) => ipcRenderer.invoke('themes:get', id),
  deleteTheme: (id: string) => ipcRenderer.invoke('themes:delete', id),
  toggleFavorite: (id: string) => ipcRenderer.invoke('themes:toggleFavorite', id),

  // Analysis
  analyzeUrl: (url: string, options?: { viewports?: string[] }) => ipcRenderer.invoke('analyze:url', url, options),

  // Export
  exportTheme: (id: string, format: string) => ipcRenderer.invoke('export:theme', id, format),
  importTheme: () => ipcRenderer.invoke('import:theme'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('settings:save', settings),
  detectAgentClis: () => ipcRenderer.invoke('settings:detectAgentClis'),
  testApiKey: (provider: string, apiKey: string) => ipcRenderer.invoke('settings:testApiKey', provider, apiKey),

  // History
  getAnalyses: () => ipcRenderer.invoke('analyses:list'),
  deleteAnalysis: (id: string) => ipcRenderer.invoke('analyses:delete', id),

  // Progress events
  onAnalysisProgress: (callback: (progress: { step: string; percent: number }) => void) => {
    const handler = (_event: unknown, progress: { step: string; percent: number }) => callback(progress)
    ipcRenderer.on('analysis:progress', handler)
    return () => ipcRenderer.removeListener('analysis:progress', handler)
  },
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
