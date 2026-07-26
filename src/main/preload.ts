import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,

  // Theme operations
  getThemes: () => ipcRenderer.invoke('themes:list'),
  getTheme: (id: string) => ipcRenderer.invoke('themes:get', id),
  deleteTheme: (id: string) => ipcRenderer.invoke('themes:delete', id),
  toggleFavorite: (id: string) => ipcRenderer.invoke('themes:toggleFavorite', id),

  // Analysis
  analyzeUrl: (url: string, options?: { viewports?: string[]; useSession?: boolean }) =>
    ipcRenderer.invoke('analyze:url', url, options),

  // Export
  exportTheme: (id: string, format: string) => ipcRenderer.invoke('export:theme', id, format),
  exportFile: (content: string, defaultName: string, ext: string) =>
    ipcRenderer.invoke('export:file', content, defaultName, ext),
  importTheme: () => ipcRenderer.invoke('import:theme'),

  // Save theme to library
  saveTheme: (data: {
    url: string
    tokens: Record<string, unknown>
    cssVariables: string
    tailwindTheme: string
    designDoc: string
    screenshots: string[]
  }) => ipcRenderer.invoke('themes:save', data),

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
