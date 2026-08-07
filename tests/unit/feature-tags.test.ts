import { describe, expect, test } from 'vitest'

import { generateFeatureTags } from '../../src/core/analyzer/feature-tags.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

function tokens(overrides: Partial<DesignToken> = {}): DesignToken {
  return {
    colors: { background: '#ffffff', foreground: '#111111', primary: '#1772f6' },
    typography: {
      fontFamilies: ['Inter'],
      fontStacks: ['Inter, sans-serif'],
      fontSizes: ['16px'],
      fontWeights: ['400'],
      lineHeights: ['1.5'],
      letterSpacings: [],
    },
    spacing: [],
    radii: [],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
    ...overrides,
  }
}

describe('design feature tags', () => {
  test('uses the observed radius distribution instead of pill and avatar sentinels', () => {
    const designTokens = tokens({ radii: ['2px', '3px', '4px', '100%', '9999px'] })
    const styles = createExtractedStyles({
      usageCount: {
        'radius:2px': 54,
        'radius:3px': 66,
        'radius:4px': 45,
        'radius:100%': 4,
        'radius:9999px': 16,
      },
    })

    const tags = generateFeatureTags(designTokens, styles)
    expect(tags).toContain('sharp-edge geometric style')
    expect(tags).not.toContain('large-radius rounded style')
  })

  test('requires materially different shadow elevations before calling the system layered', () => {
    const subtle = tokens({
      shadows: [
        'rgba(0, 0, 0, 0.1) 0px 1px 3px 0px',
        'oklch(0 0 0 / 0.1) 0px 1px 3px 0px',
        'rgba(26, 26, 26, 0.1) 0px 1px 3px 0px',
      ],
    })
    expect(generateFeatureTags(subtle, createExtractedStyles())).not.toContain('layered elevation system')

    const layered = tokens({
      shadows: ['0 1px 2px rgba(0, 0, 0, 0.08)', '0 4px 12px rgba(0, 0, 0, 0.12)', '0 12px 32px rgba(0, 0, 0, 0.18)'],
    })
    expect(generateFeatureTags(layered, createExtractedStyles())).toContain('layered elevation system')
  })
})
