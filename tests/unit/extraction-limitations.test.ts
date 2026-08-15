import { describe, expect, it } from 'vitest'

import {
  appendExtractionIssueLimitation,
  appendFailedCaptureHealthLimitations,
  isPageHealthExtractionIssue,
} from '../../src/core/analyzer/extraction-limitations.js'

describe('extraction limitations', () => {
  it('publishes health details only when their capture failed', () => {
    const limitations: string[] = []
    const initialHealthIssue = {
      stage: 'page-2:mobile-adaptive:health:horizontal-overflow',
      reason: '375/3686',
    }
    const captureHealthIssue = {
      stage: 'page-2:mobile-adaptive:capture-health:content-width',
      reason: 'viewport 375, content 3686',
    }

    expect(isPageHealthExtractionIssue(initialHealthIssue)).toBe(true)
    expect(isPageHealthExtractionIssue(captureHealthIssue)).toBe(true)
    appendExtractionIssueLimitation(limitations, initialHealthIssue)
    expect(limitations).toEqual([])

    appendFailedCaptureHealthLimitations(limitations, [
      { stage: 'page-2:mobile-adaptive:styles', reason: 'not a health issue' },
      initialHealthIssue,
      captureHealthIssue,
    ])

    expect(limitations).toEqual([
      'extraction-issue:page-2%3Amobile-adaptive%3Ahealth%3Ahorizontal-overflow:375%2F3686',
      'extraction-issue:page-2%3Amobile-adaptive%3Acapture-health%3Acontent-width:viewport%20375%2C%20content%203686',
    ])
  })
})
