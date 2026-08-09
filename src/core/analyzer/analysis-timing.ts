import type { AnalysisTiming } from './types.js'

export function mergeAnalysisTimings(program: AnalysisTiming, ai?: AnalysisTiming): AnalysisTiming {
  if (!ai) return { ...program, programTotalMs: program.programTotalMs ?? program.totalMs }
  const programTotalMs = program.programTotalMs ?? program.totalMs
  return {
    browserMs: program.browserMs,
    preparationMs: program.preparationMs,
    extractionMs: program.extractionMs,
    healthGateMs: program.healthGateMs,
    digestMs: ai.digestMs,
    imageSummaryMs: (program.imageSummaryMs || 0) + (ai.imageSummaryMs || 0),
    aiQueueMs: ai.aiQueueMs,
    aiNetworkMs: ai.aiNetworkMs,
    aiTransportAttempts: ai.aiTransportAttempts,
    aiInvokeMs: ai.aiInvokeMs,
    validationMs: ai.validationMs,
    programTotalMs,
    aiTotalMs: ai.aiTotalMs ?? ai.totalMs,
    totalMs: programTotalMs + ai.totalMs,
    aiInputTokens: ai.aiInputTokens,
    aiOutputTokens: ai.aiOutputTokens,
    imageCount: ai.imageCount,
    cacheHit: ai.cacheHit,
    digestChars: ai.digestChars,
    promptChars: ai.promptChars,
    budgetExceeded: [...new Set([...(program.budgetExceeded || []), ...(ai.budgetExceeded || [])])],
  }
}
