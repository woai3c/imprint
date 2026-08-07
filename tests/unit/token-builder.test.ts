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
      transitions: ['0.3s', '0.15s', '200ms'],
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
        'typeMetric:12px|20px': 3,
        'typeMetric:16px|24px': 28,
        'typeMetric:24px|24px': 5,
        [`shadow:${rareShadow}`]: 1,
        [`shadow:${commonShadow}`]: 12,
        'transition:0.3s': 20,
        'transition:0.15s': 2,
        'transition:200ms': 10,
      },
    })

    const tokens = buildDesignTokens(styles, {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })

    expect(tokens.typography.fontSizes).toEqual(['0.75rem', '1rem', '1.5rem'])
    expect(tokens.typography.fontWeights[0]).toBe('400')
    expect(tokens.typography.lineHeights).toEqual(['1', '1.5', '1.667'])
    expect(tokens.typography.fontStacks[0]).toBe('Inter, sans-serif')
    expect(tokens.shadows).toEqual([rareShadow, commonShadow])
    expect(tokens.transitions).toEqual(['0.15s', '200ms', '0.3s'])
  })

  test('uses directly rendered text coverage instead of nested element counts for the primary font', () => {
    const styles = createExtractedStyles({
      fontFamilies: ['Display Face, sans-serif', 'Reading Face, sans-serif'],
      usageCount: {
        'fontFamily:Display Face, sans-serif': 40,
        'fontFamily:Reading Face, sans-serif': 4,
        'fontTextFamily:Display Face, sans-serif': 20,
        'fontTextFamily:Reading Face, sans-serif': 600,
      },
    })
    const tokens = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(tokens.typography.fontFamilies[0]).toBe('Reading Face')
  })

  test('does not promote a distant brand block to the neutral surface role', () => {
    const styles = createExtractedStyles()
    const tokens = buildDesignTokens(styles, {
      palette: [
        { hex: '#ffffff', count: 10 },
        { hex: '#ffff00', count: 2 },
      ],
      backgrounds: ['#ffffff', '#ffff00'],
      texts: ['#000000'],
      accents: ['#ffff00'],
    })

    expect(tokens.colors.background).toBe('#ffffff')
    expect(tokens.colors.surface).toBeUndefined()
    expect(tokens.colors.secondary).toBeUndefined()
    expect(tokens.colors.primary).toBe('#ffff00')
  })

  test('uses a related observed surface as the semantic secondary instead of a second action hue', () => {
    const tokens = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: ['#ffffff', '#f5f5f5'],
      texts: ['#111827'],
      accents: ['#0057d9', '#7c3aed'],
    })

    expect(tokens.colors.surface).toBe('#f5f5f5')
    expect(tokens.colors.secondary).toBe('#f5f5f5')
    expect(tokens.colors.primary).toBe('#0057d9')
    expect(tokens.colors.accent).toBe('#7c3aed')
  })

  test('keeps inverted action text out of the muted foreground role', () => {
    const tokens = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: ['#ffffff'],
      texts: ['#000000', '#ffffff', '#57606a'],
      accents: ['#0969da'],
    })

    expect(tokens.colors.foreground).toBe('#000000')
    expect(tokens.colors['muted-foreground']).toBe('#57606a')
  })

  test('keeps an action border from replacing the structural border role', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'borderColor:rgb(23, 114, 246)': 8,
        'borderColor:rgb(235, 236, 237)': 5,
        'structuralBorderColor:rgb(235, 236, 237)': 5,
      },
    })
    const tokens = buildDesignTokens(styles, {
      palette: [],
      backgrounds: ['#f4f6f9', '#ffffff'],
      texts: ['#191b1f'],
      accents: ['#1772f6'],
    })

    expect(tokens.colors.surface).toBe('#ffffff')
    expect(tokens.colors.primary).toBe('#1772f6')
    expect(tokens.colors.border).toBe('rgb(235, 236, 237)')
  })

  test('separates default and subtle borders while keeping a secondary surface distinct from white cards', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'structuralBorderColor:rgb(248, 248, 250)': 40,
        'structuralBorderColor:rgb(235, 236, 237)': 34,
        'structuralBorderColor:rgb(217, 83, 80)': 32,
      },
    })
    const tokens = buildDesignTokens(styles, {
      palette: [],
      backgrounds: ['#f4f6f9', '#ffffff'],
      texts: ['#191b1f'],
      accents: ['#1772f6'],
    })

    expect(tokens.colors.surface).toBe('#ffffff')
    expect(tokens.colors.secondary).toBe('#f4f6f9')
    expect(tokens.colors.border).toBe('rgb(235, 236, 237)')
    expect(tokens.colors['border-subtle']).toBe('rgb(248, 248, 250)')
  })
})
