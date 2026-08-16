import { describe, expect, it } from 'vitest'

import { normalizedAnalysisDurationMs } from '../../src/core/analyzer/analysis-timing.js'

describe('analysis timing', () => {
  it('normalizes persisted duration from deterministic analysis timing', () => {
    expect(normalizedAnalysisDurationMs({ totalMs: 158_303.6 })).toBe(158_304)
    expect(normalizedAnalysisDurationMs({ totalMs: Number.NaN })).toBeNull()
    expect(normalizedAnalysisDurationMs({ totalMs: -1 })).toBeNull()
  })
})
