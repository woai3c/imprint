import { describe, expect, test } from 'vitest'

import { analyze } from '../../src/core/analyzer/index.js'

describe('analysis cancellation', () => {
  test('stops before launching a browser when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      analyze('https://example.com', {
        dataDir: '/unused-imprint-analysis-data',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
