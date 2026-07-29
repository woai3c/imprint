import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,

  // Theme operations
  getThemes: () => ipcRenderer.invoke('themes:list'),
  getTheme: (id: string) => ipcRenderer.invoke('themes:get', id),
  deleteTheme: (id: string) => ipcRenderer.invoke('themes:delete', id),
  toggleFavorite: (id: string) => ipcRenderer.invoke('themes:toggleFavorite', id),

  // Analysis
  analyzeUrl: (
    url: string,
    options?: {
      viewports?: string[]
      maxPages?: number
      useSession?: boolean
      authMode?: 'auto' | 'anonymous' | 'managed'
      language?: string
    },
  ) => ipcRenderer.invoke('analyze:url', url, options),
  submitLoginDecision: (requestId: string, decision: 'continue' | 'anonymous' | 'cancel') =>
    ipcRenderer.invoke('analysis:loginDecision', requestId, decision),
  listBrowserSessions: () => ipcRenderer.invoke('browserSessions:list'),
  deleteBrowserSession: (id: string) => ipcRenderer.invoke('browserSessions:delete', id),
  clearBrowserSessions: () => ipcRenderer.invoke('browserSessions:clearAll'),

  // Export
  exportTheme: (id: string, format: string) => ipcRenderer.invoke('export:theme', id, format),
  exportFile: (content: string, defaultName: string, ext: string) =>
    ipcRenderer.invoke('export:file', content, defaultName, ext),
  exportToDirectory: (files: Array<{ name: string; content: string }>, assets: string[], defaultDir: string) =>
    ipcRenderer.invoke('export:toDirectory', files, assets, defaultDir),
  importTheme: (language?: string) => ipcRenderer.invoke('import:theme', language),
  openLogsFolder: () => ipcRenderer.invoke('app:openLogsFolder'),
  logEvent: (level: 'info' | 'warn' | 'error', message: string) => ipcRenderer.send('log:event', level, message),

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
  getAnalysis: (id: string) => ipcRenderer.invoke('analyses:get', id),
  deleteAnalysis: (id: string) => ipcRenderer.invoke('analyses:delete', id),
  deleteAnalyses: (ids: string[]) => ipcRenderer.invoke('analyses:deleteMany', ids),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Progress events
  onAnalysisProgress: (callback: (progress: { step: string; percent: number }) => void) => {
    const handler = (_event: unknown, progress: { step: string; percent: number }) => callback(progress)
    ipcRenderer.on('analysis:progress', handler)
    return () => ipcRenderer.removeListener('analysis:progress', handler)
  },
  onLoginRequired: (
    callback: (request: {
      requestId: string
      detection: {
        detected: boolean
        confidence: 'low' | 'medium' | 'high'
        reasons: string[]
        finalUrl: string
      }
      retry: boolean
    }) => void,
  ) => {
    const handler = (
      _event: unknown,
      request: {
        requestId: string
        detection: {
          detected: boolean
          confidence: 'low' | 'medium' | 'high'
          reasons: string[]
          finalUrl: string
        }
        retry: boolean
      },
    ) => callback(request)
    ipcRenderer.on('analysis:loginRequired', handler)
    return () => ipcRenderer.removeListener('analysis:loginRequired', handler)
  },
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
