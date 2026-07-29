import { describe, expect, test } from 'vitest'

import { buildDesignTokens } from '../../src/core/analyzer/token-builder.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

describe('design token builder', () => {
  test('selects typography and effects using usageCount', () => {
    const commonShadow = '0 2px 8px rgb(0 0 0 / 20%)'
    const rareShadow = '0 1px 1px rgb(0 0 0 / 5%)'
    const styles = createExtractedStyles({
      fontFamilies: ['Arial, sans-serif', 'Inter, sans-serif'],
      fontSizes: ['12px', '16px', '24px'],
      fontWeights: ['400', '600'],
      lineHeights: ['20px', '24px'],
      shadows: [rareShadow, commonShadow],
      usageCount: {
        'fontFamily:Arial, sans-serif': 2,
        'fontFamily:Inter, sans-serif': 30,
        'fontSize:12px': 3,
        'fontSize:16px': 40,
        'fontSize:24px': 5,
        'fontWeight:400': 35,
        'fontWeight:600': 8,
        'lineHeight:20px': 2,
        'lineHeight:24px': 28,
        [`shadow:${rareShadow}`]: 1,
        [`shadow:${commonShadow}`]: 12,
      },
    })

    const tokens = buildDesignTokens(styles, {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })

    expect(tokens.typography.fontSizes[0]).toBe('1rem')
    expect(tokens.typography.fontWeights[0]).toBe('400')
    expect(tokens.typography.lineHeights[0]).toBe('1.5')
    expect(tokens.typography.fontStacks[0]).toBe('Inter, sans-serif')
    expect(tokens.shadows[0]).toBe(commonShadow)
  })
})
