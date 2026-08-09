import { describe, expect, it } from 'vitest'

import { mergeAnalysisTimings } from '../../src/core/analyzer/analysis-timing.js'
import type { AnalysisTiming } from '../../src/core/analyzer/types.js'

function timing(overrides: Partial<AnalysisTiming>): AnalysisTiming {
  return {
    digestMs: 0,
    imageSummaryMs: 0,
    aiInvokeMs: 0,
    validationMs: 0,
    totalMs: 0,
    imageCount: 0,
    cacheHit: false,
    ...overrides,
  }
}

describe('analysis timing aggregation', () => {
  it('keeps program and AI timing distinct while exposing an end-to-end total', () => {
    const merged = mergeAnalysisTimings(
      timing({
        totalMs: 70_000,
        browserMs: 20_000,
        preparationMs: 8_000,
        extractionMs: 40_000,
        imageSummaryMs: 2_000,
        budgetExceeded: ['adaptive-mobile'],
      }),
      timing({
        totalMs: 180_000,
        aiTotalMs: 180_000,
        digestMs: 1_000,
        aiInvokeMs: 175_000,
        aiNetworkMs: 170_000,
        validationMs: 4_000,
        aiTransportAttempts: 2,
        aiInputTokens: 8_000,
        aiOutputTokens: 1_500,
        imageCount: 1,
      }),
    )

    expect(merged.programTotalMs).toBe(70_000)
    expect(merged.aiTotalMs).toBe(180_000)
    expect(merged.totalMs).toBe(250_000)
    expect(merged.aiNetworkMs).toBe(170_000)
    expect(merged.aiTransportAttempts).toBe(2)
    expect(merged.budgetExceeded).toEqual(['adaptive-mobile'])

    const rerun = mergeAnalysisTimings(merged, timing({ totalMs: 10_000, aiTotalMs: 10_000 }))
    expect(rerun.programTotalMs).toBe(70_000)
    expect(rerun.totalMs).toBe(80_000)
  })
})
