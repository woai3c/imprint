import type { AnalysisTiming } from './types.js'

export function normalizedAnalysisDurationMs(timing?: Pick<AnalysisTiming, 'totalMs'>): number | null {
  if (!timing || !Number.isFinite(timing.totalMs) || timing.totalMs < 0) return null
  return Math.round(timing.totalMs)
}
