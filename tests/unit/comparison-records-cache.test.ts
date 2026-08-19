import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  invalidateComparisonRecords,
  loadComparisonRecords,
  peekComparisonRecords,
  removeComparisonRecords,
} from '../../src/renderer/lib/comparison-records-cache.js'
import type { AnalysisRecord } from '../../src/shared/ipc-contract.js'

function record(id: string): AnalysisRecord {
  return {
    id,
    theme_id: null,
    theme_name: null,
    site_name: `Site ${id}`,
    url: `https://example.com/${id}`,
    pages_analyzed: 1,
    viewports: '["desktop"]',
    duration_ms: 100,
    created_at: '2026-08-19T08:00:00.000Z',
    screenshot_path: null,
    route_identity: `https://example.com/${id}`,
  }
}

describe('comparison records cache', () => {
  beforeEach(() => {
    invalidateComparisonRecords()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads comparison records once and reuses them across consumers', async () => {
    const records = [record('one'), record('two')]
    const getAnalysisSummaries = vi.fn().mockResolvedValue(records)
    vi.stubGlobal('window', { electronAPI: { getAnalysisSummaries } })

    const [first, second] = await Promise.all([loadComparisonRecords(), loadComparisonRecords()])
    const reopened = await loadComparisonRecords()

    expect(getAnalysisSummaries).toHaveBeenCalledTimes(1)
    expect(first).toBe(records)
    expect(second).toBe(records)
    expect(reopened).toBe(records)
    expect(peekComparisonRecords()).toBe(records)
  })

  it('updates deleted records in place without another load', async () => {
    const records = [record('one'), record('two')]
    const getAnalysisSummaries = vi.fn().mockResolvedValue(records)
    vi.stubGlobal('window', { electronAPI: { getAnalysisSummaries } })

    await loadComparisonRecords()
    removeComparisonRecords(['one'])

    expect((await loadComparisonRecords()).map(({ id }) => id)).toEqual(['two'])
    expect(getAnalysisSummaries).toHaveBeenCalledTimes(1)
  })

  it('reloads after a successful analysis invalidates the cache', async () => {
    const getAnalysisSummaries = vi
      .fn()
      .mockResolvedValueOnce([record('one')])
      .mockResolvedValueOnce([record('one'), record('two')])
    vi.stubGlobal('window', { electronAPI: { getAnalysisSummaries } })

    await loadComparisonRecords()
    invalidateComparisonRecords()
    const refreshed = await loadComparisonRecords()

    expect(refreshed.map(({ id }) => id)).toEqual(['one', 'two'])
    expect(getAnalysisSummaries).toHaveBeenCalledTimes(2)
  })
})
