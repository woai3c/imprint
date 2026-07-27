import { create } from 'zustand'

import { getAnalysisPageCountPreference, setAnalysisPageCountPreference } from '../lib/preferences'

export interface AnalysisResultData {
  tokens: Record<string, unknown>
  cssVariables: string
  tailwindTheme: string
  designDoc: string
  screenshots: string[]
  pageScreenshots?: Array<{ url: string; path: string; viewport: string }>
  duration: number
  url: string
  hasDarkMode?: boolean
  darkModeMethod?: string
  featureTags?: string[]
  darkTokens?: Record<string, string> | null
  breakpoints?: Array<{ width: number; label: string }>
  accessMode?: 'anonymous' | 'managed'
  authWallDetected?: boolean
  finalUrl?: string
}

export interface AnalysisFailure {
  message: string
  url: string
  authMode: 'auto' | 'anonymous' | 'managed'
  stage?: string
}

interface AnalysisStore {
  lastResult: AnalysisResultData | null
  lastUrl: string
  pageCount: number
  failure: AnalysisFailure | null
  analyzing: boolean
  progress: { step: string; percent: number } | null
  setResult: (result: AnalysisResultData, url: string) => void
  setFailure: (failure: AnalysisFailure | null) => void
  setAnalyzing: (v: boolean) => void
  setProgress: (p: { step: string; percent: number } | null) => void
  setUrl: (url: string) => void
  setPageCount: (pageCount: number) => void
  clear: () => void
}

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  lastResult: null,
  lastUrl: '',
  pageCount: getAnalysisPageCountPreference(),
  failure: null,
  analyzing: false,
  progress: null,
  setResult: (result, url) =>
    set({ lastResult: result, lastUrl: url, failure: null, analyzing: false, progress: null }),
  setFailure: (failure) => set({ failure, analyzing: false, progress: null }),
  setAnalyzing: (v) => set({ analyzing: v }),
  setProgress: (p) => set({ progress: p }),
  setUrl: (url) => set({ lastUrl: url }),
  setPageCount: (pageCount) => set({ pageCount: setAnalysisPageCountPreference(pageCount) }),
  clear: () => set({ lastResult: null, lastUrl: '', failure: null, analyzing: false, progress: null }),
}))
