import { create } from 'zustand'

export interface AnalysisResultData {
  tokens: Record<string, unknown>
  cssVariables: string
  tailwindTheme: string
  designDoc: string
  screenshots: string[]
  duration: number
  url: string
  hasDarkMode?: boolean
  darkModeMethod?: string
  featureTags?: string[]
  darkTokens?: Record<string, string> | null
  breakpoints?: Array<{ width: number; label: string }>
}

interface AnalysisStore {
  lastResult: AnalysisResultData | null
  lastUrl: string
  analyzing: boolean
  progress: { step: string; percent: number } | null
  setResult: (result: AnalysisResultData, url: string) => void
  setAnalyzing: (v: boolean) => void
  setProgress: (p: { step: string; percent: number } | null) => void
  setUrl: (url: string) => void
  clear: () => void
}

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  lastResult: null,
  lastUrl: '',
  analyzing: false,
  progress: null,
  setResult: (result, url) => set({ lastResult: result, lastUrl: url, analyzing: false, progress: null }),
  setAnalyzing: (v) => set({ analyzing: v }),
  setProgress: (p) => set({ progress: p }),
  setUrl: (url) => set({ lastUrl: url }),
  clear: () => set({ lastResult: null, lastUrl: '', analyzing: false, progress: null }),
}))
