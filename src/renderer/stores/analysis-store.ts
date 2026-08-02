import { create } from 'zustand'

import type { AnalysisResultData } from '../../shared/ipc-contract'
import { getAnalysisPageCountPreference, setAnalysisPageCountPreference } from '../lib/preferences'

export type { AnalysisResultData } from '../../shared/ipc-contract'

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
  intelligenceRunning: boolean
  intelligenceProgress: { step: string; percent: number } | null
  setResult: (result: AnalysisResultData, url: string) => void
  mergeResult: (result: Partial<AnalysisResultData>) => void
  setFailure: (failure: AnalysisFailure | null) => void
  setAnalyzing: (v: boolean) => void
  setProgress: (p: { step: string; percent: number } | null) => void
  setIntelligenceRunning: (v: boolean) => void
  setIntelligenceProgress: (p: { step: string; percent: number } | null) => void
  setUrl: (url: string) => void
  setPageCount: (pageCount: number) => void
  clearResult: () => void
}

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  lastResult: null,
  lastUrl: '',
  pageCount: getAnalysisPageCountPreference(),
  failure: null,
  analyzing: false,
  progress: null,
  intelligenceRunning: false,
  intelligenceProgress: null,
  setResult: (result, url) =>
    set({
      lastResult: result,
      lastUrl: url,
      failure: null,
      analyzing: false,
      progress: null,
      intelligenceRunning: false,
      intelligenceProgress: null,
    }),
  mergeResult: (result) =>
    set((state) => {
      if (!state.lastResult) return state
      if (result.analysisId && state.lastResult.analysisId && result.analysisId !== state.lastResult.analysisId) {
        return state
      }
      return { lastResult: { ...state.lastResult, ...result } }
    }),
  setFailure: (failure) => set({ failure, analyzing: false, progress: null }),
  setAnalyzing: (v) => set({ analyzing: v }),
  setProgress: (p) => set({ progress: p }),
  setIntelligenceRunning: (v) => set({ intelligenceRunning: v }),
  setIntelligenceProgress: (p) => set({ intelligenceProgress: p }),
  setUrl: (url) => set({ lastUrl: url }),
  setPageCount: (pageCount) => set({ pageCount: setAnalysisPageCountPreference(pageCount) }),
  clearResult: () => set({ lastResult: null, failure: null, intelligenceRunning: false, intelligenceProgress: null }),
}))
