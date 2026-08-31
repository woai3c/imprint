import { describe, expect, test } from 'vitest'

import { mergeInteractionStylePatterns } from '../../src/core/interaction-style.js'

describe('interaction style patterns', () => {
  test('deduplicates identical declarations across selectors while retaining provenance', () => {
    const target = {
      hover: [
        {
          before: {},
          after: { color: '#2563eb', 'background-color': '#eff6ff' },
          source: 'declared-applicable' as const,
          selector: '.first:hover',
        },
      ],
      focus: [],
      active: [],
    }
    const source = {
      hover: [
        {
          before: {},
          after: { 'background-color': '#eff6ff', color: '#2563eb' },
          source: 'declared-applicable' as const,
          selector: '.second:hover',
        },
      ],
      focus: [],
      active: [],
    }

    mergeInteractionStylePatterns(target, source)

    expect(target.hover).toHaveLength(1)
    expect(target.hover[0].selector).toBe('.first:hover, .second:hover')
  })
})
