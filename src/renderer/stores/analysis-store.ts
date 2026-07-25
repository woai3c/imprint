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
}

interface AnalysisStore {
  lastResult: AnalysisResultData | null
  lastUrl: string
  setResult: (result: AnalysisResultData, url: string) => void
  clear: () => void
}

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  lastResult: null,
  lastUrl: '',
  setResult: (result, url) => set({ lastResult: result, lastUrl: url }),
  clear: () => set({ lastResult: null, lastUrl: '' }),
}))
