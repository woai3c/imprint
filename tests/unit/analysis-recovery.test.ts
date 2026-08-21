import { describe, expect, it } from 'vitest'

import { AnalysisRecoveryRegistry } from '../../src/main/analysis-recovery.js'

describe('AnalysisRecoveryRegistry', () => {
  it('retains progress and a completed response until the renderer acknowledges it', () => {
    const registry = new AnalysisRecoveryRegistry()
    const run = registry.start(7, 'https://example.com/')

    const progress = {
      step: 'progress.analyzingPage',
      percent: 62,
      analyzedPages: 2,
      discoveredPages: 4,
      resultReady: true,
      activeElapsedMs: 10_000,
    }
    registry.updateProgress(7, run, progress)
    expect(registry.recover(7)).toEqual({
      status: 'running',
      url: 'https://example.com/',
      progress,
    })

    registry.complete(7, run, {
      analysisId: 'analysis-a',
      url: 'https://example.com/',
      tokens: {},
      cssVariables: ':root {}',
      tailwindTheme: '@theme {}',
      designDoc: '# Design',
      screenshots: [],
      duration: 1200,
    })
    expect(registry.recover(7)).toMatchObject({
      status: 'complete',
      response: { analysisId: 'analysis-a' },
    })
    expect(registry.acknowledge(7)).toBe(true)
    expect(registry.recover(7)).toEqual({ status: 'idle' })
  })

  it('does not let a superseded analysis overwrite the current run', () => {
    const registry = new AnalysisRecoveryRegistry()
    const oldRun = registry.start(7, 'https://old.example/')
    const currentRun = registry.start(7, 'https://current.example/')

    registry.updateProgress(7, oldRun, {
      step: 'progress.done',
      percent: 100,
      analyzedPages: 1,
      discoveredPages: 1,
      resultReady: true,
      activeElapsedMs: 1_000,
    })
    registry.complete(7, oldRun, { cancelled: true })

    expect(registry.recover(7)).toEqual({ status: 'running', url: 'https://current.example/' })
    registry.remove(7, oldRun)
    expect(registry.recover(7)).toEqual({ status: 'running', url: 'https://current.example/' })

    registry.complete(7, currentRun, { cancelled: true })
    expect(registry.recover(7)).toEqual({
      status: 'complete',
      url: 'https://current.example/',
      response: { cancelled: true },
    })
  })
})
