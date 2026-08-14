import { contextBridge, ipcRenderer } from 'electron'

import type { AppSettings, ElectronAPI, LoginRequiredEvent, RendererPerformanceSample } from '../shared/ipc-contract.js'

const api = {
  platform: process.platform,
  initialSettings: ipcRenderer.sendSync('settings:getSync') as AppSettings,

  // Saved website themes
  getThemes: () => ipcRenderer.invoke('themes:list'),
  getThemeArchive: () => ipcRenderer.invoke('themes:archive'),
  saveTheme: (analysisId: string, overwriteThemeId?: string) =>
    ipcRenderer.invoke('themes:save', analysisId, overwriteThemeId),
  renameTheme: (id: string, name: string) => ipcRenderer.invoke('themes:rename', id, name),
  deleteTheme: (id: string) => ipcRenderer.invoke('themes:delete', id),
  exportTheme: (id: string, format: string) => ipcRenderer.invoke('themes:export', id, format),

  // Analysis
  analyzeUrl: (
    url: string,
    options?: {
      viewports?: string[]
      maxPages?: number
      useSession?: boolean
      authMode?: 'auto' | 'anonymous' | 'managed'
      language?: string
      depth?: 'standard' | 'deep'
    },
  ) => ipcRenderer.invoke('analyze:url', url, options),
  cancelAnalysis: () => ipcRenderer.invoke('analysis:cancel'),
  startDesignIntelligence: (analysisId: string, language?: string) =>
    ipcRenderer.invoke('design-intelligence:start', analysisId, language),
  generateDesignExamples: (analysisId: string, language?: string) =>
    ipcRenderer.invoke('design-examples:start', analysisId, language),
  cancelDesignIntelligence: (analysisId: string) => ipcRenderer.invoke('design-intelligence:cancel', analysisId),
  skipDesignIntelligence: (analysisId: string) => ipcRenderer.invoke('design-intelligence:skip', analysisId),
  generateValidation: (analysisId: string, scenario: 'workflow' | 'content' | 'states') =>
    ipcRenderer.invoke('validation:start', analysisId, scenario),
  submitLoginDecision: (requestId: string, decision: 'continue' | 'anonymous' | 'cancel') =>
    ipcRenderer.invoke('analysis:loginDecision', requestId, decision),
  listBrowserSessions: () => ipcRenderer.invoke('browserSessions:list'),
  deleteBrowserSession: (id: string) => ipcRenderer.invoke('browserSessions:delete', id),
  clearBrowserSessions: () => ipcRenderer.invoke('browserSessions:clearAll'),

  // Export
  exportFile: (content: string, defaultName: string, ext: string) =>
    ipcRenderer.invoke('export:file', content, defaultName, ext),
  exportToDirectory: (files: Array<{ name: string; content: string }>, assets: string[], defaultDir: string) =>
    ipcRenderer.invoke('export:toDirectory', files, assets, defaultDir),
  openLogsFolder: () => ipcRenderer.invoke('app:openLogsFolder'),
  logEvent: (level: 'info' | 'warn' | 'error', message: string) => ipcRenderer.send('log:event', level, message),
  reportPerformance: (sample: RendererPerformanceSample) => ipcRenderer.send('performance:renderer-sample', sample),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('settings:save', settings),
  detectAgentClis: (force = false) => ipcRenderer.invoke('settings:detectAgentClis', force),
  testApiKey: (provider: string, apiKey: string, baseUrl?: string) =>
    ipcRenderer.invoke('settings:testApiKey', provider, apiKey, baseUrl),

  // History
  getAnalyses: () => ipcRenderer.invoke('analyses:list'),
  getAnalysisSummaries: () => ipcRenderer.invoke('analyses:listSummaries'),
  getAnalysisSummariesPage: (query = {}) => ipcRenderer.invoke('analyses:listSummariesPage', query),
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
  onDesignIntelligenceProgress: (callback: (progress: { step: string; percent: number }) => void) => {
    const handler = (_event: unknown, progress: { step: string; percent: number }) => callback(progress)
    ipcRenderer.on('design-intelligence:progress', handler)
    return () => ipcRenderer.removeListener('design-intelligence:progress', handler)
  },
  onLoginRequired: (callback: (request: LoginRequiredEvent) => void) => {
    const handler = (_event: unknown, request: LoginRequiredEvent) => callback(request)
    ipcRenderer.on('analysis:loginRequired', handler)
    return () => ipcRenderer.removeListener('analysis:loginRequired', handler)
  },
} satisfies ElectronAPI

contextBridge.exposeInMainWorld('electronAPI', api)
