import { describe, expect, test } from 'vitest'

import { buildDesignTokens } from '../../src/core/analyzer/token-builder.js'
import { generateDesignDoc } from '../../src/core/export/index.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

describe('design token builder', () => {
  test('normalizes browser floating-point noise in spacing and radius tokens', () => {
    const styles = createExtractedStyles({
      spacings: ['1.428px', '5.95px', '8px'],
      radii: ['5.95px', '9999.01px'],
      usageCount: {
        'spacing:1.428px': 36,
        'spacing:1.5px': 4,
        'spacing:5.95px': 36,
        'spacing:8px': 20,
        'radius:5.95px': 12,
        'radius:9999.01px': 49,
      },
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.spacing).toEqual(['1.5px', '6px', '8px'])
    expect(result.radii).toEqual(['6px', '9999px'])
    expect(result.usageCount?.['spacing:1.5px']).toBe(40)
    expect(result.usageCount?.['radius:9999px']).toBe(49)
  })

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

  test('filters CSS-wide keywords from reusable font stacks', () => {
    const styles = createExtractedStyles({
      fontFamilies: ['inherit', 'Inter, sans-serif'],
      usageCount: {
        'fontTextFamily:inherit': 200,
        'fontTextFamily:Inter, sans-serif': 100,
      },
    })

    const tokens = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(tokens.typography.fontStacks).toEqual(['Inter, sans-serif'])
    expect(tokens.typography.fontFamilies).toEqual(['Inter'])
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

  test('does not promote an unrendered declared brand color to the accent role', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'primaryActionBackgroundColor:rgb(0, 87, 217)': 3,
        'declaredColor:rgb(124, 58, 237)': 1,
        'brandTokenColor:rgb(124, 58, 237)': 1,
      },
      colorRoleObservations: [
        {
          captureId: 'page|1440x900',
          elementRef: 'body > button',
          elementKind: 'button',
          role: 'primary-action',
          background: 'rgb(0, 87, 217)',
          foreground: 'rgb(255, 255, 255)',
        },
      ],
    })
    const result = buildDesignTokens(styles, {
      palette: [],
      backgrounds: ['#ffffff'],
      texts: ['#111827'],
      accents: ['#0057d9', '#7c3aed'],
    })

    expect(result.colors.primary).toBe('#0057d9')
    expect(result.colors.accent).toBeUndefined()
  })

  test('keeps a repeated tinted secondary action even when clustering omits it from accents', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'primaryActionBackgroundColor:rgb(0, 102, 255)': 3,
        'actionBackgroundColor:rgba(0, 102, 255, 0.1)': 14,
      },
      colorRoleObservations: [
        {
          captureId: 'page|1440x900',
          elementRef: 'body > button.primary',
          elementKind: 'button',
          role: 'primary-action',
          background: 'rgb(0, 102, 255)',
          foreground: 'rgb(255, 255, 255)',
        },
        ...['secondary-a', 'secondary-b'].map((name) => ({
          captureId: 'page|1440x900',
          elementRef: `body > button.${name}`,
          elementKind: 'button' as const,
          role: 'action' as const,
          background: 'rgba(0, 102, 255, 0.1)',
          foreground: 'rgb(0, 102, 255)',
        })),
      ],
    })
    const result = buildDesignTokens(styles, {
      palette: [],
      backgrounds: ['#ffffff'],
      texts: ['#111827'],
      accents: ['#0066ff'],
    })

    expect(result.colors.primary).toBe('#0066ff')
    expect(result.colors.accent).toBe('rgba(0, 102, 255, 0.1)')
  })

  test('does not promote a text-and-border-only color to the global accent role', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'primaryActionBackgroundColor:rgb(0, 87, 217)': 3,
        'textColor:rgb(217, 83, 80)': 30,
        'borderColor:rgb(217, 83, 80)': 12,
      },
      colorRoleObservations: [
        {
          captureId: 'page|1440x900',
          elementRef: 'body > button',
          elementKind: 'button',
          role: 'primary-action',
          background: 'rgb(0, 87, 217)',
          foreground: 'rgb(255, 255, 255)',
        },
      ],
    })
    const result = buildDesignTokens(styles, {
      palette: [],
      backgrounds: ['#ffffff'],
      texts: ['#111827'],
      accents: ['#0057d9', '#d95350'],
    })

    expect(result.colors.primary).toBe('#0057d9')
    expect(result.colors.accent).toBeUndefined()
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

  test('does not emit a palette token for a color already assigned under a different notation', () => {
    const styles = createExtractedStyles({
      usageCount: { 'structuralBorderColor:rgb(59, 52, 64)': 100 },
    })
    const tokens = buildDesignTokens(styles, {
      palette: [
        { hex: '#3b3440', count: 107 },
        { hex: '#db2777', count: 5 },
      ],
      backgrounds: ['#16171d'],
      texts: ['#ffffff'],
      accents: ['#6b1eb9'],
    })

    expect(tokens.colors.border).toBe('rgb(59, 52, 64)')
    expect(tokens.colors['palette-1']).toBeUndefined()
    expect(tokens.colors['palette-2']).toBe('#db2777')
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

  test('preserves the observed primary pair and labels an accessible alternative as derived', () => {
    const styles = createExtractedStyles({
      colorRoleObservations: [
        {
          captureId: 'https://example.com|1440x900',
          elementRef: 'body > a:nth-of-type(1)',
          elementKind: 'anchor',
          role: 'action',
          background: 'rgb(234, 88, 12)',
          foreground: 'rgb(255, 255, 255)',
        },
      ],
    })
    const result = buildDesignTokens(styles, {
      palette: [
        { hex: '#ea580c', count: 2 },
        { hex: '#ffffff', count: 2 },
      ],
      backgrounds: ['#fff7ed'],
      texts: ['#431407'],
      accents: ['#ea580c'],
    })

    expect(result.colorRoles?.primaryAction).toMatchObject({
      observedBackground: '#ea580c',
      observedForeground: '#ffffff',
    })
    expect(result.colorRoles?.primaryAction?.contrastRatio).toBeCloseTo(3.56, 1)
    expect(result.colorRoles?.primaryAction?.contrastWarning).toMatchObject({ targetContrastRatio: 4.5 })
    expect(result.colorRoles?.primaryAction?.recommendedOnPrimary).toMatchObject({
      derived: true,
      targetContrastRatio: 4.5,
    })
    expect(result.colorRoles!.primaryAction!.recommendedOnPrimary!.contrastRatio).toBeGreaterThanOrEqual(4.5)
    const designDoc = generateDesignDoc(result)
    expect(designDoc).toContain('Observed primary action pair')
    expect(designDoc).toContain('`#ea580c` / `#ffffff`')
    expect(designDoc).toContain('3.56:1')
    expect(designDoc).toContain('Derived accessible recommendation')
  })

  test('warns without proposing a drastic foreground swap for a near-threshold observed pair', () => {
    const styles = createExtractedStyles({
      colorRoleObservations: [
        {
          captureId: 'https://example.com|1440x900',
          elementRef: 'body > button',
          elementKind: 'button',
          role: 'primary-action',
          background: 'rgb(23, 114, 246)',
          foreground: 'rgb(255, 255, 255)',
        },
      ],
    })
    const result = buildDesignTokens(styles, {
      palette: [
        { hex: '#1772f6', count: 2 },
        { hex: '#ffffff', count: 2 },
      ],
      backgrounds: ['#f4f6f9'],
      texts: ['#191b1f'],
      accents: ['#1772f6'],
    })

    expect(result.colorRoles?.primaryAction?.contrastRatio).toBeCloseTo(4.4, 1)
    expect(result.colorRoles?.primaryAction?.contrastWarning).toBeDefined()
    expect(result.colorRoles?.primaryAction?.recommendedOnPrimary).toBeUndefined()
  })

  test('allows primary action to be absent and keeps a text-only editorial accent separate from the border', () => {
    const styles = createExtractedStyles({
      colorRoleObservations: [
        {
          captureId: 'https://example.com|1440x900',
          elementRef: 'body > main > button',
          elementKind: 'button',
          role: 'action',
          foreground: 'rgb(154, 59, 46)',
        },
      ],
      usageCount: { 'structuralBorderColor:rgb(216, 210, 198)': 10 },
    })
    const result = buildDesignTokens(styles, {
      palette: [
        { hex: '#d8d2c6', count: 10 },
        { hex: '#9a3b2e', count: 2 },
      ],
      backgrounds: ['#faf7f2'],
      texts: ['#23201b'],
      accents: [],
    })

    expect(result.colors.primary).toBeUndefined()
    expect(result.colors.border).toBe('rgb(216, 210, 198)')
    expect(result.colors['editorial-accent']).toBe('#9a3b2e')
    expect(result.colorRoles?.primaryAction).toBeUndefined()
  })

  test('preserves status and delta foreground/background pairs as distinct semantic roles', () => {
    const styles = createExtractedStyles({
      colorRoleObservations: [
        {
          captureId: 'dense|desktop',
          elementRef: 'body > .status.ok',
          elementKind: 'status',
          role: 'status',
          statusKind: 'status',
          statusIntent: 'positive',
          background: 'rgb(220, 250, 230)',
          foreground: 'rgb(6, 118, 71)',
        },
        {
          captureId: 'dense|desktop',
          elementRef: 'body > .delta.down',
          elementKind: 'status',
          role: 'status',
          statusKind: 'delta',
          statusIntent: 'negative',
          foreground: 'rgb(180, 35, 24)',
        },
      ],
    })
    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.colorRoles?.semanticPairs).toMatchObject({
      'status-positive': { observedBackground: '#dcfae6', observedForeground: '#067647' },
      'delta-negative': { observedForeground: '#b42318' },
    })
  })
})
