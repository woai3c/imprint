import { describe, expect, test } from 'vitest'

import {
  colorCandidateObservationCount,
  enrichColorCandidateEvidence,
  stabilizePortableTokens,
} from '../../src/core/analyzer/analysis-output.js'
import { clusterColors } from '../../src/core/analyzer/color-cluster.js'
import { buildForegroundPairEvidence } from '../../src/core/analyzer/color-pair-evidence.js'
import { reselectPortableFoundationColors } from '../../src/core/analyzer/color-role-promotion.js'
import { selectFoundationSurfaceColors } from '../../src/core/analyzer/semantic-owner.js'
import { mergeStylesWithNormalizedUsage } from '../../src/core/analyzer/style-merge.js'
import { buildDesignTokens } from '../../src/core/analyzer/token-builder.js'
import { buildTokenEvidence } from '../../src/core/analyzer/token-evidence.js'
import { promotePortableDesignTokens } from '../../src/core/analyzer/token-promotion.js'
import { generateDesignDoc } from '../../src/core/export/index.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

function renderedTextOwners(
  foreground: string,
  backgroundColor: string,
  ownerIds: string[],
  textRole: 'body' | 'heading' | 'label' | 'other',
) {
  return ownerIds.slice(0, 8).map((ownerId) => ({
    ownerId,
    textRole,
    styles: {
      color: foreground,
      backgroundColor,
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
      fontWeight: '400',
      lineHeight: '24px',
      letterSpacing: 'normal',
    },
    source: {
      kind: 'direct-text' as const,
      widthPx: 120,
      heightPx: 24,
      visibleWidthPx: 120,
      visibleHeightPx: 24,
      paintedAreaPx: 2880,
      captureIntersectionRatio: 1,
      effectiveClipPathAreaRatio: 1,
      ancestorClipCount: 0,
      clientRectCount: 1,
      glyphRectCount: 1,
      visibleBounds: { xPx: 0, yPx: 0, widthPx: 120, heightPx: 24 },
      visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 120, heightPx: 24 }],
      visibleGlyphAreaPx: 2880,
      clipPathChain: [],
      nonRectangularClipPathCount: 0,
      clip: 'auto',
      clipPath: 'none',
      contentVisibility: 'visible',
      opacity: 1,
      filterOpacity: 1,
      filterChain: [],
      maskChain: [],
      blendChain: [],
      textIndentPx: 0,
      filter: 'none',
      glyphPaintKind: 'solid-color' as const,
      foreground,
    },
  }))
}

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

  test('retains control-only spacing and geometry-only radii until evidence promotion', () => {
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

    expect(result.spacing).toEqual(['4px', '16px'])
    expect(result.radii).toEqual(['6px', '15px', '9999px'])
  })

  test('does not prefilter candidates before source proportions are evaluated', () => {
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

    expect(result.spacing).toEqual(['7px', '16px'])
    expect(result.radii).toEqual(['8px', '15px'])
  })

  test('retains specialized and subpixel spacing in the pre-promotion catalog', () => {
    const styles = createExtractedStyles({
      spacings: ['1px', '1.728px', '8px', '16px'],
      usageCount: {
        'spacing:1px': 20,
        'spacing:1.728px': 170,
        'spacing:8px': 80,
        'spacing:16px': 30,
      },
      usageGroupCounts: {
        'spacing:1px': 1,
        'spacing:1.728px': 1,
        'spacing:8px': 3,
        'spacing:16px': 2,
      },
      valueSourceCounts: {
        'spacing:1px': { 'element:structural-spacing': 20 },
        'spacing:1.728px': { 'element:specialized-spacing': 170 },
        'spacing:8px': { 'element:content-spacing': 80 },
        'spacing:16px': { 'element:structural-spacing': 30 },
      },
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.spacing).toEqual(['1px', '1.728px', '8px', '16px'])
  })

  test('normalizes legacy aliases without deleting the candidate', () => {
    const styles = createExtractedStyles({
      spacings: ['0.96px', '1px', '8px'],
      usageCount: {
        'spacing:0.96px': 60,
        'spacing:1px': 40,
        'spacing:8px': 20,
      },
      usageGroupCounts: {
        'spacing:0.96px': 1,
        'spacing:1px': 1,
        'spacing:8px': 1,
      },
      valueSourceCounts: {
        'spacing:0.96px': { 'element:structural-spacing': 60 },
        'spacing:1px': { 'element:structural-spacing': 40 },
        'spacing:8px': { 'element:content-spacing': 20 },
      },
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.spacing).toEqual(['1px', '8px'])
  })

  test('keeps candidate discovery independent of viewport repetition', () => {
    const capture = createExtractedStyles({
      spacings: ['8px'],
      radii: ['8px'],
      usageCount: { 'spacing:8px': 2, 'radius:8px': 2 },
      valueSources: {
        'spacing:8px': ['element:content-spacing', 'element:control-spacing'],
        'radius:8px': ['computed:ordinary-radius', 'geometry:circle-or-pill'],
      },
      valueSourceCounts: {
        'spacing:8px': { 'element:content-spacing': 1, 'element:control-spacing': 1 },
        'radius:8px': { 'computed:ordinary-radius': 1, 'geometry:circle-or-pill': 1 },
      },
    })
    const colors = { palette: [], backgrounds: [], texts: [], accents: [] }
    const build = (urls: string[]) => {
      const captures = urls.map(() => structuredClone(capture))
      const merged = mergeStylesWithNormalizedUsage(captures, urls)
      return buildDesignTokens(merged, colors, merged)
    }

    const single = build(['https://example.com/'])
    const repeated = build(['https://example.com/', 'https://example.com/'])
    const crossPage = build(['https://example.com/', 'https://example.com/docs'])

    expect(single.spacing).toContain('8px')
    expect(single.radii).toContain('8px')
    expect(repeated.spacing).toEqual(single.spacing)
    expect(repeated.radii).toEqual(single.radii)
    expect(crossPage.spacing).toContain('8px')
    expect(crossPage.radii).toContain('8px')
  })

  test('retains the complete normalized typography candidate catalog without a frequency cap', () => {
    const styles = createExtractedStyles({
      fontSizes: ['12px', '13px', '14px', '15px', '16px', '17px', '18px'],
      lineHeights: ['18px', '20px', '24px', '30px', '40px'],
      usageCount: {
        'fontSize:16px': 100,
        'fontSize:14px': 30,
        'fontSize:12px': 10,
        'fontSize:13px': 1,
        'fontSize:15px': 1,
        'fontSize:17px': 1,
        'fontSize:18px': 1,
        'lineHeight:24px': 100,
        'lineHeight:20px': 30,
        'lineHeight:18px': 1,
        'lineHeight:30px': 1,
        'lineHeight:40px': 1,
      },
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.typography.fontSizes).toEqual([
      '0.75rem',
      '0.8125rem',
      '0.875rem',
      '0.9375rem',
      '1rem',
      '1.0625rem',
      '1.125rem',
    ])
    expect(result.typography.lineHeights).toEqual([])
  })

  test('retains every meaningful spacing observation for later evidence evaluation', () => {
    const styles = createExtractedStyles({
      spacings: ['6px', '8.5px', '11.2px', '12px', '16px', '20px', '21.177px', '24px', '32px'],
      usageCount: {
        'spacing:6px': 80,
        'spacing:8.5px': 70,
        'spacing:11.2px': 65,
        'spacing:12px': 60,
        'spacing:16px': 50,
        'spacing:20px': 4,
        'spacing:21.177px': 45,
        'spacing:24px': 3,
        'spacing:32px': 2,
      },
      usageGroupCounts: Object.fromEntries(
        ['6px', '8.5px', '11.2px', '12px', '16px', '20px', '21.177px', '24px', '32px'].map((value) => [
          `spacing:${value}`,
          1,
        ]),
      ),
      valueSourceCounts: Object.fromEntries(
        ['6px', '8.5px', '11.2px', '12px', '16px', '20px', '21.177px', '24px', '32px'].map((value) => [
          `spacing:${value}`,
          { 'element:content-spacing': 10 },
        ]),
      ),
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.spacing).toEqual(['6px', '8.5px', '11.2px', '12px', '16px', '20px', '21.177px', '24px', '32px'])
  })

  test('does not impose a spacing candidate hard cap before promotion', () => {
    const values = ['2px', '4px', '6px', '8px', '10px', '12px', '16px', '20px', '24px', '32px', '40px', '48px']
    const styles = createExtractedStyles({
      spacings: values,
      usageCount: Object.fromEntries(
        values.map((value, index) => [`spacing:${value}`, index < 4 ? 1_000 - index * 100 : 2]),
      ),
      valueSourceCounts: Object.fromEntries(
        values.map((value) => [`spacing:${value}`, { 'element:content-spacing': 2 }]),
      ),
    })

    const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(result.spacing).toEqual([
      '2px',
      '4px',
      '6px',
      '8px',
      '10px',
      '12px',
      '16px',
      '20px',
      '24px',
      '32px',
      '40px',
      '48px',
    ])
    expect(result.spacing).toHaveLength(12)
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
    expect(result.typography.fontWeights).toEqual(['400', '500', '600', '700', '800', '900'])
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

  test('preserves a quoted comma inside one exact font family', () => {
    const stack = '"Foo, Bar", sans-serif'
    const styles = createExtractedStyles({
      fontFamilies: [stack],
      usageCount: { [`fontTextFamily:${stack}`]: 2 },
      usageOwnerCounts: { [`fontTextFamily:${stack}`]: 2 },
      usageOwnerIds: { [`fontTextFamily:${stack}`]: ['text-1', 'text-2'] },
      valueSources: { [`fontTextFamily:${stack}`]: ['rendered:text'] },
      renderedTextStyleObservations: renderedTextOwners('#111111', '#ffffff', ['text-1', 'text-2'], 'body').map(
        (observation) => ({
          ...observation,
          styles: { ...observation.styles, fontFamily: stack },
        }),
      ),
    })
    const tokens = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]

    expect(tokens.typography.fontStacks).toEqual([stack])
    expect(tokens.typography.fontFamilies).toEqual(['"Foo, Bar"'])

    tokens.evidence = buildTokenEvidence(tokens, captures)
    expect(tokens.evidence['typography.fontStacks.0']).toMatchObject({ ownerCount: 2, reuseScope: 'foundation' })
    expect(tokens.evidence['typography.fontFamilies.0']).toMatchObject({ ownerCount: 2, reuseScope: 'foundation' })
    promotePortableDesignTokens(tokens)

    expect(tokens.typography.fontStacks).toEqual([stack])
    expect(generateDesignDoc(tokens, 'https://example.com/')).toContain(stack)
  })

  test('dedupes semantically equivalent quoted and escaped font stacks without changing the selected CSS', () => {
    const quotedStack = '"Foo, Bar", sans-serif'
    const escapedStack = 'Foo\\, Bar, sans-serif'
    const styles = createExtractedStyles({
      fontFamilies: [quotedStack, escapedStack, 's\\65 rif'],
      usageCount: {
        [`fontTextFamily:${quotedStack}`]: 3,
        [`fontTextFamily:${escapedStack}`]: 2,
        'fontTextFamily:s\\65 rif': 1,
      },
    })

    const tokens = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })

    expect(tokens.typography.fontStacks).toEqual([quotedStack, 's\\65 rif'])
    expect(tokens.typography.fontFamilies).toEqual(['"Foo, Bar"', 's\\65 rif'])
  })

  test('does not promote a distant brand block to the neutral surface role', () => {
    const styles = createExtractedStyles()
    const tokens = buildDesignTokens(
      styles,
      {
        palette: [
          { hex: '#ffffff', count: 10 },
          { hex: '#ffff00', count: 2 },
        ],
        backgrounds: ['#ffffff', '#ffff00'],
        texts: ['#000000'],
        accents: ['#ffff00'],
      },
      styles,
      { background: '#ffffff' },
    )

    expect(tokens.colors.background).toBe('#ffffff')
    expect(tokens.colors.surface).toBeUndefined()
    expect(tokens.colors.secondary).toBeUndefined()
    expect(tokens.colors.primary).toBeUndefined()
    expect(tokens.colors['editorial-accent']).toBe('#ffff00')
  })

  test('does not manufacture a secondary surface from an action hue or duplicate an existing surface', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'primaryActionBackgroundColor:rgb(0, 87, 217)': 2,
        'actionBackgroundColor:rgb(124, 58, 237)': 2,
      },
    })
    const tokens = buildDesignTokens(
      styles,
      {
        palette: [],
        backgrounds: ['#ffffff', '#f5f5f5'],
        texts: ['#111827'],
        accents: ['#0057d9', '#7c3aed'],
      },
      styles,
      { background: '#ffffff', surface: '#f5f5f5' },
    )

    expect(tokens.colors.surface).toBe('#f5f5f5')
    expect(tokens.colors.secondary).toBeUndefined()
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

  test('does not let a repeated viewport flip the observed primary-action foreground', () => {
    const observation = (captureId: string, elementRef: string, foreground: string) => ({
      captureId,
      elementRef,
      elementKind: 'button' as const,
      role: 'primary-action' as const,
      background: 'rgb(0, 87, 217)',
      foreground,
    })
    const capture = (...colorRoleObservations: ReturnType<typeof observation>[]) =>
      createExtractedStyles({
        usageCount: { 'primaryActionBackgroundColor:rgb(0, 87, 217)': colorRoleObservations.length },
        colorRoleObservations,
      })
    const homeDesktop = capture(
      observation('https://example.com/|1440x900', 'body > button.primary', 'rgb(17, 24, 39)'),
    )
    const homeMobile = capture(
      observation('https://example.com/|375x812', 'nav > button.primary', 'rgb(17, 24, 39)'),
      observation('https://example.com/|375x812', 'main > a.primary', 'rgb(17, 24, 39)'),
      observation('https://example.com/|375x812', 'footer > button.primary', 'rgb(17, 24, 39)'),
      observation('https://example.com/|375x812', 'aside > a.primary', 'rgb(17, 24, 39)'),
    )
    const docsDesktop = capture(
      observation('https://example.com/docs|1440x900', 'main > button.primary', 'rgb(255, 255, 255)'),
      observation('https://example.com/docs|1440x900', 'aside > button.primary', 'rgb(255, 255, 255)'),
    )
    const colors = { palette: [], backgrounds: ['#ffffff'], texts: ['#111827'], accents: ['#0057d9'] }
    const build = (styles: ReturnType<typeof createExtractedStyles>[], urls: string[]) => {
      const merged = mergeStylesWithNormalizedUsage(styles, urls)
      return { merged, tokens: buildDesignTokens(merged, colors, merged) }
    }

    const base = build([homeDesktop, docsDesktop], ['https://example.com/', 'https://example.com/docs'])
    const repeated = build(
      [homeDesktop, homeMobile, docsDesktop],
      ['https://example.com/', 'https://example.com/', 'https://example.com/docs'],
    )

    expect(repeated.merged.colorRoleObservations).toHaveLength(7)
    expect(repeated.merged.colorRoleObservations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          captureId: 'https://example.com/|1440x900',
          selectionGroup: 'https://example.com/',
          selectionWeight: 0.5,
        }),
        expect.objectContaining({
          captureId: 'https://example.com/|375x812',
          selectionGroup: 'https://example.com/',
          selectionWeight: 0.125,
        }),
        expect.objectContaining({
          captureId: 'https://example.com/docs|1440x900',
          selectionGroup: 'https://example.com/docs',
          selectionWeight: 0.5,
        }),
      ]),
    )
    expect(base.tokens.colorRoles?.primaryAction?.observedForeground).toBe('#ffffff')
    expect(repeated.tokens.colorRoles?.primaryAction?.observedForeground).toBe(
      base.tokens.colorRoles?.primaryAction?.observedForeground,
    )
    expect(repeated.tokens.colorRoles?.primaryAction?.provenance).toEqual(
      expect.arrayContaining([expect.objectContaining({ captureId: 'https://example.com/docs|1440x900' })]),
    )
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
    const styles = createExtractedStyles()
    const tokens = buildDesignTokens(
      styles,
      {
        palette: [],
        backgrounds: ['#ffffff'],
        texts: ['#000000', '#ffffff', '#57606a'],
        accents: ['#0969da'],
      },
      styles,
      { background: '#ffffff' },
    )

    expect(tokens.colors.foreground).toBe('#000000')
    expect(tokens.colors['muted-foreground']).toBe('#57606a')
  })

  test('keeps a text-used action accent out of the muted foreground role', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'textColor:rgb(23, 32, 51)': 24,
        'textColor:rgb(91, 101, 120)': 7,
        'textColor:rgb(36, 87, 214)': 6,
        'actionBackgroundColor:rgb(36, 87, 214)': 1,
        'accentColor:rgb(36, 87, 214)': 1,
      },
      colorRoleObservations: [
        {
          captureId: 'https://example.com/|desktop',
          elementRef: 'body > main > button',
          elementKind: 'button',
          role: 'action',
          background: 'rgb(36, 87, 214)',
          foreground: 'rgb(255, 255, 255)',
        },
      ],
      textColorPairObservations: [
        {
          captureId: 'https://example.com/|desktop',
          background: 'rgb(243, 246, 251)',
          foreground: 'rgb(23, 32, 51)',
          textRole: 'heading',
          count: 24,
        },
        {
          captureId: 'https://example.com/|desktop',
          background: 'rgb(243, 246, 251)',
          foreground: 'rgb(91, 101, 120)',
          textRole: 'body',
          count: 7,
        },
        {
          captureId: 'https://example.com/|desktop',
          background: 'rgb(243, 246, 251)',
          foreground: 'rgb(36, 87, 214)',
          textRole: 'label',
          count: 6,
        },
      ],
    })
    const tokens = buildDesignTokens(
      styles,
      {
        palette: [],
        backgrounds: ['#f3f6fb', '#ffffff', '#e8eef8'],
        texts: ['#172033', '#5b6578', '#2457d6'],
        accents: ['#2457d6'],
      },
      styles,
      { background: '#f3f6fb', surface: '#ffffff', secondary: '#e8eef8' },
    )

    expect(tokens.colors.foreground).toBe('#172033')
    expect(tokens.colors['muted-foreground']).toBe('#5b6578')
    expect(tokens.colors.accent).toBe('#2457d6')
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

    const tokens = buildDesignTokens(
      styles,
      {
        palette: [],
        backgrounds: ['#ffffff'],
        texts: ['#ffffff', '#111827'],
        accents: [],
      },
      styles,
      { background: '#ffffff' },
    )

    expect(tokens.colors.background).toBe('#ffffff')
    expect(tokens.colors.foreground).toBe('#111827')
    expect(tokens.colors['muted-foreground']).toBeUndefined()
  })

  test('reselects a sparse cross-route accent away from the global foreground using observed surface pairs', () => {
    const captures = Array.from({ length: 8 }, (_value, index) => {
      const url = `https://example.com/page-${index + 1}`
      const dark = 'rgb(55, 53, 47)'
      const orange = 'rgb(217, 119, 6)'
      const muted = 'rgb(113, 113, 113)'
      return {
        url,
        viewport: 'desktop',
        styles: createExtractedStyles({
          usageCount: {
            [`bgColor:rgb(247, 247, 245)`]: 1,
            [`textColor:${dark}`]: 40,
            [`textColor:${orange}`]: 4,
            [`textColor:${muted}`]: 8,
          },
          usageOwnerIds: {
            [`bgColor:rgb(247, 247, 245)`]: ['body'],
            [`textColor:${dark}`]: Array.from({ length: 40 }, (_item, owner) => `copy-${owner}`),
            [`textColor:${orange}`]: Array.from({ length: 4 }, (_item, owner) => `accent-${owner}`),
            [`textColor:${muted}`]: Array.from({ length: 8 }, (_item, owner) => `muted-${owner}`),
          },
          valueSources: {
            [`bgColor:rgb(247, 247, 245)`]: ['element:page-background'],
            [`textColor:${dark}`]: ['computed:text'],
            [`textColor:${orange}`]: ['computed:text'],
            [`textColor:${muted}`]: ['computed:text'],
          },
          textColorPairObservations: [
            ...(index < 6
              ? [
                  {
                    captureId: `${url}|desktop`,
                    background: 'rgb(247, 247, 245)',
                    foreground: dark,
                    textRole: 'heading' as const,
                    count: 40,
                    ownerIds: Array.from({ length: 40 }, (_item, owner) => `copy-${owner}`),
                  },
                ]
              : []),
            {
              captureId: `${url}|desktop`,
              background: 'rgb(255, 255, 255)',
              foreground: muted,
              textRole: 'label' as const,
              count: 8,
              ownerIds: Array.from({ length: 8 }, (_item, owner) => `muted-${owner}`),
            },
          ],
          renderedTextStyleObservations:
            index < 6
              ? renderedTextOwners(
                  dark,
                  'rgb(247, 247, 245)',
                  Array.from({ length: 40 }, (_item, owner) => `copy-${owner}`),
                  'heading',
                )
              : [],
        }),
      }
    })
    const tokenProbe = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    tokenProbe.colors = {
      background: '#f7f7f5',
      foreground: '#d97706',
      'muted-foreground': '#717171',
    }
    tokenProbe.candidates = {
      colors: [{ value: '#37352f', kind: 'observed-unassigned', observationCount: 320, sources: ['computed:text'] }],
    }
    tokenProbe.evidence = buildTokenEvidence(tokenProbe, captures)
    expect(tokenProbe.evidence['colors.foreground']).toMatchObject({ reuseScope: 'local', pageCount: 8 })

    reselectPortableFoundationColors(tokenProbe, captures)
    promotePortableDesignTokens(tokenProbe)

    expect(tokenProbe.colors.foreground).toBe('#37352f')
    expect(tokenProbe.evidence['colors.foreground']).toMatchObject({
      reuseScope: 'foundation',
      pairedSurface: expect.objectContaining({ background: '#f7f7f5', pageCount: 6 }),
    })
  })

  test('prefers dominant route-balanced text over a sparse higher-contrast pair', () => {
    const dominant = 'rgb(96, 96, 96)'
    const sparse = 'rgb(0, 0, 0)'
    const captures = Array.from({ length: 4 }, (_value, index) => {
      const url = `https://example.com/page-${index + 1}`
      return {
        url,
        viewport: 'desktop',
        styles: createExtractedStyles({
          usageCount: {
            [`textColor:${dominant}`]: 80,
            ...(index < 2 ? { [`textColor:${sparse}`]: 5 } : {}),
          },
          usageOwnerIds: {
            [`textColor:${dominant}`]: Array.from({ length: 80 }, (_item, owner) => `body-${owner}`),
            ...(index < 2
              ? { [`textColor:${sparse}`]: Array.from({ length: 5 }, (_item, owner) => `heading-${owner}`) }
              : {}),
          },
          valueSources: {
            [`textColor:${dominant}`]: ['computed:text'],
            ...(index < 2 ? { [`textColor:${sparse}`]: ['computed:text'] } : {}),
          },
          textColorPairObservations: [
            {
              captureId: `${url}|desktop`,
              background: 'rgb(255, 255, 255)',
              foreground: dominant,
              textRole: 'body',
              count: 80,
              ownerIds: Array.from({ length: 80 }, (_item, owner) => `body-${owner}`),
            },
            ...(index < 2
              ? [
                  {
                    captureId: `${url}|desktop`,
                    background: 'rgb(255, 255, 255)',
                    foreground: sparse,
                    textRole: 'heading' as const,
                    count: 5,
                    ownerIds: Array.from({ length: 5 }, (_item, owner) => `heading-${owner}`),
                  },
                ]
              : []),
          ],
          renderedTextStyleObservations: [
            ...renderedTextOwners(
              dominant,
              'rgb(255, 255, 255)',
              Array.from({ length: 80 }, (_item, owner) => `body-${owner}`),
              'body',
            ),
            ...(index < 2
              ? renderedTextOwners(
                  sparse,
                  'rgb(255, 255, 255)',
                  Array.from({ length: 5 }, (_item, owner) => `heading-${owner}`),
                  'heading',
                )
              : []),
          ],
        }),
      }
    })
    const tokenProbe = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    tokenProbe.colors = { background: '#ffffff', foreground: '#000000' }
    tokenProbe.candidates = {
      colors: [{ value: '#606060', kind: 'observed-unassigned', observationCount: 320, sources: ['computed:text'] }],
    }

    reselectPortableFoundationColors(tokenProbe, captures)

    expect(tokenProbe.colors.foreground).toBe('#606060')
    expect(tokenProbe.evidence?.['colors.foreground'].pairedSurface).toMatchObject({
      pageCount: 4,
      mainTextPageCount: 4,
      ownerCount: 320,
      mainTextOwnerCount: 320,
      minimumPageOwnerCount: 80,
    })
  })

  test('falls back to the best portable foreground when the highest-ranked pair has conflicting semantics', () => {
    const conflicted = 'rgb(96, 96, 96)'
    const portable = 'rgb(51, 51, 51)'
    const captures = Array.from({ length: 4 }, (_value, index) => {
      const url = `https://example.com/page-${index + 1}`
      const conflictedTextOwners = Array.from({ length: 20 }, (_item, owner) => `conflicted-text-${owner}`)
      const conflictedSurfaceOwners = Array.from({ length: 80 }, (_item, owner) => `conflicted-surface-${owner}`)
      const portableOwners = Array.from({ length: 12 }, (_item, owner) => `portable-text-${owner}`)
      return {
        url,
        viewport: 'desktop',
        styles: createExtractedStyles({
          usageCount: {
            'bgColor:rgb(255, 255, 255)': 1,
            [`textColor:${conflicted}`]: conflictedTextOwners.length,
            [`linkColor:${conflicted}`]: conflictedSurfaceOwners.length,
            ...(index < 3 ? { [`textColor:${portable}`]: portableOwners.length } : {}),
          },
          usageOwnerIds: {
            'bgColor:rgb(255, 255, 255)': ['page-root'],
            [`textColor:${conflicted}`]: conflictedTextOwners,
            [`linkColor:${conflicted}`]: conflictedSurfaceOwners,
            ...(index < 3 ? { [`textColor:${portable}`]: portableOwners } : {}),
          },
          valueSources: {
            'bgColor:rgb(255, 255, 255)': ['element:page-background'],
            [`textColor:${conflicted}`]: ['computed:text'],
            [`linkColor:${conflicted}`]: ['element:link'],
            ...(index < 3 ? { [`textColor:${portable}`]: ['computed:text'] } : {}),
          },
          textColorPairObservations: [
            {
              captureId: `${url}|desktop`,
              background: 'rgb(255, 255, 255)',
              foreground: conflicted,
              textRole: 'body',
              count: conflictedTextOwners.length,
              ownerIds: conflictedTextOwners,
            },
            ...(index < 3
              ? [
                  {
                    captureId: `${url}|desktop`,
                    background: 'rgb(255, 255, 255)',
                    foreground: portable,
                    textRole: 'heading' as const,
                    count: portableOwners.length,
                    ownerIds: portableOwners,
                  },
                ]
              : []),
          ],
          renderedTextStyleObservations: [
            ...renderedTextOwners(conflicted, 'rgb(255, 255, 255)', conflictedTextOwners, 'body'),
            ...(index < 3 ? renderedTextOwners(portable, 'rgb(255, 255, 255)', portableOwners, 'heading') : []),
          ],
        }),
      }
    })
    const tokenProbe = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    tokenProbe.colors = { background: '#ffffff', foreground: '#606060' }
    tokenProbe.candidates = {
      colors: [{ value: '#333333', kind: 'observed-unassigned', observationCount: 36, sources: ['computed:text'] }],
    }

    reselectPortableFoundationColors(tokenProbe, captures)

    expect(tokenProbe.colors.foreground).toBe('#333333')
    expect(tokenProbe.evidence?.['colors.foreground']).toMatchObject({
      semanticConfidence: 'high',
      reuseScope: 'foundation',
      pairedSurface: expect.objectContaining({ mainTextPageCount: 3, headingPageCount: 3 }),
    })
  })

  test('does not promote one incidental text owner as a one-page foreground', () => {
    const styles = createExtractedStyles({
      usageCount: { 'textColor:rgb(17, 17, 17)': 1 },
      usageOwnerIds: { 'textColor:rgb(17, 17, 17)': ['incidental-label'] },
      valueSources: { 'textColor:rgb(17, 17, 17)': ['computed:text'] },
      textColorPairObservations: [
        {
          captureId: 'https://example.com/|desktop',
          background: 'rgb(255, 255, 255)',
          foreground: 'rgb(17, 17, 17)',
          textRole: 'other',
          count: 1,
          ownerIds: ['incidental-label'],
        },
      ],
    })
    const tokenProbe = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    tokenProbe.colors = { background: '#ffffff', foreground: '#111111' }
    tokenProbe.evidence = buildTokenEvidence(tokenProbe, [{ url: 'https://example.com/', viewport: 'desktop', styles }])

    expect(tokenProbe.evidence['colors.foreground']).toMatchObject({
      reuseScope: 'local',
      pairedSurface: expect.objectContaining({
        ownerCount: 1,
        minimumPageOwnerCount: 1,
        mainTextPageCount: 0,
        mainTextOwnerCount: 0,
      }),
    })

    reselectPortableFoundationColors(tokenProbe, [{ url: 'https://example.com/', viewport: 'desktop', styles }])
    expect(tokenProbe.colors.foreground).toBeUndefined()
  })

  test('keeps a majority light-surface foreground instead of a portable foreground from unrelated dark surfaces', () => {
    const captures = Array.from({ length: 7 }, (_value, index) => {
      const url = `https://example.com/page-${index + 1}`
      const lightForeground = 'rgb(31, 35, 40)'
      const darkSurfaceForeground = 'rgb(240, 246, 252)'
      const mutedLightForeground = 'rgb(89, 99, 110)'
      const occupiedAccent = 'rgb(0, 82, 204)'
      return {
        url,
        viewport: 'desktop',
        styles: createExtractedStyles({
          usageCount: {
            'bgColor:rgb(255, 255, 255)': 1,
            ...(index < 5 ? { [`textColor:${lightForeground}`]: 20 } : {}),
            ...(index < 6 ? { [`textColor:${darkSurfaceForeground}`]: 12 } : {}),
            ...(index < 5 ? { [`textColor:${mutedLightForeground}`]: 8 } : {}),
            [`textColor:${occupiedAccent}`]: 15,
          },
          usageOwnerIds: {
            'bgColor:rgb(255, 255, 255)': ['body'],
            ...(index < 5
              ? {
                  [`textColor:${lightForeground}`]: Array.from({ length: 20 }, (_item, owner) => `copy-${owner}`),
                }
              : {}),
            [`textColor:${occupiedAccent}`]: Array.from({ length: 15 }, (_item, owner) => `accent-${owner}`),
            ...(index < 6
              ? {
                  [`textColor:${darkSurfaceForeground}`]: Array.from(
                    { length: 12 },
                    (_item, owner) => `inverse-${owner}`,
                  ),
                }
              : {}),
            ...(index < 5
              ? {
                  [`textColor:${mutedLightForeground}`]: Array.from({ length: 8 }, (_item, owner) => `muted-${owner}`),
                }
              : {}),
          },
          valueSources: {
            'bgColor:rgb(255, 255, 255)': ['element:page-background'],
            ...(index < 5 ? { [`textColor:${lightForeground}`]: ['computed:text'] } : {}),
            ...(index < 6 ? { [`textColor:${darkSurfaceForeground}`]: ['computed:text'] } : {}),
            ...(index < 5 ? { [`textColor:${mutedLightForeground}`]: ['computed:text'] } : {}),
            [`textColor:${occupiedAccent}`]: ['computed:text'],
          },
          textColorPairObservations: [
            ...(index < 5
              ? [
                  {
                    captureId: `${url}|desktop`,
                    background: 'rgb(255, 255, 255)',
                    foreground: lightForeground,
                    textRole: 'body' as const,
                    count: 20,
                    ownerIds: Array.from({ length: 20 }, (_item, owner) => `copy-${owner}`),
                  },
                ]
              : []),
            {
              captureId: `${url}|desktop`,
              background: 'rgb(255, 255, 255)',
              foreground: occupiedAccent,
              textRole: 'label' as const,
              count: 15,
              ownerIds: Array.from({ length: 15 }, (_item, owner) => `accent-${owner}`),
            },
            ...(index < 2
              ? [
                  {
                    captureId: `${url}|desktop`,
                    background: 'rgb(13, 17, 23)',
                    foreground: darkSurfaceForeground,
                    textRole: 'heading' as const,
                    count: 12,
                    ownerIds: Array.from({ length: 12 }, (_item, owner) => `inverse-${owner}`),
                  },
                ]
              : []),
            ...(index < 5
              ? [
                  {
                    captureId: `${url}|desktop`,
                    background: 'rgb(255, 255, 255)',
                    foreground: mutedLightForeground,
                    textRole: 'label' as const,
                    count: 8,
                    ownerIds: Array.from({ length: 8 }, (_item, owner) => `muted-${owner}`),
                  },
                ]
              : []),
          ],
          renderedTextStyleObservations: [
            ...(index < 5
              ? renderedTextOwners(
                  lightForeground,
                  'rgb(255, 255, 255)',
                  Array.from({ length: 20 }, (_item, owner) => `copy-${owner}`),
                  'body',
                )
              : []),
            ...(index < 5
              ? renderedTextOwners(
                  mutedLightForeground,
                  'rgb(255, 255, 255)',
                  Array.from({ length: 8 }, (_item, owner) => `muted-${owner}`),
                  'label',
                )
              : []),
          ],
        }),
      }
    })
    const tokenProbe = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    tokenProbe.colors = {
      background: '#ffffff',
      foreground: '#f0f6fc',
      'muted-foreground': '#f0f6fc',
      'editorial-accent': '#0052cc',
    }
    tokenProbe.candidates = {
      colors: [
        { value: '#1f2328', kind: 'observed-unassigned', observationCount: 100, sources: ['computed:text'] },
        { value: '#59636e', kind: 'observed-unassigned', observationCount: 40, sources: ['computed:text'] },
      ],
    }
    tokenProbe.evidence = buildTokenEvidence(tokenProbe, captures)
    expect(tokenProbe.evidence['colors.foreground']).toMatchObject({ reuseScope: 'local', pageCount: 6 })

    reselectPortableFoundationColors(tokenProbe, captures)
    promotePortableDesignTokens(tokenProbe)

    expect(tokenProbe.colors.foreground).toBe('#1f2328')
    expect(tokenProbe.colors['muted-foreground']).toBe('#59636e')
    expect(tokenProbe.evidence['colors.foreground']).toMatchObject({
      reuseScope: 'foundation',
      pageCount: 5,
      pageSupportRatio: 0.714,
      pairedSurface: expect.objectContaining({ pageCount: 5, contrastRatio: expect.any(Number) }),
    })
    expect(tokenProbe.evidence['colors.muted-foreground']).toMatchObject({
      reuseScope: 'foundation',
      pairedSurface: expect.objectContaining({ background: '#ffffff', pageCount: 5 }),
    })
  })

  test('does not promote a repeated chromatic heading accent as the muted foreground', () => {
    const captures = Array.from({ length: 3 }, (_value, index) => {
      const url = `https://example.com/section-${index + 1}`
      const primary = 'rgb(18, 18, 18)'
      const headingAccent = 'rgb(199, 0, 0)'
      const mutedCopy = 'rgb(89, 99, 110)'
      const bodyOwners = Array.from({ length: 12 }, (_item, owner) => `body-${owner}`)
      const titleOwners = Array.from({ length: 2 }, (_item, owner) => `title-${owner}`)
      const primaryOwners = [...bodyOwners, ...titleOwners]
      const accentOwners = Array.from({ length: 5 }, (_item, owner) => `kicker-${owner}`)
      const mutedOwners = Array.from({ length: 2 }, (_item, owner) => `metadata-${owner}`)
      return {
        url,
        viewport: 'desktop',
        styles: createExtractedStyles({
          usageCount: {
            [`textColor:${primary}`]: primaryOwners.length,
            [`textColor:${headingAccent}`]: accentOwners.length,
            [`textColor:${mutedCopy}`]: mutedOwners.length,
          },
          usageOwnerIds: {
            [`textColor:${primary}`]: primaryOwners,
            [`textColor:${headingAccent}`]: accentOwners,
            [`textColor:${mutedCopy}`]: mutedOwners,
          },
          valueSources: {
            [`textColor:${primary}`]: ['computed:text'],
            [`textColor:${headingAccent}`]: ['computed:text'],
            [`textColor:${mutedCopy}`]: ['computed:text'],
          },
          textColorPairObservations: [
            {
              captureId: `${url}|desktop`,
              background: 'rgb(255, 255, 255)',
              foreground: primary,
              textRole: 'body',
              count: bodyOwners.length,
              ownerIds: bodyOwners,
            },
            {
              captureId: `${url}|desktop`,
              background: 'rgb(255, 255, 255)',
              foreground: primary,
              textRole: 'heading',
              count: titleOwners.length,
              ownerIds: titleOwners,
            },
            {
              captureId: `${url}|desktop`,
              background: 'rgb(255, 255, 255)',
              foreground: headingAccent,
              textRole: 'heading',
              count: accentOwners.length,
              ownerIds: accentOwners,
            },
            {
              captureId: `${url}|desktop`,
              background: 'rgb(255, 255, 255)',
              foreground: mutedCopy,
              textRole: 'label',
              count: mutedOwners.length,
              ownerIds: mutedOwners,
            },
          ],
          renderedTextStyleObservations: [
            ...renderedTextOwners(primary, 'rgb(255, 255, 255)', bodyOwners, 'body'),
            ...renderedTextOwners(primary, 'rgb(255, 255, 255)', titleOwners, 'heading'),
            ...renderedTextOwners(headingAccent, 'rgb(255, 255, 255)', accentOwners, 'heading'),
            ...renderedTextOwners(mutedCopy, 'rgb(255, 255, 255)', mutedOwners, 'label'),
          ],
        }),
      }
    })
    const tokenProbe = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    tokenProbe.colors = { background: '#ffffff', foreground: '#121212' }
    tokenProbe.candidates = {
      colors: [
        { value: '#c70000', kind: 'observed-unassigned', observationCount: 15, sources: ['computed:text'] },
        { value: '#59636e', kind: 'observed-unassigned', observationCount: 6, sources: ['computed:text'] },
      ],
    }
    tokenProbe.evidence = buildTokenEvidence(tokenProbe, captures)

    reselectPortableFoundationColors(tokenProbe, captures)
    promotePortableDesignTokens(tokenProbe)

    expect(tokenProbe.colors.foreground).toBe('#121212')
    expect(tokenProbe.colors['muted-foreground']).toBe('#59636e')
    expect(tokenProbe.colors['muted-foreground']).not.toBe('#c70000')
  })

  test('does not let an extra viewport from one URL outvote foreground evidence from another URL', () => {
    const capture = (captureId: string, foreground: string, count: number) =>
      createExtractedStyles({
        textColorPairObservations: [
          {
            captureId,
            background: 'rgb(255, 255, 255)',
            foreground,
            textRole: 'body',
            count,
          },
        ],
      })
    const homeDesktop = capture('https://example.com/|1440x900', 'rgb(17, 24, 39)', 1)
    const homeMobile = capture('https://example.com/|375x812', 'rgb(17, 24, 39)', 1_000)
    const docsDesktop = capture('https://example.com/docs|1440x900', 'rgb(34, 34, 34)', 10)
    const guideDesktop = capture('https://example.com/guide|1440x900', 'rgb(34, 34, 34)', 20)
    const colors = {
      palette: [],
      backgrounds: ['#ffffff'],
      texts: ['#222222', '#111827'],
      accents: [],
    }
    const build = (styles: ReturnType<typeof createExtractedStyles>[], urls: string[]) => {
      const merged = mergeStylesWithNormalizedUsage(styles, urls)
      return { merged, tokens: buildDesignTokens(merged, colors, merged, { background: '#ffffff' }) }
    }

    const base = build(
      [homeDesktop, docsDesktop, guideDesktop],
      ['https://example.com/', 'https://example.com/docs', 'https://example.com/guide'],
    )
    const repeated = build(
      [homeDesktop, homeMobile, docsDesktop, guideDesktop],
      ['https://example.com/', 'https://example.com/', 'https://example.com/docs', 'https://example.com/guide'],
    )

    expect(
      repeated.merged.textColorPairObservations?.find((observation) => observation.captureId === 'https://example.com/')
        ?.count,
    ).toBeCloseTo(1)
    expect(base.tokens.colors.foreground).toBe('#222222')
    expect(repeated.tokens.colors.foreground).toBe(base.tokens.colors.foreground)
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

    const tokens = buildDesignTokens(
      styles,
      {
        palette: [],
        backgrounds: ['#611f69'],
        texts: ['#000000', '#ffffff'],
        accents: [],
      },
      styles,
      { background: '#611f69' },
    )

    expect(tokens.colors.foreground).toBe('#ffffff')
  })

  test('does not fabricate contrast by replacing a nearby observed surface with the foundation background', () => {
    const evidence = buildForegroundPairEvidence('#ffffff', '#767676', [
      {
        url: 'https://example.com/',
        viewport: 'desktop',
        styles: createExtractedStyles({
          textColorPairObservations: [
            {
              captureId: 'https://example.com/|desktop',
              background: 'rgb(200, 200, 200)',
              foreground: 'rgb(118, 118, 118)',
              textRole: 'body',
              count: 2,
              ownerIds: ['copy-1', 'copy-2'],
            },
          ],
        }),
      },
    ])

    expect(evidence).toBeUndefined()
  })

  test('does not promote count-only text/background observations without exact owner identities', () => {
    const evidence = buildForegroundPairEvidence('#ffffff', '#111111', [
      {
        url: 'https://example.com/',
        viewport: 'desktop',
        styles: createExtractedStyles({
          textColorPairObservations: [
            {
              captureId: 'https://example.com/|desktop',
              background: 'rgb(255, 255, 255)',
              foreground: 'rgb(17, 17, 17)',
              textRole: 'body',
              count: 40,
            },
          ],
        }),
      },
    ])

    expect(evidence).toBeUndefined()
  })

  test('selects global foreground text only from exact promoted foundation surfaces', () => {
    const styles = createExtractedStyles({
      textColorPairObservations: [
        {
          captureId: 'https://example.com/|desktop',
          background: 'rgb(243, 246, 251)',
          foreground: 'rgb(91, 101, 120)',
          textRole: 'body',
          count: 40,
        },
        {
          captureId: 'https://example.com/|desktop',
          background: 'rgb(255, 255, 255)',
          foreground: 'rgb(23, 32, 51)',
          textRole: 'heading',
          count: 3,
        },
      ],
    })

    const tokens = buildDesignTokens(
      styles,
      {
        palette: [],
        backgrounds: ['#f3f6fb', '#ffffff'],
        texts: ['#5b6578', '#172033'],
        accents: [],
      },
      styles,
      { background: '#f3f6fb', surface: '#ffffff' },
    )

    expect(tokens.colors.foreground).toBe('#172033')
    expect(tokens.colors['muted-foreground']).toBe('#5b6578')
  })

  test('does not export a foreground that is readable only on a secondary surface', () => {
    const captures = Array.from({ length: 4 }, (_value, index) => {
      const url = `https://example.com/page-${index + 1}`
      const ownerIds = Array.from({ length: 12 }, (_item, owner) => `copy-${owner}`)
      return {
        url,
        viewport: 'desktop',
        styles: createExtractedStyles({
          usageCount: {
            'bgColor:rgb(2, 9, 10)': 1,
            'bgColor:rgb(255, 255, 255)': 12,
            'textColor:rgb(0, 0, 0)': 12,
          },
          usageOwnerCounts: {
            'bgColor:rgb(2, 9, 10)': 1,
            'bgColor:rgb(255, 255, 255)': 12,
            'textColor:rgb(0, 0, 0)': 12,
          },
          usageOwnerIds: {
            'bgColor:rgb(2, 9, 10)': ['body'],
            'bgColor:rgb(255, 255, 255)': ownerIds,
            'textColor:rgb(0, 0, 0)': ownerIds,
          },
          valueSources: {
            'bgColor:rgb(2, 9, 10)': ['computed:background', 'element:page-background'],
            'bgColor:rgb(255, 255, 255)': ['computed:background'],
            'textColor:rgb(0, 0, 0)': ['rendered:text'],
          },
          textColorPairObservations: [
            {
              captureId: `${url}|desktop`,
              background: 'rgb(255, 255, 255)',
              foreground: 'rgb(0, 0, 0)',
              textRole: 'body',
              count: ownerIds.length,
              ownerIds,
            },
          ],
          renderedTextStyleObservations: renderedTextOwners('rgb(0, 0, 0)', 'rgb(255, 255, 255)', ownerIds, 'body'),
        }),
      }
    })
    const tokenProbe = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    tokenProbe.colors = { background: '#02090a', secondary: '#ffffff', foreground: '#000000' }
    tokenProbe.evidence = buildTokenEvidence(tokenProbe, captures)
    expect(tokenProbe.evidence['colors.foreground']).toMatchObject({
      reuseScope: 'foundation',
      pairedSurface: expect.objectContaining({ background: '#ffffff' }),
    })

    promotePortableDesignTokens(tokenProbe)

    expect(tokenProbe.colors.background).toBe('#02090a')
    expect(tokenProbe.colors.foreground).toBeUndefined()
    expect(
      tokenProbe.candidates?.values?.some(
        (candidate) => candidate.group === 'colors' && candidate.role === 'foreground' && candidate.value === '#000000',
      ),
    ).toBe(true)
  })

  test('removes a foreground whose observed surface is removed from the portable catalog', () => {
    const canvas = 'rgb(245, 245, 247)'
    const localSurface = 'rgb(255, 255, 255)'
    const foreground = 'rgb(0, 0, 0)'
    const captures = Array.from({ length: 2 }, (_value, index) => {
      const url = `https://example.com/page-${index + 1}`
      const ownerIds = [`copy-${index}-1`, `copy-${index}-2`]
      return {
        url,
        viewport: 'desktop',
        styles: createExtractedStyles({
          usageCount: {
            [`bgColor:${canvas}`]: 1,
            [`bgColor:${localSurface}`]: 1,
            [`textColor:${foreground}`]: ownerIds.length,
          },
          usageOwnerIds: {
            [`bgColor:${canvas}`]: [`body-${index}`],
            [`bgColor:${localSurface}`]: [`panel-${index}`],
            [`textColor:${foreground}`]: ownerIds,
          },
          valueSources: {
            [`bgColor:${canvas}`]: ['element:page-background'],
            [`bgColor:${localSurface}`]: ['computed:background'],
            [`textColor:${foreground}`]: ['rendered:text'],
          },
          semanticSurfaceObservations: [
            {
              captureId: `${url}|desktop`,
              ownerId: `body-${index}`,
              value: canvas,
              domain: 'foundation',
              role: 'page-canvas',
              rendered: true,
              declared: false,
              elementKind: 'body',
            },
            {
              captureId: `${url}|desktop`,
              ownerId: `panel-${index}`,
              value: localSurface,
              domain: 'local',
              role: 'local-surface',
              rendered: true,
              declared: false,
              elementKind: 'section',
            },
          ],
          textColorPairObservations: [
            {
              captureId: `${url}|desktop`,
              background: localSurface,
              foreground,
              textRole: 'body',
              count: ownerIds.length,
              ownerIds,
            },
          ],
          renderedTextStyleObservations: renderedTextOwners(foreground, localSurface, ownerIds, 'body'),
        }),
      }
    })
    const tokenProbe = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    tokenProbe.colors = { background: '#f5f5f7', surface: '#ffffff', foreground: '#000000' }
    tokenProbe.evidence = buildTokenEvidence(tokenProbe, captures)

    expect(tokenProbe.evidence['colors.foreground'].pairedSurface?.background).toBe('#ffffff')
    stabilizePortableTokens(tokenProbe, captures)

    expect(tokenProbe.colors).toEqual({ background: '#f5f5f7' })
    expect(tokenProbe.evidence['colors.foreground']).toBeUndefined()
  })

  test('keeps area-supported card and secondary surfaces in evidence order', () => {
    const styles = createExtractedStyles({
      colors: ['rgb(243, 246, 251)', 'rgb(255, 255, 255)', 'rgb(232, 238, 248)', 'rgb(23, 32, 51)'],
      usageCount: {
        'bgArea:rgb(243, 246, 251)': 1_000_000,
        'bgArea:rgb(255, 255, 255)': 600_000,
        'bgArea:rgb(232, 238, 248)': 200_000,
        'textColor:rgb(23, 32, 51)': 10,
      },
      textColorPairObservations: [
        {
          captureId: 'https://example.com/|desktop',
          background: 'rgb(243, 246, 251)',
          foreground: 'rgb(23, 32, 51)',
          textRole: 'heading',
          count: 3,
        },
      ],
    })

    const clustered = clusterColors(styles.colors, styles.usageCount)
    const tokens = buildDesignTokens(styles, clustered, styles, {
      background: '#f3f6fb',
      surface: '#ffffff',
      secondary: '#e8eef8',
    })

    expect(clustered.backgrounds.slice(0, 3)).toEqual(['#f3f6fb', '#ffffff', '#e8eef8'])
    expect(tokens.colors).toMatchObject({
      background: '#f3f6fb',
      surface: '#ffffff',
      secondary: '#e8eef8',
      foreground: '#172033',
    })
  })

  test('selects an exact reusable surface from semantic owners before building tokens', () => {
    const weakSurface = 'rgb(232, 238, 248)'
    const supportedSurface = 'rgb(255, 255, 255)'
    const pageBackground = 'rgb(243, 246, 251)'
    const styles = createExtractedStyles({
      usageCount: {
        [`bgArea:${pageBackground}`]: 1,
        [`bgColor:${pageBackground}`]: 1,
        [`bgColor:${weakSurface}`]: 1,
        [`bgColor:${supportedSurface}`]: 2,
      },
      usageOwnerCounts: {
        [`bgArea:${pageBackground}`]: 1,
        [`bgColor:${pageBackground}`]: 1,
        [`bgColor:${weakSurface}`]: 1,
        [`bgColor:${supportedSurface}`]: 2,
      },
      usageOwnerIds: {
        [`bgArea:${pageBackground}`]: ['body'],
        [`bgColor:${pageBackground}`]: ['body'],
        [`bgColor:${weakSurface}`]: ['body > aside:nth-of-type(1)'],
        [`bgColor:${supportedSurface}`]: [
          'body > main:nth-of-type(1) > article:nth-of-type(1)',
          'body > main:nth-of-type(1) > article:nth-of-type(2)',
        ],
      },
      valueSources: {
        [`bgArea:${pageBackground}`]: ['element:page-background'],
        [`bgColor:${pageBackground}`]: ['element:page-background'],
        [`bgColor:${weakSurface}`]: ['computed:background'],
        [`bgColor:${supportedSurface}`]: ['computed:background'],
      },
      semanticSurfaceObservations: [
        {
          captureId: 'home|desktop',
          ownerId: 'body',
          value: pageBackground,
          domain: 'foundation',
          role: 'page-canvas',
          rendered: true,
          declared: false,
          elementKind: 'body',
        },
        {
          captureId: 'home|desktop',
          ownerId: 'aside',
          value: weakSurface,
          domain: 'foundation',
          role: 'content-surface',
          rendered: true,
          declared: false,
          elementKind: 'aside',
        },
        ...['article-1', 'article-2'].map((ownerId) => ({
          captureId: 'home|desktop',
          ownerId,
          value: supportedSurface,
          domain: 'foundation' as const,
          role: 'content-surface' as const,
          rendered: true,
          declared: false,
          elementKind: 'article',
        })),
      ],
    })
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]
    const selection = selectFoundationSurfaceColors(captures)
    const candidateTokens = buildDesignTokens(
      styles,
      {
        palette: [],
        backgrounds: ['#f3f6fb', '#e8eef8'],
        texts: [],
        accents: [],
      },
      styles,
      selection,
    )
    candidateTokens.evidence = buildTokenEvidence(candidateTokens, captures)

    expect(selection).toEqual({ background: '#f3f6fb', surface: '#ffffff' })
    expect(candidateTokens.colors.surface).toBe('#ffffff')
    expect(candidateTokens.evidence['colors.surface']).toMatchObject({
      reuseScope: 'foundation',
      ownerCount: 2,
    })
    expect(candidateTokens.candidates?.colors).toContainEqual(
      expect.objectContaining({ value: '#e8eef8', kind: 'observed-unassigned' }),
    )
  })

  test('keeps one substantial semantic content surface local on a single analyzed route', () => {
    const canvas = 'rgb(243, 244, 246)'
    const surface = 'rgb(255, 255, 255)'
    const styles = createExtractedStyles({
      colors: [canvas, surface],
      usageCount: { [`bgColor:${canvas}`]: 1, [`bgColor:${surface}`]: 1 },
      usageOwnerIds: { [`bgColor:${canvas}`]: ['body'], [`bgColor:${surface}`]: ['main'] },
      valueSources: {
        [`bgColor:${canvas}`]: ['element:page-background'],
        [`bgColor:${surface}`]: ['computed:background'],
      },
      semanticSurfaceObservations: [
        {
          captureId: 'home|desktop',
          ownerId: 'body',
          value: canvas,
          domain: 'foundation',
          role: 'page-canvas',
          rendered: true,
          declared: false,
          elementKind: 'body',
          areaRatio: 1,
          viewportCoverage: 1,
        },
        {
          captureId: 'home|desktop',
          ownerId: 'main',
          value: surface,
          domain: 'foundation',
          role: 'content-surface',
          rendered: true,
          declared: false,
          elementKind: 'main',
          areaRatio: 0.4,
          viewportCoverage: 0.4,
        },
      ],
    })
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]
    const selected = selectFoundationSurfaceColors(captures)
    const portable = buildDesignTokens(styles, clusterColors(styles.colors, styles.usageCount), styles, selected)
    portable.evidence = buildTokenEvidence(portable, captures)
    promotePortableDesignTokens(portable)

    expect(selected).toEqual({ background: '#f3f4f6' })
    expect(portable.colors.surface).toBeUndefined()
  })

  test('retains a semantic content surface observed on multiple routes without requiring global route coverage', () => {
    const canvas = 'rgb(243, 244, 246)'
    const surface = 'rgb(255, 255, 255)'
    const urls = [
      'https://example.com/',
      'https://example.com/article',
      'https://example.com/plain',
      'https://example.com/empty',
    ]
    const captures = urls.map((url, index) => {
      const hasContentSurface = index < 2
      const canvasOwnerId = `body-${index}`
      const surfaceOwnerId = `main-${index}`
      return {
        url,
        viewport: 'desktop',
        styles: createExtractedStyles({
          colors: hasContentSurface ? [canvas, surface] : [canvas],
          usageCount: {
            [`bgColor:${canvas}`]: 1,
            ...(hasContentSurface ? { [`bgColor:${surface}`]: 1 } : {}),
          },
          usageOwnerIds: {
            [`bgColor:${canvas}`]: [canvasOwnerId],
            ...(hasContentSurface ? { [`bgColor:${surface}`]: [surfaceOwnerId] } : {}),
          },
          valueSources: {
            [`bgColor:${canvas}`]: ['element:page-background'],
            ...(hasContentSurface ? { [`bgColor:${surface}`]: ['computed:background'] } : {}),
          },
          semanticSurfaceObservations: [
            {
              captureId: `route-${index}|desktop`,
              ownerId: canvasOwnerId,
              value: canvas,
              domain: 'foundation',
              role: 'page-canvas',
              rendered: true,
              declared: false,
              elementKind: 'body',
              areaRatio: 1,
              viewportCoverage: 1,
            },
            ...(hasContentSurface
              ? [
                  {
                    captureId: `route-${index}|desktop`,
                    ownerId: surfaceOwnerId,
                    value: surface,
                    domain: 'foundation' as const,
                    role: 'content-surface' as const,
                    rendered: true,
                    declared: false,
                    elementKind: 'main',
                    areaRatio: 0.4,
                    viewportCoverage: 0.4,
                  },
                ]
              : []),
          ],
        }),
      }
    })
    const merged = mergeStylesWithNormalizedUsage(
      captures.map((capture) => capture.styles),
      captures.map((capture) => capture.url),
      captures.map((capture) => capture.viewport),
    )
    const selected = selectFoundationSurfaceColors(captures)
    const portable = buildDesignTokens(merged, clusterColors(merged.colors, merged.usageCount), merged, selected)
    portable.evidence = buildTokenEvidence(portable, captures)
    promotePortableDesignTokens(portable)

    expect(selected).toEqual({ background: '#f3f4f6', surface: '#ffffff' })
    expect(portable.colors.surface).toBe('#ffffff')
    expect(portable.evidence?.['colors.surface']).toMatchObject({
      eligiblePageCount: 4,
      pageCount: 2,
      pageSupportRatio: 0.5,
      ownerCount: 2,
      reuseScope: 'foundation',
      sources: expect.arrayContaining(['semantic:content-surface', 'element:content-surface']),
    })
  })

  test('retains a portable semantic border instead of resolving an evidence tie lexically', () => {
    const semanticBorder = '#d8d2c6'
    const textColoredBorder = '#23201b'
    const owners = ['header', 'related-heading', 'footer']
    const styles = createExtractedStyles({
      usageCount: {
        [`borderColor:${semanticBorder}`]: owners.length,
        [`structuralBorderColor:${semanticBorder}`]: owners.length,
        [`borderColor:${textColoredBorder}`]: owners.length,
        [`structuralBorderColor:${textColoredBorder}`]: owners.length,
        [`textColor:${textColoredBorder}`]: 20,
      },
      usageOwnerCounts: {
        [`borderColor:${semanticBorder}`]: owners.length,
        [`structuralBorderColor:${semanticBorder}`]: owners.length,
        [`borderColor:${textColoredBorder}`]: owners.length,
        [`structuralBorderColor:${textColoredBorder}`]: owners.length,
        [`textColor:${textColoredBorder}`]: 20,
      },
      usageOwnerIds: {
        [`borderColor:${semanticBorder}`]: owners,
        [`structuralBorderColor:${semanticBorder}`]: owners,
        [`borderColor:${textColoredBorder}`]: ['card-1', 'card-2', 'card-3'],
        [`structuralBorderColor:${textColoredBorder}`]: ['card-1', 'card-2', 'card-3'],
        [`textColor:${textColoredBorder}`]: Array.from({ length: 20 }, (_value, index) => `text-${index}`),
      },
      valueSources: {
        [`borderColor:${semanticBorder}`]: ['computed:border'],
        [`structuralBorderColor:${semanticBorder}`]: ['element:structural-border'],
        [`borderColor:${textColoredBorder}`]: ['computed:border'],
        [`structuralBorderColor:${textColoredBorder}`]: ['element:structural-border'],
        [`textColor:${textColoredBorder}`]: ['rendered:text'],
      },
    })
    const candidateTokens = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    candidateTokens.colors = { border: semanticBorder }
    candidateTokens.candidates = {
      colors: [
        {
          value: textColoredBorder,
          kind: 'observed-unassigned',
          observationCount: owners.length,
          sources: ['computed:border', 'element:structural-border'],
        },
      ],
    }
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]
    candidateTokens.evidence = buildTokenEvidence(candidateTokens, captures)

    expect(candidateTokens.evidence['colors.border']).toMatchObject({
      ownerCount: 3,
      semanticAgreement: 1,
      reuseScope: 'foundation',
    })
    reselectPortableFoundationColors(candidateTokens, captures)

    expect(candidateTokens.colors.border).toBe(semanticBorder)
  })

  test('does not retain an action accent or page surface as a subtle foundation border', () => {
    const action = '#3984ff'
    const neutralBorder = '#d1d5db'
    const styles = createExtractedStyles({
      usageCount: {
        [`actionBackgroundColor:${action}`]: 4,
        [`borderColor:${action}`]: 1,
        [`borderColor:${neutralBorder}`]: 3,
        [`structuralBorderColor:${neutralBorder}`]: 3,
      },
      usageOwnerIds: {
        [`actionBackgroundColor:${action}`]: ['action-1', 'action-2', 'action-3', 'action-4'],
        [`borderColor:${action}`]: ['action-1'],
        [`borderColor:${neutralBorder}`]: ['card-1', 'card-2', 'card-3'],
        [`structuralBorderColor:${neutralBorder}`]: ['card-1', 'card-2', 'card-3'],
      },
      valueSources: {
        [`actionBackgroundColor:${action}`]: ['element:action'],
        [`borderColor:${action}`]: ['computed:border'],
        [`borderColor:${neutralBorder}`]: ['computed:border'],
        [`structuralBorderColor:${neutralBorder}`]: ['element:structural-border'],
      },
    })
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]
    const candidateTokens = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    candidateTokens.colors = {
      background: '#ffffff',
      surface: '#f7f7f5',
      primary: action,
      'border-subtle': action,
    }
    candidateTokens.candidates = {
      colors: [
        {
          value: neutralBorder,
          kind: 'observed-unassigned',
          observationCount: 3,
          sources: ['computed:border', 'element:structural-border'],
        },
      ],
    }
    candidateTokens.evidence = buildTokenEvidence(candidateTokens, captures)

    reselectPortableFoundationColors(candidateTokens, captures)

    expect(candidateTokens.colors.border).toBe(neutralBorder)
    expect(candidateTokens.colors['border-subtle']).toBeUndefined()
    expect(candidateTokens.colors.primary).toBe(action)

    candidateTokens.colors['border-subtle'] = '#ffffff'
    candidateTokens.evidence = buildTokenEvidence(candidateTokens, captures)
    reselectPortableFoundationColors(candidateTokens, captures)

    expect(candidateTokens.colors['border-subtle']).toBeUndefined()
  })

  test('allows a chromatic default border only with direct structural evidence', () => {
    const structuralBorder = '#6d4aff'
    const styles = createExtractedStyles({
      usageCount: {
        [`borderColor:${structuralBorder}`]: 3,
        [`structuralBorderColor:${structuralBorder}`]: 3,
      },
      usageOwnerIds: {
        [`borderColor:${structuralBorder}`]: ['panel-1', 'panel-2', 'panel-3'],
        [`structuralBorderColor:${structuralBorder}`]: ['panel-1', 'panel-2', 'panel-3'],
      },
      valueSources: {
        [`borderColor:${structuralBorder}`]: ['computed:border'],
        [`structuralBorderColor:${structuralBorder}`]: ['element:structural-border'],
      },
    })
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]
    const candidateTokens = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    candidateTokens.colors = { background: '#ffffff', border: structuralBorder }
    candidateTokens.evidence = buildTokenEvidence(candidateTokens, captures)

    reselectPortableFoundationColors(candidateTokens, captures)

    expect(candidateTokens.colors.border).toBe(structuralBorder)
  })

  test('never reselects a repeated status fill as a foundation surface', () => {
    const pageBackground = 'rgb(243, 246, 251)'
    const cardSurface = 'rgb(255, 255, 255)'
    const weakSecondary = 'rgb(232, 238, 248)'
    const statusFill = 'rgb(220, 38, 38)'
    const styles = createExtractedStyles({
      colors: [pageBackground, cardSurface, weakSecondary, statusFill],
      usageCount: {
        [`bgArea:${pageBackground}`]: 1,
        [`bgColor:${pageBackground}`]: 1,
        [`bgColor:${cardSurface}`]: 2,
        [`bgColor:${weakSecondary}`]: 1,
        [`bgColor:${statusFill}`]: 3,
        [`statusBackgroundColor:${statusFill}`]: 3,
      },
      usageOwnerIds: {
        [`bgArea:${pageBackground}`]: ['body'],
        [`bgColor:${pageBackground}`]: ['body'],
        [`bgColor:${cardSurface}`]: ['card-1', 'card-2'],
        [`bgColor:${weakSecondary}`]: ['aside'],
        [`bgColor:${statusFill}`]: ['status-1', 'status-2', 'status-3'],
        [`statusBackgroundColor:${statusFill}`]: ['status-1', 'status-2', 'status-3'],
      },
      valueSources: {
        [`bgArea:${pageBackground}`]: ['element:page-background'],
        [`bgColor:${pageBackground}`]: ['element:page-background'],
        [`bgColor:${cardSurface}`]: ['computed:background'],
        [`bgColor:${weakSecondary}`]: ['computed:background'],
        [`bgColor:${statusFill}`]: ['computed:background'],
        [`statusBackgroundColor:${statusFill}`]: ['element:status'],
      },
    })
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]
    const statusProbe = buildDesignTokens(styles, {
      palette: [],
      backgrounds: [statusFill],
      texts: [],
      accents: [],
    })
    statusProbe.colors = { secondary: statusFill }
    const statusEvidence = buildTokenEvidence(statusProbe, captures)['colors.secondary']

    expect(statusEvidence).toMatchObject({
      semanticConfidence: 'low',
      reuseScope: 'local',
      semanticAgreement: 0,
    })

    const tokens = buildDesignTokens(styles, {
      palette: [],
      backgrounds: [pageBackground, cardSurface, weakSecondary],
      texts: [],
      accents: [],
    })
    tokens.candidates = {
      colors: [{ value: '#dc2626', kind: 'observed-unassigned', observationCount: 3, sources: ['element:status'] }],
    }
    tokens.evidence = buildTokenEvidence(tokens, captures)
    reselectPortableFoundationColors(tokens, captures)

    expect(tokens.colors.secondary).not.toBe('#dc2626')
  })

  test('never reselects combined action and status owners as ordinary surface support', () => {
    const pageBackground = 'rgb(243, 246, 251)'
    const cardSurface = 'rgb(255, 255, 255)'
    const weakSecondary = 'rgb(232, 238, 248)'
    const contestedFill = 'rgb(220, 38, 38)'
    const styles = createExtractedStyles({
      colors: [pageBackground, cardSurface, weakSecondary, contestedFill],
      usageCount: {
        [`bgColor:${pageBackground}`]: 1,
        [`bgColor:${cardSurface}`]: 2,
        [`bgColor:${weakSecondary}`]: 1,
        [`bgColor:${contestedFill}`]: 3,
        [`actionBackgroundColor:${contestedFill}`]: 1,
        [`accentColor:${contestedFill}`]: 1,
        [`statusBackgroundColor:${contestedFill}`]: 1,
      },
      usageOwnerIds: {
        [`bgColor:${pageBackground}`]: ['body'],
        [`bgColor:${cardSurface}`]: ['card-1', 'card-2'],
        [`bgColor:${weakSecondary}`]: ['aside'],
        [`bgColor:${contestedFill}`]: ['ordinary-surface', 'action', 'status'],
        [`actionBackgroundColor:${contestedFill}`]: ['action'],
        [`accentColor:${contestedFill}`]: ['action'],
        [`statusBackgroundColor:${contestedFill}`]: ['status'],
      },
      valueSources: {
        [`bgColor:${pageBackground}`]: ['computed:background', 'element:page-background'],
        [`bgColor:${cardSurface}`]: ['computed:background'],
        [`bgColor:${weakSecondary}`]: ['computed:background'],
        [`bgColor:${contestedFill}`]: ['computed:background'],
        [`actionBackgroundColor:${contestedFill}`]: ['element:action'],
        [`accentColor:${contestedFill}`]: ['element:action'],
        [`statusBackgroundColor:${contestedFill}`]: ['element:status'],
      },
    })
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]
    const probe = buildDesignTokens(styles, {
      palette: [],
      backgrounds: [pageBackground, cardSurface, weakSecondary],
      texts: [],
      accents: [],
    })
    probe.colors.secondary = weakSecondary
    probe.candidates = {
      colors: [
        {
          value: '#dc2626',
          kind: 'observed-unassigned',
          observationCount: 3,
          sources: ['computed:background', 'element:action', 'element:status'],
        },
      ],
    }
    probe.evidence = buildTokenEvidence(probe, captures)

    const contestedEvidence = buildTokenEvidence(
      { ...structuredClone(probe), colors: { secondary: contestedFill } },
      captures,
    )['colors.secondary']
    expect(contestedEvidence).toMatchObject({
      ownerCount: 1,
      semanticConfidence: 'low',
      reuseScope: 'local',
    })

    reselectPortableFoundationColors(probe, captures)

    expect(probe.colors.secondary).not.toBe('#dc2626')
  })

  test('keeps an action border from replacing the structural border role', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'borderColor:rgb(23, 114, 246)': 8,
        'borderColor:rgb(235, 236, 237)': 5,
        'structuralBorderColor:rgb(235, 236, 237)': 5,
        'primaryActionBackgroundColor:rgb(23, 114, 246)': 2,
      },
    })
    const tokens = buildDesignTokens(
      styles,
      {
        palette: [],
        backgrounds: ['#f4f6f9', '#ffffff'],
        texts: ['#191b1f'],
        accents: ['#1772f6'],
      },
      styles,
      { background: '#f4f6f9', surface: '#ffffff' },
    )

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
        measurementConfidence: 'low',
        semanticConfidence: 'low',
        reuseScope: 'local',
        observationCount: 2,
        ownerCount: 1,
        semanticAgreement: 0.5,
        pageCount: 1,
        captureCount: 1,
        eligiblePageCount: 1,
        pageSupportRatio: 1,
        pages: ['https://example.com/'],
        sources: ['usage:structuralBorderColor'],
        reasons: ['computed-style'],
      },
    }
    result.colors = { border: result.colors.border! }
    result.typography = {
      fontFamilies: [],
      fontStacks: [],
      fontSizes: [],
      fontWeights: [],
      lineHeights: [],
      letterSpacings: [],
    }
    result.spacing = []
    result.radii = []
    result.shadows = []
    result.borders = []
    result.zIndices = []
    result.transitions = []
    result.usageCount = {
      'borderColor:rgb(181, 186, 194)': 1,
      'structuralBorderColor:rgb(181, 186, 194)': 1,
    }

    promotePortableDesignTokens(result)

    expect(result.colors.border).toBeUndefined()
    expect(result.candidates?.values).toContainEqual(
      expect.objectContaining({
        group: 'colors',
        role: 'border',
        value: 'rgb(181, 186, 194)',
        sourcePath: 'colors.border',
        rejectionReason: 'low-semantic-confidence',
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

  test('splits an equal color value into semantic candidates with distinct provenance', () => {
    const value = 'rgb(124, 58, 237)'
    const candidateTokens = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    candidateTokens.candidates = {
      colors: [{ value: '#7c3aed', kind: 'observed-unassigned', observationCount: 3, sources: [] }],
    }
    const styles = createExtractedStyles({
      usageCount: { [`bgColor:${value}`]: 2, [`textColor:${value}`]: 1 },
      usageOwnerCounts: { [`bgColor:${value}`]: 2, [`textColor:${value}`]: 1 },
      usageOwnerIds: {
        [`bgColor:${value}`]: ['body > section:nth-of-type(1)', 'body > section:nth-of-type(2)'],
        [`textColor:${value}`]: ['body > p:nth-of-type(1)'],
      },
      valueSources: {
        [`bgColor:${value}`]: ['computed:background'],
        [`textColor:${value}`]: ['rendered:text'],
      },
      valueSourceCounts: {
        [`bgColor:${value}`]: { 'computed:background': 2 },
        [`textColor:${value}`]: { 'rendered:text': 1 },
      },
      valueSourceOwnerIds: {
        [`bgColor:${value}`]: {
          'computed:background': ['body > section:nth-of-type(1)', 'body > section:nth-of-type(2)'],
        },
        [`textColor:${value}`]: { 'rendered:text': ['body > p:nth-of-type(1)'] },
      },
    })
    const mobileStyles = createExtractedStyles({
      usageCount: { [`bgColor:${value}`]: 1 },
      usageOwnerCounts: { [`bgColor:${value}`]: 1 },
      usageOwnerIds: { [`bgColor:${value}`]: ['body > section:nth-of-type(3)'] },
      valueSources: { [`bgColor:${value}`]: ['computed:background'] },
      valueSourceCounts: { [`bgColor:${value}`]: { 'computed:background': 1 } },
      valueSourceOwnerIds: {
        [`bgColor:${value}`]: { 'computed:background': ['body > section:nth-of-type(3)'] },
      },
    })

    enrichColorCandidateEvidence(candidateTokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles },
      { url: 'https://example.com/', viewport: 'mobile', styles: mobileStyles },
    ])

    const candidates = candidateTokens.candidates?.values || []
    expect(candidates.map((candidate) => candidate.role).sort()).toEqual(['background', 'foreground'])
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(2)
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'background',
          evidence: expect.objectContaining({
            ownerCount: 2,
            semanticAgreement: 1,
            pageCount: 1,
            captureCount: 2,
            sources: ['computed:background'],
            sourceCounts: { 'computed:background': 2 },
            roleCounts: { background: 2 },
          }),
        }),
        expect.objectContaining({
          role: 'foreground',
          evidence: expect.objectContaining({
            ownerCount: 1,
            semanticAgreement: 1,
            pageCount: 1,
            captureCount: 1,
            // This fixture has usage metadata but no auditable rendered-owner observation, so the candidate must not
            // preserve a rendered-text provenance claim that downstream bundle audit cannot verify.
            sources: [],
            roleCounts: { foreground: 1 },
          }),
        }),
      ]),
    )
  })

  test('derives background candidate reuse scope from semantic owners rather than route frequency', () => {
    const value = '#111111'
    const candidateTokens = () => {
      const tokens = buildDesignTokens(createExtractedStyles(), {
        palette: [],
        backgrounds: [],
        texts: [],
        accents: [],
      })
      tokens.candidates = {
        colors: [{ value, kind: 'observed-unassigned', observationCount: 2, sources: [] }],
      }
      return tokens
    }
    const capture = (url: string, semanticSource: 'semantic:chrome-surface' | 'semantic:content-surface') => {
      const ownerId = `body > ${semanticSource === 'semantic:chrome-surface' ? 'header' : 'article'}`
      return {
        url,
        viewport: 'desktop',
        styles: createExtractedStyles({
          usageCount: { [`bgColor:${value}`]: 1 },
          usageOwnerCounts: { [`bgColor:${value}`]: 1 },
          usageOwnerIds: { [`bgColor:${value}`]: [ownerId] },
          valueSources: { [`bgColor:${value}`]: ['computed:background', semanticSource] },
          valueSourceCounts: {
            [`bgColor:${value}`]: { 'computed:background': 1, [semanticSource]: 1 },
          },
          valueSourceOwnerIds: {
            [`bgColor:${value}`]: {
              'computed:background': [ownerId],
              [semanticSource]: [ownerId],
            },
          },
        }),
      }
    }
    const urls = ['https://example.com/', 'https://example.com/about']

    const chromeTokens = candidateTokens()
    enrichColorCandidateEvidence(
      chromeTokens,
      urls.map((url) => capture(url, 'semantic:chrome-surface')),
    )
    expect(chromeTokens.candidates?.values).toContainEqual(
      expect.objectContaining({
        role: 'background',
        evidence: expect.objectContaining({ reuseScope: 'component' }),
      }),
    )

    const contentTokens = candidateTokens()
    enrichColorCandidateEvidence(
      contentTokens,
      urls.map((url) => capture(url, 'semantic:content-surface')),
    )
    expect(contentTokens.candidates?.values).toContainEqual(
      expect.objectContaining({
        role: 'background',
        evidence: expect.objectContaining({ reuseScope: 'foundation' }),
      }),
    )
  })

  test('persists auditable rendered-owner and pair provenance for a foreground candidate', () => {
    const value = '#333333'
    const ownerIds = ['copy-1', 'copy-2']
    const styles = createExtractedStyles({
      usageCount: { [`textColor:${value}`]: 2 },
      usageOwnerCounts: { [`textColor:${value}`]: 2 },
      usageOwnerIds: { [`textColor:${value}`]: ownerIds },
      valueSources: { [`textColor:${value}`]: ['rendered:text'] },
      valueSourceCounts: { [`textColor:${value}`]: { 'rendered:text': 2 } },
      valueSourceOwnerIds: { [`textColor:${value}`]: { 'rendered:text': ownerIds } },
      textColorPairObservations: [
        {
          captureId: 'https://example.com/|desktop',
          background: '#ffffff',
          foreground: value,
          textRole: 'body',
          count: 2,
          ownerIds,
        },
      ],
      renderedTextStyleObservations: renderedTextOwners(value, '#ffffff', ownerIds, 'body'),
    })
    const tokens = buildDesignTokens(createExtractedStyles(), {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    tokens.colors = { background: '#ffffff' }
    tokens.candidates = {
      colors: [{ value, kind: 'observed-unassigned', observationCount: 2, sources: ['rendered:text'] }],
    }

    enrichColorCandidateEvidence(tokens, [{ url: 'https://example.com/', viewport: 'desktop', styles }])

    const candidate = tokens.candidates?.values?.find((item) => item.role === 'foreground' && item.value === value)
    expect(candidate?.evidence).toMatchObject({
      ownerCount: 2,
      pageCount: 1,
      sources: expect.arrayContaining(['rendered:text', 'observed:text-background-pair']),
      renderedTextOwners: [
        expect.objectContaining({ ownerId: 'copy-1', viewport: 'desktop' }),
        expect.objectContaining({ ownerId: 'copy-2', viewport: 'desktop' }),
      ],
      pairedSurface: expect.objectContaining({ background: '#ffffff', ownerCount: 2, pageCount: 1 }),
    })
  })

  test('recovers an orthogonal same-value color candidate without injecting a legacy candidate', () => {
    const primary = '#2255ff'
    const neutralBorder = '#d1d5db'
    const styles = createExtractedStyles({
      usageCount: {
        [`primaryActionBackgroundColor:${primary}`]: 3,
        [`borderColor:${primary}`]: 1,
        [`structuralBorderColor:${primary}`]: 1,
        [`borderColor:${neutralBorder}`]: 3,
        [`structuralBorderColor:${neutralBorder}`]: 3,
      },
      usageOwnerCounts: {
        [`primaryActionBackgroundColor:${primary}`]: 3,
        [`borderColor:${primary}`]: 1,
        [`structuralBorderColor:${primary}`]: 1,
        [`borderColor:${neutralBorder}`]: 3,
        [`structuralBorderColor:${neutralBorder}`]: 3,
      },
      usageOwnerIds: {
        [`primaryActionBackgroundColor:${primary}`]: ['action-1', 'action-2', 'action-3'],
        [`borderColor:${primary}`]: ['structural-blue-border'],
        [`structuralBorderColor:${primary}`]: ['structural-blue-border'],
        [`borderColor:${neutralBorder}`]: ['border-1', 'border-2', 'border-3'],
        [`structuralBorderColor:${neutralBorder}`]: ['border-1', 'border-2', 'border-3'],
      },
      valueSources: {
        [`primaryActionBackgroundColor:${primary}`]: ['element:primary-action'],
        [`borderColor:${primary}`]: ['computed:border'],
        [`structuralBorderColor:${primary}`]: ['element:structural-border'],
        [`borderColor:${neutralBorder}`]: ['computed:border'],
        [`structuralBorderColor:${neutralBorder}`]: ['element:structural-border'],
      },
    })
    const candidateTokens = buildDesignTokens(styles, {
      palette: [],
      backgrounds: [],
      texts: [],
      accents: [],
    })
    candidateTokens.colors = { primary, border: neutralBorder }
    delete candidateTokens.candidates
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]
    candidateTokens.evidence = buildTokenEvidence(candidateTokens, captures)

    enrichColorCandidateEvidence(candidateTokens, captures)
    promotePortableDesignTokens(candidateTokens)

    expect(candidateTokens.colors).toEqual({ primary, border: neutralBorder })
    expect(candidateTokens.candidates?.values).toContainEqual(
      expect.objectContaining({ group: 'colors', role: 'border', value: primary, provenance: 'observed-color' }),
    )
    expect(candidateTokens.candidates?.values).not.toContainEqual(
      expect.objectContaining({ group: 'colors', role: 'action-background', value: primary }),
    )
  })

  test('preserves independent text and border provenance when one owner paints both with the same value', () => {
    const value = '#333333'
    const styles = createExtractedStyles({
      usageCount: {
        [`textColor:${value}`]: 2,
        [`borderColor:${value}`]: 1,
        [`structuralBorderColor:${value}`]: 1,
      },
      usageOwnerCounts: {
        [`textColor:${value}`]: 2,
        [`borderColor:${value}`]: 1,
        [`structuralBorderColor:${value}`]: 1,
      },
      usageOwnerIds: {
        [`textColor:${value}`]: ['card', 'copy'],
        [`borderColor:${value}`]: ['card'],
        [`structuralBorderColor:${value}`]: ['card'],
      },
      valueSources: {
        [`textColor:${value}`]: ['rendered:text'],
        [`borderColor:${value}`]: ['computed:border'],
        [`structuralBorderColor:${value}`]: ['element:structural-border'],
      },
      valueSourceOwnerIds: {
        [`textColor:${value}`]: { 'rendered:text': ['card', 'copy'] },
        [`borderColor:${value}`]: { 'computed:border': ['card'] },
        [`structuralBorderColor:${value}`]: { 'element:structural-border': ['card'] },
      },
    })
    const tokens = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })
    tokens.colors = { foreground: value }
    delete tokens.candidates
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]
    tokens.evidence = buildTokenEvidence(tokens, captures)

    enrichColorCandidateEvidence(tokens, captures)
    promotePortableDesignTokens(tokens)

    expect(tokens.candidates?.values).toContainEqual(
      expect.objectContaining({
        group: 'colors',
        role: 'border',
        value,
        provenance: 'observed-color',
        evidence: expect.objectContaining({ ownerCount: 1, semanticAgreement: 1, roleCounts: { border: 1 } }),
      }),
    )
    expect(tokens.candidates?.values).toContainEqual(
      expect.objectContaining({
        group: 'colors',
        role: 'foreground',
        value,
        evidence: expect.objectContaining({ ownerCount: 2, semanticAgreement: 1, roleCounts: { foreground: 2 } }),
      }),
    )
  })

  test('keeps rejected semantic color candidate identity stable across provisional role assignment', () => {
    const value = '#2255ff'
    const usageKey = `primaryActionBackgroundColor:${value}`
    const styles = createExtractedStyles({
      usageCount: { [usageKey]: 1 },
      usageOwnerCounts: { [usageKey]: 1 },
      usageOwnerIds: { [usageKey]: ['single-action'] },
      valueSources: { [usageKey]: ['element:primary-action'] },
    })
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]
    const finalize = (proposePrimary: boolean) => {
      const result = buildDesignTokens(styles, { palette: [], backgrounds: [], texts: [], accents: [] })
      if (proposePrimary) {
        result.colors = { primary: value }
        delete result.candidates
      } else {
        result.colors = {}
      }
      result.evidence = buildTokenEvidence(result, captures)
      enrichColorCandidateEvidence(result, captures)
      promotePortableDesignTokens(result)
      return result
    }

    const proposed = finalize(true)
    const unproposed = finalize(false)
    const semanticCandidate = (tokens: ReturnType<typeof finalize>) =>
      tokens.candidates?.values?.find(
        (candidate) =>
          candidate.group === 'colors' && candidate.role === 'action-background' && candidate.value === value,
      )

    expect(proposed.colors.primary).toBeUndefined()
    expect(semanticCandidate(proposed)).toMatchObject({
      provenance: 'observed-color',
      rejectionReason: 'unassigned-role',
    })
    expect(semanticCandidate(proposed)?.id).toBe(semanticCandidate(unproposed)?.id)
    expect(proposed.candidates?.values).not.toContainEqual(
      expect.objectContaining({ role: 'primary', provenance: 'built-token', value }),
    )
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

  test('separates default and subtle borders without duplicating the canvas as a secondary surface', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'structuralBorderColor:rgb(248, 248, 250)': 40,
        'structuralBorderColor:rgb(235, 236, 237)': 34,
        'structuralBorderColor:rgb(217, 83, 80)': 32,
      },
    })
    const tokens = buildDesignTokens(
      styles,
      {
        palette: [],
        backgrounds: ['#f4f6f9', '#ffffff'],
        texts: ['#191b1f'],
        accents: ['#1772f6'],
      },
      styles,
      { background: '#f4f6f9', surface: '#ffffff' },
    )

    expect(tokens.colors.surface).toBe('#ffffff')
    expect(tokens.colors.secondary).toBeUndefined()
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
          role: 'primary-action',
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

  test('keeps a generic filled button as an action accent instead of a primary action contract', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'actionBackgroundColor:rgb(23, 114, 246)': 3,
        'actionForegroundColor:rgb(255, 255, 255)': 3,
      },
      colorRoleObservations: [
        {
          captureId: 'https://example.com/|desktop',
          elementRef: 'body > button',
          elementKind: 'button',
          role: 'action',
          background: 'rgb(23, 114, 246)',
          foreground: 'rgb(255, 255, 255)',
        },
      ],
    })
    const result = buildDesignTokens(styles, {
      palette: [{ hex: '#1772f6', count: 3 }],
      backgrounds: ['#ffffff'],
      texts: ['#111827'],
      accents: ['#1772f6'],
    })

    expect(result.colors.primary).toBeUndefined()
    expect(result.colors.accent).toBe('#1772f6')
    expect(result.colorRoles?.primaryAction).toBeUndefined()
  })

  test('retains exact rendered colors even when clustering would merge or cap them', () => {
    const styles = createExtractedStyles({
      colors: ['rgb(243, 246, 251)', 'rgb(255, 255, 255)', 'rgb(232, 238, 248)'],
      usageCount: {
        'bgColor:rgb(243, 246, 251)': 1,
        'bgColor:rgb(255, 255, 255)': 8,
        'bgColor:rgb(232, 238, 248)': 2,
      },
    })
    const result = buildDesignTokens(styles, {
      palette: [{ hex: '#ffffff', count: 11 }],
      backgrounds: ['#f3f6fb', '#ffffff'],
      texts: [],
      accents: [],
    })

    expect(result.candidates?.colors).toContainEqual(
      expect.objectContaining({ value: '#e8eef8', kind: 'observed-unassigned' }),
    )
  })

  test('selects an exact repeated card surface before token building when clustering omits the close value', () => {
    const canvas = 'rgb(248, 250, 252)'
    const card = 'rgb(255, 255, 255)'
    const styles = createExtractedStyles({
      colors: [canvas, card],
      usageCount: {
        [`bgArea:${canvas}`]: 600_000,
        [`bgColor:${canvas}`]: 1,
        [`bgColor:${card}`]: 2,
      },
      usageOwnerIds: {
        [`bgArea:${canvas}`]: ['body'],
        [`bgColor:${canvas}`]: ['body'],
        [`bgColor:${card}`]: ['card-1', 'card-2'],
      },
      valueSources: {
        [`bgArea:${canvas}`]: ['element:page-background'],
        [`bgColor:${canvas}`]: ['element:page-background'],
        [`bgColor:${card}`]: ['computed:background'],
      },
      semanticSurfaceObservations: [
        {
          captureId: 'home|desktop',
          ownerId: 'body',
          value: canvas,
          domain: 'foundation',
          role: 'page-canvas',
          rendered: true,
          declared: false,
          elementKind: 'body',
        },
        ...['card-1', 'card-2'].map((ownerId) => ({
          captureId: 'home|desktop',
          ownerId,
          value: card,
          domain: 'foundation' as const,
          role: 'content-surface' as const,
          rendered: true,
          declared: false,
          elementKind: 'article',
        })),
      ],
    })
    const clustered = clusterColors(styles.colors, styles.usageCount)
    const captures = [{ url: 'https://example.com/', viewport: 'desktop', styles }]
    const tokens = buildDesignTokens(styles, clustered, styles, selectFoundationSurfaceColors(captures))

    expect(clustered.backgrounds).toEqual(['#f8fafc'])
    expect(tokens.colors).toMatchObject({ background: '#f8fafc' })
    expect(tokens.colors.surface).toBe('#ffffff')

    tokens.evidence = buildTokenEvidence(tokens, captures)
    promotePortableDesignTokens(tokens)

    expect(tokens.colors.surface).toBe('#ffffff')
    expect(tokens.evidence?.['colors.surface']).toMatchObject({
      reuseScope: 'foundation',
      ownerCount: 2,
    })
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
