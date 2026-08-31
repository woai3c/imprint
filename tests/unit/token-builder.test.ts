import { describe, expect, test } from 'vitest'

import {
  colorCandidateObservationCount,
  demoteWeakSemanticBorderTokens,
} from '../../src/core/analyzer/analysis-output.js'
import { clusterColors } from '../../src/core/analyzer/color-cluster.js'
import { buildDesignTokens } from '../../src/core/analyzer/token-builder.js'
import { buildTokenEvidence } from '../../src/core/analyzer/token-evidence.js'
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

  test('keeps composite spacing shorthands out of the reusable scalar scale', () => {
    const styles = createExtractedStyles({
      spacings: ['4px', '4px 10px', '8px'],
      usageCount: {
        'spacing:4px': 12,
        'spacing:4px 10px': 80,
        'spacing:8px': 20,
      },
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.spacing).toEqual(['4px', '8px'])
  })

  test('keeps control-only spacing and geometry-only radii out of global scales', () => {
    const styles = createExtractedStyles({
      spacings: ['4px', '16px'],
      radii: ['6px', '15px', '9999px'],
      usageCount: {
        'spacing:4px': 30,
        'spacing:16px': 8,
        'radius:6px': 5,
        'radius:15px': 40,
        'radius:9999px': 3,
      },
      valueSources: {
        'spacing:4px': ['element:control-spacing'],
        'spacing:16px': ['element:content-spacing'],
        'radius:6px': ['computed:ordinary-radius'],
        'radius:15px': ['geometry:circle-or-pill'],
        'radius:9999px': ['geometry:circle-or-pill'],
      },
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.spacing).toEqual(['16px'])
    expect(result.radii).toEqual(['6px'])
  })

  test('uses source proportions instead of one incidental reusable occurrence', () => {
    const styles = createExtractedStyles({
      spacings: ['7px', '16px'],
      radii: ['8px', '15px'],
      usageCount: {
        'spacing:7px': 101,
        'spacing:16px': 10,
        'radius:8px': 10,
        'radius:15px': 101,
      },
      valueSources: {
        'spacing:7px': ['element:control-spacing', 'element:content-spacing'],
        'spacing:16px': ['element:control-spacing', 'element:structural-spacing'],
        'radius:8px': ['geometry:circle-or-pill', 'computed:ordinary-radius'],
        'radius:15px': ['geometry:circle-or-pill', 'computed:ordinary-radius'],
      },
      valueSourceCounts: {
        'spacing:7px': { 'element:control-spacing': 100, 'element:content-spacing': 1 },
        'spacing:16px': { 'element:control-spacing': 5, 'element:structural-spacing': 5 },
        'radius:8px': { 'geometry:circle-or-pill': 5, 'computed:ordinary-radius': 5 },
        'radius:15px': { 'geometry:circle-or-pill': 100, 'computed:ordinary-radius': 1 },
      },
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.spacing).toEqual(['16px'])
    expect(result.radii).toEqual(['8px'])
  })

  test('omits transparent and zero-geometry shadows from the reusable shadow scale', () => {
    const visibleShadow = '0 8px 24px rgb(0 0 0 / 18%)'
    const transparentShadow = '0 8px 24px rgb(0 0 0 / 0%)'
    const zeroGeometryShadow = '0 0 0 rgb(0 0 0 / 18%)'
    const styles = createExtractedStyles({
      shadows: [transparentShadow, zeroGeometryShadow, visibleShadow],
      usageCount: {
        [`shadow:${transparentShadow}`]: 50,
        [`shadow:${zeroGeometryShadow}`]: 40,
        [`shadow:${visibleShadow}`]: 2,
      },
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.shadows).toEqual([visibleShadow])
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

  test('merges sub-pixel font-size noise into one reusable token', () => {
    const styles = createExtractedStyles({
      fontSizes: ['11.9px', '12px', '16px'],
      usageCount: {
        'fontSize:11.9px': 5,
        'fontSize:12px': 20,
        'fontSize:16px': 30,
      },
    })

    const tokens = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(tokens.typography.fontSizes).toEqual(['0.75rem', '1rem'])
  })

  test('reserves scale slots for semantic display and heading typography', () => {
    const styles = createExtractedStyles({
      fontSizes: ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '48px'],
      fontWeights: ['400', '500', '600', '700', '800', '900'],
      usageCount: {
        'fontSize:12px': 80,
        'fontSize:14px': 70,
        'fontSize:16px': 60,
        'fontSize:18px': 50,
        'fontSize:20px': 40,
        'fontSize:24px': 30,
        'fontSize:28px': 20,
        'fontSize:32px': 10,
        'fontSize:48px': 1,
        'displayFontSize:48px': 1,
        'headingFontSize:32px': 4,
        'fontWeight:400': 100,
        'fontWeight:500': 80,
        'fontWeight:600': 60,
        'fontWeight:700': 20,
        'fontWeight:800': 1,
        'fontWeight:900': 40,
        'displayFontWeight:800': 1,
        'headingFontWeight:700': 20,
      },
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.typography.fontSizes).toContain('3rem')
    expect(result.typography.fontSizes).toContain('2rem')
    expect(result.typography.fontWeights).toEqual(['400', '500', '600', '700', '800'])
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

  test('retains unrendered declared colors as evidence candidates', () => {
    const styles = createExtractedStyles({
      colors: ['rgb(124, 58, 237)'],
      usageCount: {
        'declaredColor:rgb(124, 58, 237)': 8,
        'brandTokenColor:rgb(124, 58, 237)': 8,
      },
      valueSources: {
        'declaredColor:rgb(124, 58, 237)': ['css-variable:--brand-primary'],
        'brandTokenColor:rgb(124, 58, 237)': ['css-variable:--brand-primary'],
      },
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(Object.values(result.colors)).not.toContain('#7c3aed')
    expect(result.candidates?.colors).toEqual([
      {
        value: '#7c3aed',
        kind: 'declared-only',
        observationCount: 8,
        sources: ['css-variable:--brand-primary'],
      },
    ])
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

  test('selects the global foreground from text observed on the chosen background', () => {
    const styles = createExtractedStyles({
      textColorPairObservations: [
        {
          captureId: 'https://example.com/|1440x900',
          background: 'rgb(255, 255, 255)',
          foreground: 'rgb(255, 255, 255)',
          textRole: 'other',
          count: 100,
        },
        {
          captureId: 'https://example.com/|1440x900',
          background: 'rgb(255, 255, 255)',
          foreground: 'rgb(17, 24, 39)',
          textRole: 'body',
          count: 6,
        },
        {
          captureId: 'https://example.com/docs|1440x900',
          background: 'rgb(255, 255, 255)',
          foreground: 'rgb(17, 24, 39)',
          textRole: 'body',
          count: 4,
        },
        {
          captureId: 'https://example.com/|1440x900',
          background: 'rgb(255, 255, 255)',
          foreground: 'rgb(209, 209, 209)',
          textRole: 'body',
          count: 200,
        },
        {
          captureId: 'https://example.com/|1440x900',
          background: 'rgb(17, 24, 39)',
          foreground: 'rgb(255, 255, 255)',
          textRole: 'heading',
          count: 50,
        },
      ],
    })

    const tokens = buildDesignTokens(styles, {
      palette: [],
      backgrounds: ['#ffffff'],
      texts: ['#ffffff', '#111827'],
      accents: [],
    })

    expect(tokens.colors.background).toBe('#ffffff')
    expect(tokens.colors.foreground).toBe('#111827')
    expect(tokens.colors['muted-foreground']).toBeUndefined()
  })

  test('does not pair a foreground from a different observed surface', () => {
    const styles = createExtractedStyles({
      textColorPairObservations: [
        {
          captureId: 'https://example.com/|1440x900',
          background: 'rgb(255, 255, 255)',
          foreground: 'rgb(0, 0, 0)',
          textRole: 'body',
          count: 30,
        },
        {
          captureId: 'https://example.com/|1440x900',
          background: 'rgb(97, 31, 105)',
          foreground: 'rgb(255, 255, 255)',
          textRole: 'heading',
          count: 4,
        },
      ],
    })

    const tokens = buildDesignTokens(styles, {
      palette: [],
      backgrounds: ['#611f69'],
      texts: ['#000000', '#ffffff'],
      accents: [],
    })

    expect(tokens.colors.foreground).toBe('#ffffff')
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

  test('lets a repeated neutral boundary outweigh an isolated structural sample', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'borderColor:rgb(214, 218, 224)': 8,
        'borderColor:rgb(181, 186, 194)': 1,
        'structuralBorderColor:rgb(181, 186, 194)': 1,
        'borderColor:rgb(23, 114, 246)': 20,
      },
    })
    const result = buildDesignTokens(styles, {
      palette: [],
      backgrounds: ['#ffffff'],
      texts: ['#191b1f'],
      accents: ['#1772f6'],
    })

    expect(result.colors.border).toBe('rgb(214, 218, 224)')
  })

  test('demotes an isolated low-confidence semantic border to an unassigned candidate', () => {
    const result = buildDesignTokens(
      createExtractedStyles({ usageCount: { 'structuralBorderColor:rgb(181, 186, 194)': 1 } }),
      {
        palette: [],
        backgrounds: ['#ffffff'],
        texts: ['#191b1f'],
        accents: [],
      },
    )
    result.evidence = {
      'colors.border': {
        value: 'rgb(181, 186, 194)',
        confidence: 'low',
        observationCount: 2,
        pageCount: 1,
        captureCount: 1,
        pages: ['https://example.com/'],
        sources: ['usage:structuralBorderColor'],
        reasons: ['computed-style'],
      },
    }
    result.usageCount = {
      'borderColor:rgb(181, 186, 194)': 1,
      'structuralBorderColor:rgb(181, 186, 194)': 1,
    }

    demoteWeakSemanticBorderTokens(result)

    expect(result.colors.border).toBeUndefined()
    expect(result.candidates?.colors).toContainEqual(
      expect.objectContaining({
        value: '#b5bac2',
        kind: 'observed-unassigned',
        observationCount: 1,
      }),
    )
    expect(result.evidence['colors.border']).toBeUndefined()
  })

  test('does not double-count structural border aliases as separate color observations', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'borderColor:rgb(181, 186, 194)': 1,
        'structuralBorderColor:rgb(181, 186, 194)': 1,
      },
    })

    expect(colorCandidateObservationCount(styles, '#b5bac2')).toBe(1)
  })

  test('keeps only unassigned palette values as evidence candidates', () => {
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
    expect(tokens.colors['palette-2']).toBeUndefined()
    expect(tokens.candidates?.colors).toEqual([
      expect.objectContaining({ value: '#db2777', kind: 'observed-unassigned' }),
    ])
  })

  test('preserves destructive action colors as danger semantics without promoting them to primary', () => {
    const styles = createExtractedStyles({
      colors: ['rgb(255, 255, 255)', 'rgb(17, 24, 39)', 'rgb(180, 35, 24)'],
      usageCount: {
        'bgArea:rgb(255, 255, 255)': 0.8,
        'bgColor:rgb(255, 255, 255)': 10,
        'textColor:rgb(17, 24, 39)': 10,
        'bgColor:rgb(180, 35, 24)': 2,
        'textColor:rgb(255, 255, 255)': 2,
        'destructiveActionBackgroundColor:rgb(180, 35, 24)': 2,
        'destructiveActionForegroundColor:rgb(255, 255, 255)': 2,
      },
      valueSources: {
        'bgColor:rgb(180, 35, 24)': ['computed:background'],
        'destructiveActionBackgroundColor:rgb(180, 35, 24)': ['element:destructive-action'],
        'destructiveActionForegroundColor:rgb(255, 255, 255)': ['element:destructive-action'],
      },
      colorRoleObservations: [
        {
          captureId: 'capture-1',
          background: 'rgb(180, 35, 24)',
          foreground: 'rgb(255, 255, 255)',
          elementRef: 'button.delete',
          elementKind: 'button',
          role: 'destructive-action',
        },
        {
          captureId: 'capture-1',
          background: 'rgb(180, 35, 24)',
          foreground: 'rgb(255, 255, 255)',
          elementRef: 'button.remove',
          elementKind: 'button',
          role: 'destructive-action',
        },
      ],
    })
    const clustered = clusterColors(styles.colors, styles.usageCount)
    const result = buildDesignTokens(styles, clustered, styles)
    result.evidence = buildTokenEvidence(result, [{ url: 'https://example.com/', viewport: 'desktop', styles }])

    expect(result.colors.danger).toBe('#b42318')
    expect(result.colors.primary).toBeUndefined()
    expect(result.candidates?.colors || []).not.toContainEqual(expect.objectContaining({ value: '#b42318' }))
    expect(result.evidence['colors.danger'].sources).toContain('usage:destructiveActionBackgroundColor')
    expect(generateDesignDoc(result)).toContain('| Destructive action | `--color-danger` |')
  })

  test('does not invent a danger token from neutral control styles on a destructive action', () => {
    const styles = createExtractedStyles({
      colors: ['rgb(255, 255, 255)', 'rgb(17, 24, 39)', 'rgb(239, 239, 239)', 'rgb(118, 118, 118)'],
      usageCount: {
        'bgColor:rgb(255, 255, 255)': 10,
        'textColor:rgb(17, 24, 39)': 10,
        'destructiveActionForegroundColor:rgb(17, 24, 39)': 1,
        'destructiveActionBackgroundColor:rgb(239, 239, 239)': 1,
        'borderColor:rgb(118, 118, 118)': 1,
      },
      valueSources: {
        'destructiveActionForegroundColor:rgb(17, 24, 39)': ['element:destructive-action'],
        'destructiveActionBackgroundColor:rgb(239, 239, 239)': ['element:destructive-action'],
        'borderColor:rgb(118, 118, 118)': ['computed:border'],
      },
      colorRoleObservations: [
        {
          captureId: 'capture-1',
          foreground: 'rgb(17, 24, 39)',
          background: 'rgb(239, 239, 239)',
          borderColor: 'rgb(118, 118, 118)',
          elementRef: 'button.delete',
          elementKind: 'button',
          role: 'destructive-action',
        },
      ],
    })
    const clustered = clusterColors(styles.colors, styles.usageCount)

    expect(buildDesignTokens(styles, clustered, styles).colors.danger).toBeUndefined()
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
