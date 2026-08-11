import type { AnalysisTiming } from './types.js'

export function normalizedAnalysisDurationMs(timing?: Pick<AnalysisTiming, 'totalMs'>): number | null {
  if (!timing || !Number.isFinite(timing.totalMs) || timing.totalMs < 0) return null
  return Math.round(timing.totalMs)
}

export function mergeAnalysisTimings(
  program: AnalysisTiming,
  ai?: AnalysisTiming,
  interstageUserWaitMs = 0,
): AnalysisTiming {
  if (!ai) return { ...program, programTotalMs: program.programTotalMs ?? program.totalMs }
  const programTotalMs = program.programTotalMs ?? program.totalMs
  const aiTotalMs = ai.aiTotalMs ?? ai.totalMs
  return {
    browserMs: program.browserMs,
    preparationMs: program.preparationMs,
    extractionMs: program.extractionMs,
    healthGateMs: program.healthGateMs,
    screenshotCaptureMs: program.screenshotCaptureMs,
    imageFingerprintMs: program.imageFingerprintMs,
    digestMs: ai.digestMs,
    imageSummaryMs: (program.imageSummaryMs || 0) + (ai.imageSummaryMs || 0),
    aiQueueMs: ai.aiQueueMs,
    aiNetworkMs: ai.aiNetworkMs,
    aiTransportAttempts: ai.aiTransportAttempts,
    aiInvokeMs: ai.aiInvokeMs,
    validationMs: ai.validationMs,
    programTotalMs,
    aiTotalMs,
    userWaitMs: (program.userWaitMs || 0) + (ai.userWaitMs || 0) + Math.max(0, interstageUserWaitMs),
    totalMs: programTotalMs + aiTotalMs,
    aiInputTokens: ai.aiInputTokens,
    aiOutputTokens: ai.aiOutputTokens,
    imageCount: ai.imageCount,
    cacheHit: ai.cacheHit,
    digestChars: ai.digestChars,
    promptChars: ai.promptChars,
    budgetExceeded: [...new Set([...(program.budgetExceeded || []), ...(ai.budgetExceeded || [])])],
  }
}
