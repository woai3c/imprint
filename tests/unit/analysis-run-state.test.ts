import { afterEach, describe, expect, it, vi } from 'vitest'

import { AnalysisRunState } from '../../src/core/analyzer/analysis-run-state.js'
import type { AnalysisProgress } from '../../src/core/analyzer/types.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('AnalysisRunState', () => {
  it('deduplicates page identities and reports progress from one state owner', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const reports: AnalysisProgress[] = []
    const state = new AnalysisRunState({
      startTime: 1_000,
      onProgress: (progress) => reports.push(progress),
      canFinishPartially: () => true,
      ensureActive: () => {},
    })

    state.setDiscoveredPageCount(3)
    vi.setSystemTime(1_500)
    state.markPageReady('https://user:secret@example.com/products?campaign=a#details')
    state.markPageReady('https://example.com/products?campaign=b')

    expect(state.analyzedPageCount).toBe(1)
    expect(reports.at(-1)).toMatchObject({
      analyzedPages: 1,
      discoveredPages: 3,
      resultReady: true,
      activeElapsedMs: 500,
    })
  })

  it('excludes user wait and owns measured timing and budget markers', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000)
    let activeChecks = 0
    const state = new AnalysisRunState({
      startTime: 1_000,
      canFinishPartially: () => false,
      ensureActive: () => {
        activeChecks += 1
      },
    })
    state.addUserWait(400)

    const measured = await state.measure('extractionMs', async () => {
      vi.setSystemTime(2_250)
      return 'captured'
    })
    state.addTiming('preparationMs', 100_001)
    state.finalizeTiming(4)

    expect(measured).toBe('captured')
    expect(activeChecks).toBe(2)
    expect(state.timing).toMatchObject({
      extractionMs: 250,
      preparationMs: 100_001,
      imageCount: 4,
      totalMs: 850,
      userWaitMs: 400,
      budgetExceeded: ['preparation'],
    })
  })
})
