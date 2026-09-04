import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  LIVE_CORPUS_SITE_TIMEOUT_MS,
  parseLiveCorpusArguments,
  scheduleLiveCorpusSiteTimeout,
  validateLiveCorpusManifest,
} from '../../scripts/live-corpus.mjs'
import manifest from '../live-corpus/mainstream-20.json'

afterEach(() => vi.useRealTimers())

describe('live corpus runner contract', () => {
  test('keeps the public observation corpus fixed to two ten-site batches', () => {
    const parsed = validateLiveCorpusManifest(manifest)

    expect(parsed.sites).toHaveLength(20)
    expect(parsed.sites.filter((site) => site.batch === 1)).toHaveLength(10)
    expect(parsed.sites.filter((site) => site.batch === 2)).toHaveLength(10)
    expect(parsed.request).toMatchObject({ maxPages: 8, viewportStrategy: 'adaptive' })
  })

  test('enforces the ten-analysis concurrency ceiling', () => {
    expect(parseLiveCorpusArguments(['--batch', '1', '--concurrency', '10'])).toMatchObject({
      batch: '1',
      concurrency: 10,
      resume: true,
    })
    expect(() => parseLiveCorpusArguments(['--concurrency', '11'])).toThrow(/between 1 and 10/)
    expect(() => parseLiveCorpusArguments(['--batch', '3'])).toThrow(/1, 2, or all/)
  })

  test('aborts a site that would otherwise block the corpus indefinitely', () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    scheduleLiveCorpusSiteTimeout(controller, 'slow-site')

    vi.advanceTimersByTime(LIVE_CORPUS_SITE_TIMEOUT_MS)

    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toEqual(expect.objectContaining({ message: expect.stringContaining('slow-site') }))
  })
})
