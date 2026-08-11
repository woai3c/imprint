import { describe, expect, test } from 'vitest'

import { summarizeEvidenceLimitations } from '../../src/renderer/components/analyze/evidence-limitations.js'

describe('evidence limitation summaries', () => {
  test('shows one useful overflow limitation and hides its page-health diagnostic', () => {
    expect(
      summarizeEvidenceLimitations([
        'horizontal-overflow-observed',
        'page-health:horizontal-overflow@page-eaf6f4c06710',
      ]),
    ).toEqual([
      {
        limitation: 'horizontal-overflow-observed',
        translationKey: 'horizontalOverflow',
      },
    ])
  })

  test('collapses limitations that resolve to the same translated message', () => {
    expect(
      summarizeEvidenceLimitations([
        'some-safe-interactions-skipped',
        'safe-active-interactions-not-observed',
        'future-limitation-a',
        'future-limitation-b',
      ]),
    ).toEqual([
      {
        limitation: 'some-safe-interactions-skipped',
        translationKey: 'noActiveInteractions',
      },
      {
        limitation: 'future-limitation-a',
        translationKey: 'unknown',
      },
    ])
  })
})
