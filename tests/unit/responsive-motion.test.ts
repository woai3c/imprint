import { describe, expect, test } from 'vitest'

import { labelBreakpointWidths } from '../../src/core/analyzer/responsive-motion.js'

describe('responsive breakpoint labels', () => {
  test('keeps every detected width addressable when several share a category', () => {
    expect(labelBreakpointWidths([320, 640, 660, 768, 1024, 1440])).toEqual([
      { width: 320, label: 'mobile' },
      { width: 640, label: 'tablet-sm-640' },
      { width: 660, label: 'tablet-sm-660' },
      { width: 768, label: 'tablet-sm-768' },
      { width: 1024, label: 'tablet' },
      { width: 1440, label: 'wide' },
    ])
  })
})
