import { describe, expect, test } from 'vitest'

import {
  labelBreakpointWidths,
  mergeMotionTokens,
  mergeResponsiveBreakpoints,
} from '../../src/core/analyzer/responsive-motion.js'

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

  test('merges breakpoint and motion evidence across pages without duplicates', () => {
    expect(
      mergeResponsiveBreakpoints([
        [{ width: 640, label: 'tablet-sm', layoutChanges: ['stack'] }],
        [
          { width: 640, label: 'tablet-sm', layoutChanges: ['hide-nav'] },
          { width: 1024, label: 'tablet', layoutChanges: [] },
        ],
      ]),
    ).toEqual([
      { width: 640, label: 'tablet-sm', layoutChanges: ['stack', 'hide-nav'] },
      { width: 1024, label: 'tablet', layoutChanges: [] },
    ])

    expect(
      mergeMotionTokens([
        [{ property: 'opacity', duration: '0.2s', easing: 'ease', count: 2 }],
        [{ property: 'opacity', duration: '0.2s', easing: 'ease', count: 3 }],
      ]),
    ).toEqual([{ property: 'opacity', duration: '0.2s', easing: 'ease', count: 5 }])
  })
})
