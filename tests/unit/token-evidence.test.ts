import { describe, expect, test } from 'vitest'

import { buildTokenEvidence } from '../../src/core/analyzer/token-evidence.js'
import { promotePortableDesignTokens } from '../../src/core/analyzer/token-promotion.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'
import { generateDesignDoc, generateDtcgJson } from '../../src/core/export/index.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

const tokens: DesignToken = {
  colors: { primary: '#1772f6', 'palette-1': '#7c3aed' },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['1rem'],
    fontWeights: ['400'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: ['16px'],
  radii: [],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: [],
}

function renderedFontOwner(ownerId: string, fontFamily: string) {
  return {
    ownerId,
    textRole: 'body' as const,
    styles: {
      color: 'rgb(23, 32, 51)',
      backgroundColor: 'rgb(255, 255, 255)',
      fontFamily,
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
      foreground: 'rgb(23, 32, 51)',
    },
  }
}

function observedStyles() {
  return createExtractedStyles({
    usageCount: {
      'primaryActionColor:rgb(23, 114, 246)': 4,
      'brandTokenColor:rgb(23, 114, 246)': 1,
      'fontTextFamily:Inter, sans-serif': 120,
      'fontSize:16px': 20,
      'fontWeight:400': 20,
      'typeMetric:16px|24px': 20,
      'spacing:16px': 8,
    },
    usageOwnerIds: {
      'fontTextFamily:Inter, sans-serif': ['text-1', 'text-2'],
      'fontSize:16px': ['text-1', 'text-2'],
      'fontWeight:400': ['text-1', 'text-2'],
      'typeMetric:16px|24px': ['text-1', 'text-2'],
    },
    valueSources: {
      'brandTokenColor:rgb(23, 114, 246)': ['css-variable:--brand-primary'],
      'primaryActionColor:rgb(23, 114, 246)': ['element:primary-action'],
      'fontTextFamily:Inter, sans-serif': ['rendered:text'],
    },
    renderedTextStyleObservations: [
      renderedFontOwner('text-1', 'Inter, sans-serif'),
      renderedFontOwner('text-2', 'Inter, sans-serif'),
    ],
  })
}

describe('token evidence', () => {
  test('counts unique pages, preserves provenance, and boosts cross-page confidence', () => {
    const evidence = buildTokenEvidence(tokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles: observedStyles() },
      { url: 'https://example.com/', viewport: 'mobile', styles: observedStyles() },
      { url: 'https://example.com/pricing', viewport: 'desktop', styles: observedStyles() },
    ])

    expect(evidence['colors.primary']).toMatchObject({ confidence: 'high', pageCount: 2, captureCount: 3 })
    expect(evidence['colors.primary'].sources).toContain('css-variable:--brand-primary')
    expect(evidence['colors.primary'].reasons).toContain('cross-page')
    expect(evidence['typography.fontSizes.0'].pageCount).toBe(2)
    expect(evidence['typography.lineHeights.0'].observationCount).toBeGreaterThan(0)
  })

  test('attaches rendered text owners only to text-derived token groups', () => {
    const styles = createExtractedStyles({
      usageCount: {
        'fontTextFamily:Inter, sans-serif': 1,
        'spacing:16px': 1,
      },
      usageOwnerIds: {
        'fontTextFamily:Inter, sans-serif': ['shared-owner'],
        'spacing:16px': ['shared-owner'],
      },
      valueSources: {
        'fontTextFamily:Inter, sans-serif': ['rendered:text'],
        'spacing:16px': ['element:content-spacing'],
      },
      renderedTextStyleObservations: [
        {
          ownerId: 'shared-owner',
          textRole: 'body',
          styles: {
            color: 'rgb(23, 32, 51)',
            fontFamily: 'Inter, sans-serif',
            fontSize: '16px',
            fontWeight: '400',
            lineHeight: '24px',
            letterSpacing: 'normal',
          },
          source: {
            kind: 'direct-text',
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
            glyphPaintKind: 'solid-color',
            foreground: 'rgb(23, 32, 51)',
          },
        },
      ],
    })

    const evidence = buildTokenEvidence(tokens, [{ url: 'https://example.com/', viewport: 'desktop', styles }])

    expect(evidence['typography.fontFamilies.0'].renderedTextOwners).toHaveLength(1)
    expect(evidence['spacing.0'].renderedTextOwners).toBeUndefined()
  })

  test('preserves gradient-painted typography without inventing a flat foreground token', () => {
    const styles = createExtractedStyles({
      usageCount: { 'fontTextFamily:Inter, sans-serif': 1 },
      usageOwnerIds: { 'fontTextFamily:Inter, sans-serif': ['gradient-owner'] },
      valueSources: { 'fontTextFamily:Inter, sans-serif': ['rendered:text'] },
      renderedTextStyleObservations: [
        {
          ownerId: 'gradient-owner',
          textRole: 'heading',
          styles: {
            fontFamily: 'Inter, sans-serif',
            fontSize: '32px',
            fontWeight: '700',
            lineHeight: '40px',
            letterSpacing: 'normal',
          },
          source: {
            kind: 'direct-text',
            widthPx: 240,
            heightPx: 40,
            visibleWidthPx: 240,
            visibleHeightPx: 40,
            paintedAreaPx: 9600,
            captureIntersectionRatio: 1,
            effectiveClipPathAreaRatio: 1,
            ancestorClipCount: 0,
            clientRectCount: 1,
            glyphRectCount: 1,
            visibleBounds: { xPx: 0, yPx: 0, widthPx: 240, heightPx: 40 },
            visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 240, heightPx: 40 }],
            visibleGlyphAreaPx: 9600,
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
            glyphPaintKind: 'background-clip',
            backgroundClip: 'text',
            backgroundImage: 'linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))',
          },
        },
      ],
    })

    const evidence = buildTokenEvidence(tokens, [{ url: 'https://example.com/', viewport: 'desktop', styles }])

    expect(evidence['typography.fontFamilies.0'].renderedTextOwners).toHaveLength(1)
    expect(evidence['typography.fontFamilies.0'].renderedTextOwners?.[0]).toMatchObject({
      styles: { fontFamily: 'Inter, sans-serif' },
      source: { glyphPaintKind: 'background-clip', backgroundClip: 'text' },
    })
    expect(evidence['typography.fontFamilies.0'].renderedTextOwners?.[0].styles.color).toBeUndefined()
  })

  test('keeps exact font-stack owners separate while allowing primary-family aggregation', () => {
    const fontTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      typography: {
        fontFamilies: ['Inter'],
        fontStacks: ['Inter, sans-serif', 'Inter, serif'],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: [],
    }
    const styles = createExtractedStyles({
      usageCount: {
        'fontTextFamily:Inter, sans-serif': 1,
        'fontTextFamily:Inter, serif': 1,
      },
      usageOwnerCounts: {
        'fontTextFamily:Inter, sans-serif': 1,
        'fontTextFamily:Inter, serif': 1,
      },
      usageOwnerIds: {
        'fontTextFamily:Inter, sans-serif': ['sans-owner'],
        'fontTextFamily:Inter, serif': ['serif-owner'],
      },
      valueSources: {
        'fontTextFamily:Inter, sans-serif': ['rendered:text'],
        'fontTextFamily:Inter, serif': ['rendered:text'],
      },
      renderedTextStyleObservations: [
        renderedFontOwner('sans-owner', 'Inter, sans-serif'),
        renderedFontOwner('serif-owner', 'Inter, serif'),
      ],
    })

    fontTokens.evidence = buildTokenEvidence(fontTokens, [{ url: 'https://example.com/', viewport: 'desktop', styles }])

    expect(fontTokens.evidence['typography.fontStacks.0']).toMatchObject({ ownerCount: 1, reuseScope: 'local' })
    expect(fontTokens.evidence['typography.fontStacks.1']).toMatchObject({ ownerCount: 1, reuseScope: 'local' })
    expect(fontTokens.evidence['typography.fontFamilies.0']).toMatchObject({ ownerCount: 2, reuseScope: 'foundation' })

    promotePortableDesignTokens(fontTokens)
    expect(fontTokens.typography.fontStacks).toEqual([])
    expect(fontTokens.typography.fontFamilies).toEqual(['Inter'])
  })

  test('keeps portable typography when an opaque glyph paint outlives ancestor opacity compositing', () => {
    const fontTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      typography: {
        fontFamilies: ['Inter'],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: [],
    }
    const owners = ['owner-1', 'owner-2'].map((ownerId) => {
      const owner = renderedFontOwner(ownerId, 'Inter, sans-serif')
      delete (owner.styles as { color?: string }).color
      owner.source.opacity = 0.92
      return owner
    })
    const styles = createExtractedStyles({
      usageCount: { 'fontTextFamily:Inter, sans-serif': 2 },
      usageOwnerCounts: { 'fontTextFamily:Inter, sans-serif': 2 },
      usageOwnerIds: { 'fontTextFamily:Inter, sans-serif': owners.map((owner) => owner.ownerId) },
      valueSources: { 'fontTextFamily:Inter, sans-serif': ['rendered:text'] },
      renderedTextStyleObservations: owners,
    })
    fontTokens.evidence = buildTokenEvidence(fontTokens, [{ url: 'https://example.com/', viewport: 'desktop', styles }])

    promotePortableDesignTokens(fontTokens)

    expect(fontTokens.typography.fontFamilies).toEqual(['Inter'])
    expect(fontTokens.candidates?.values?.some((candidate) => candidate.value === 'Inter')).not.toBe(true)
  })

  test('marks values with no browser evidence as low-confidence derived tokens', () => {
    const evidence = buildTokenEvidence(tokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles: observedStyles() },
    ])

    expect(evidence['colors.palette-1']).toMatchObject({
      confidence: 'low',
      observationCount: 0,
      sources: ['derived:token-builder'],
    })
  })

  test.each(['blendChain', 'routeId'] as const)(
    'demotes rendered typography when legacy evidence lacks %s provenance',
    (missingField) => {
      const legacyTokens: DesignToken = {
        ...structuredClone(tokens),
        colors: {},
        typography: {
          fontFamilies: ['Inter'],
          fontStacks: [],
          fontSizes: [],
          fontWeights: [],
          lineHeights: [],
          letterSpacings: [],
        },
        spacing: [],
      }
      const styles = createExtractedStyles({
        usageCount: { 'fontTextFamily:Inter, sans-serif': 2 },
        usageOwnerCounts: { 'fontTextFamily:Inter, sans-serif': 2 },
        usageOwnerIds: { 'fontTextFamily:Inter, sans-serif': ['owner-1', 'owner-2'] },
        valueSources: { 'fontTextFamily:Inter, sans-serif': ['rendered:text'] },
        renderedTextStyleObservations: [
          renderedFontOwner('owner-1', 'Inter, sans-serif'),
          renderedFontOwner('owner-2', 'Inter, sans-serif'),
        ],
      })
      legacyTokens.evidence = buildTokenEvidence(legacyTokens, [
        { url: 'https://example.com/', viewport: 'desktop', styles },
      ])
      const owner = legacyTokens.evidence['typography.fontFamilies.0'].renderedTextOwners?.[0]
      expect(owner).toBeDefined()
      if (missingField === 'blendChain') delete (owner!.source as { blendChain?: unknown }).blendChain
      else delete (owner as { routeId?: string }).routeId

      promotePortableDesignTokens(legacyTokens)

      expect(legacyTokens.typography.fontFamilies).toEqual([])
      expect(legacyTokens.candidates?.values?.some((candidate) => candidate.value === 'Inter')).toBe(true)
    },
  )

  test('promotes repeated rendered evidence from a one-page analysis within that observed scope', () => {
    const onePageTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['16px'],
    }
    const styles = createExtractedStyles({
      usageCount: { 'spacing:16px': 4 },
      usageOwnerCounts: { 'spacing:16px': 4 },
      usageOwnerIds: { 'spacing:16px': ['1', '2', '3', '4'] },
      valueSources: { 'spacing:16px': ['element:structural-spacing'] },
    })
    onePageTokens.evidence = buildTokenEvidence(onePageTokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles },
    ])

    expect(onePageTokens.evidence['spacing.0']).toMatchObject({
      semanticConfidence: 'medium',
      reuseScope: 'foundation',
      pageCount: 1,
      eligiblePageCount: 1,
    })
    promotePortableDesignTokens(onePageTokens)

    expect(onePageTokens.spacing).toEqual(['16px'])
    expect(onePageTokens.candidates?.values).toBeUndefined()
  })

  test('preserves exact source-owner support instead of assigning every value owner to every source', () => {
    const scopedTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['8px'],
    }
    const styles = createExtractedStyles({
      usageCount: { 'spacing:8px': 9 },
      usageOwnerCounts: { 'spacing:8px': 9 },
      usageOwnerIds: { 'spacing:8px': Array.from({ length: 9 }, (_value, index) => String(index)) },
      valueSources: { 'spacing:8px': ['element:content-spacing', 'element:control-spacing'] },
      valueSourceCounts: {
        'spacing:8px': { 'element:content-spacing': 6, 'element:control-spacing': 3 },
      },
    })

    const evidence = buildTokenEvidence(scopedTokens, [{ url: 'https://example.com/', viewport: 'desktop', styles }])[
      'spacing.0'
    ]

    expect(evidence.sourceCounts).toMatchObject({
      'element:content-spacing': 6,
      'element:control-spacing': 3,
    })
    expect(evidence.semanticAgreement).toBeCloseTo(2 / 3, 3)
    expect(evidence.reuseScope).toBe('foundation')
  })

  test('accepts one rendered owner when a declaration independently supports the same foundation value', () => {
    const declaredTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['16px'],
    }
    const styles = createExtractedStyles({
      usageCount: { 'spacing:16px': 1 },
      usageOwnerCounts: { 'spacing:16px': 1 },
      usageOwnerIds: { 'spacing:16px': ['content-1'] },
      valueSources: { 'spacing:16px': ['css-variable:--space-layout', 'element:content-spacing'] },
      valueSourceCounts: {
        'spacing:16px': { 'css-variable:--space-layout': 1, 'element:content-spacing': 1 },
      },
    })

    const evidence = buildTokenEvidence(declaredTokens, [{ url: 'https://example.com/', viewport: 'desktop', styles }])[
      'spacing.0'
    ]

    expect(evidence).toMatchObject({ ownerCount: 1, semanticConfidence: 'medium', reuseScope: 'foundation' })
    expect(evidence.reasons).toContain('declared-token')
  })

  test('treats the observed root canvas as a one-page background foundation', () => {
    const backgroundTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: { background: '#f3f6fb' },
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: [],
    }
    const styles = createExtractedStyles({
      usageCount: { 'bgColor:rgb(243, 246, 251)': 1 },
      usageOwnerCounts: { 'bgColor:rgb(243, 246, 251)': 1 },
      usageOwnerIds: { 'bgColor:rgb(243, 246, 251)': ['body'] },
      valueSources: {
        'bgColor:rgb(243, 246, 251)': ['computed:background', 'element:page-background'],
      },
      valueSourceCounts: {
        'bgColor:rgb(243, 246, 251)': { 'computed:background': 1, 'element:page-background': 1 },
      },
    })

    const evidence = buildTokenEvidence(backgroundTokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles },
    ])['colors.background']

    expect(evidence).toMatchObject({ ownerCount: 1, semanticConfidence: 'medium', reuseScope: 'foundation' })
    expect(evidence.reasons).not.toContain('interactive-use')
  })

  test('reports declaration, rendered, semantic-role, owner, and canonical-capture counts separately', () => {
    const backgroundTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: { background: '#f3f6fb' },
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: [],
    }
    const capture = (ownerId: string, semanticRole: 'page-canvas' | 'code-surface', viewport = 'desktop') =>
      createExtractedStyles({
        usageCount: {
          'bgColor:rgb(243, 246, 251)': 1,
          'declaredColor:rgb(243, 246, 251)': 1,
        },
        usageOwnerIds: { 'bgColor:rgb(243, 246, 251)': [ownerId] },
        valueSources: {
          'bgColor:rgb(243, 246, 251)': ['computed:background'],
          'declaredColor:rgb(243, 246, 251)': ['css-variable:--page-color'],
        },
        semanticSurfaceObservations: [
          {
            captureId: `capture|${viewport}`,
            ownerId,
            value: 'rgb(243, 246, 251)',
            domain: semanticRole === 'page-canvas' ? 'foundation' : 'specialized-content',
            role: semanticRole,
            rendered: true,
            declared: false,
            elementKind: semanticRole === 'page-canvas' ? 'body' : 'pre',
          },
        ],
      })

    const evidence = buildTokenEvidence(backgroundTokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles: capture('body', 'page-canvas') },
      { url: 'https://example.com/', viewport: 'mobile', styles: capture('body', 'page-canvas', 'mobile') },
      { url: 'https://example.com/docs', viewport: 'desktop', styles: capture('pre', 'code-surface') },
    ])['colors.background']

    expect(evidence).toMatchObject({
      declarationPageCount: 2,
      renderedPageCount: 2,
      roleRenderedPageCount: 1,
      roleOwnerCount: 1,
      canonicalCaptureCount: 3,
      declarationSourceCount: 1,
    })
  })

  test('does not count the same singleton again when another viewport observes the same URL', () => {
    const singletonTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['2px'],
    }
    const styles = createExtractedStyles({
      usageCount: { 'spacing:2px': 1 },
      usageOwnerCounts: { 'spacing:2px': 1 },
      usageOwnerIds: { 'spacing:2px': ['1'] },
      valueSources: { 'spacing:2px': ['element:content-spacing'] },
    })
    singletonTokens.evidence = buildTokenEvidence(singletonTokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles },
      { url: 'https://example.com/', viewport: 'mobile', styles },
    ])

    expect(singletonTokens.evidence['spacing.0']).toMatchObject({
      observationCount: 1,
      pageCount: 1,
      captureCount: 2,
      reuseScope: 'local',
    })
    promotePortableDesignTokens(singletonTokens)

    expect(singletonTokens.spacing).toEqual([])
    expect(singletonTokens.candidates?.values).toContainEqual(
      expect.objectContaining({ group: 'spacing', value: '2px' }),
    )
  })

  test('demotes values local to one URL in a multi-page analysis and preserves their evidence', () => {
    const localTokens: DesignToken = {
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: ['0.90625rem'],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['2px'],
      radii: ['8px'],
      shadows: [],
      borders: [],
      zIndices: [],
      transitions: [],
    }
    const observed = createExtractedStyles({
      usageCount: { 'fontSize:14.5px': 1, 'spacing:2px': 1, 'radius:8px': 3 },
      valueSources: {
        'spacing:2px': ['element:content-spacing'],
        'radius:8px': ['computed:ordinary-radius'],
      },
    })
    const captures = [
      { url: 'https://example.com/', viewport: 'desktop', styles: observed },
      ...Array.from({ length: 7 }, (_value, index) => ({
        url: `https://example.com/page-${index + 1}`,
        viewport: 'desktop',
        styles: createExtractedStyles(),
      })),
    ]
    localTokens.evidence = buildTokenEvidence(localTokens, captures)

    promotePortableDesignTokens(localTokens)

    expect(localTokens.typography.fontSizes).toEqual([])
    expect(localTokens.spacing).toEqual([])
    expect(localTokens.radii).toEqual([])
    expect(localTokens.candidates?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ group: 'spacing', value: '2px', rejectionReason: 'local-scope' }),
        expect.objectContaining({ group: 'radii', value: '8px', rejectionReason: 'local-scope' }),
        expect.objectContaining({
          group: 'typography.fontSizes',
          value: '0.90625rem',
          rejectionReason: 'low-semantic-confidence',
        }),
      ]),
    )
    expect(localTokens.candidates?.values?.find((candidate) => candidate.group === 'radii')?.evidence).toMatchObject({
      pageCount: 1,
      eligiblePageCount: 8,
      reuseScope: 'local',
    })
    expect(
      localTokens.candidates?.values?.find((candidate) => candidate.group === 'typography.fontSizes')?.evidence.reasons,
    ).toEqual(expect.arrayContaining(['rendered-use', 'computed-style']))
  })

  test('keeps component-only values out of portable scales even when frequently observed', () => {
    const componentTokens: DesignToken = {
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['8px'],
      radii: [],
      shadows: [],
      borders: [],
      zIndices: [],
      transitions: [],
    }
    const styles = createExtractedStyles({
      usageCount: { 'spacing:8px': 30 },
      valueSources: { 'spacing:8px': ['element:control-spacing'] },
    })
    componentTokens.evidence = buildTokenEvidence(componentTokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles },
    ])

    promotePortableDesignTokens(componentTokens)

    expect(componentTokens.spacing).toEqual([])
    expect(componentTokens.candidates?.values).toContainEqual(
      expect.objectContaining({ group: 'spacing', value: '8px', rejectionReason: 'component-scope' }),
    )
  })

  test('retains multiple control padding values as component candidates after promotion', () => {
    const componentTokens: DesignToken = {
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['12px', '20px'],
      radii: [],
      shadows: [],
      borders: [],
      zIndices: [],
      transitions: [],
    }
    const styles = createExtractedStyles({
      usageCount: { 'spacing:12px': 2, 'spacing:20px': 2 },
      usageOwnerIds: { 'spacing:12px': ['a', 'b'], 'spacing:20px': ['a', 'b'] },
      valueSources: {
        'spacing:12px': ['element:control-spacing'],
        'spacing:20px': ['element:control-spacing'],
      },
      valueSourceCounts: {
        'spacing:12px': { 'element:control-spacing': 2 },
        'spacing:20px': { 'element:control-spacing': 2 },
      },
    })
    componentTokens.evidence = buildTokenEvidence(componentTokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles },
    ])

    promotePortableDesignTokens(componentTokens)

    expect(componentTokens.spacing).toEqual([])
    expect(componentTokens.candidates?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ group: 'spacing', value: '12px', rejectionReason: 'component-scope' }),
        expect.objectContaining({ group: 'spacing', value: '20px', rejectionReason: 'component-scope' }),
      ]),
    )
  })

  test('retains cross-page foundations, reindexes evidence, and exports rejected candidates only as extensions', () => {
    const mixedTokens: DesignToken = {
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['2px', '16px'],
      radii: [],
      shadows: [],
      borders: [],
      zIndices: [],
      transitions: [],
    }
    const capture = (url: string, includeFoundation: boolean, includeLocal = false) => ({
      url,
      viewport: 'desktop',
      styles: createExtractedStyles({
        usageCount: {
          ...(includeFoundation ? { 'spacing:16px': 6 } : {}),
          ...(includeLocal ? { 'spacing:2px': 1 } : {}),
        },
        valueSources: {
          ...(includeFoundation ? { 'spacing:16px': ['element:structural-spacing'] } : {}),
          ...(includeLocal ? { 'spacing:2px': ['element:content-spacing'] } : {}),
        },
      }),
    })
    const captures = [
      capture('https://example.com/', true, true),
      capture('https://example.com/about', true),
      capture('https://example.com/docs', true),
      capture('https://example.com/contact', false),
    ]
    mixedTokens.evidence = buildTokenEvidence(mixedTokens, captures)

    promotePortableDesignTokens(mixedTokens)
    mixedTokens.evidence = buildTokenEvidence(mixedTokens, captures)
    const dtcg = JSON.parse(generateDtcgJson(mixedTokens)) as {
      spacing: Record<string, { $value: string }>
      $extensions: { 'com.imprint.candidates': { values: Array<{ value: string }> } }
    }

    expect(mixedTokens.spacing).toEqual(['16px'])
    expect(mixedTokens.evidence['spacing.0']).toMatchObject({ value: '16px', reuseScope: 'foundation' })
    expect(dtcg.spacing['1'].$value).toBe('16px')
    expect(dtcg.$extensions['com.imprint.candidates'].values).toContainEqual(expect.objectContaining({ value: '2px' }))
  })

  test('does not promote portable values backed by fractional evidence counts', () => {
    const fractionalTokens: DesignToken = {
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['16px'],
      radii: [],
      shadows: [],
      borders: [],
      zIndices: [],
      transitions: [],
    }
    const capture = (url: string) => ({
      url,
      viewport: 'desktop',
      styles: createExtractedStyles({
        usageCount: { 'spacing:16px': 4 },
        usageOwnerIds: { 'spacing:16px': ['layout-1', 'layout-2'] },
        valueSources: { 'spacing:16px': ['element:structural-spacing'] },
      }),
    })
    fractionalTokens.evidence = buildTokenEvidence(fractionalTokens, [
      capture('https://example.com/'),
      capture('https://example.com/about'),
    ])
    fractionalTokens.evidence['spacing.0'].observationCount = 0.5
    fractionalTokens.evidence['spacing.0'].ownerCount = 0.5

    promotePortableDesignTokens(fractionalTokens)

    expect(fractionalTokens.spacing).toEqual([])
    expect(fractionalTokens.candidates?.values).toContainEqual(
      expect.objectContaining({ group: 'spacing', value: '16px' }),
    )
  })

  test('reapplies the foundation coverage threshold to persisted evidence before promotion', () => {
    const underSupportedTokens: DesignToken = {
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['16px'],
      radii: [],
      shadows: [],
      borders: [],
      zIndices: [],
      transitions: [],
    }
    const capture = (url: string) => ({
      url,
      viewport: 'desktop',
      styles: createExtractedStyles({
        usageCount: { 'spacing:16px': 4 },
        usageOwnerIds: { 'spacing:16px': ['layout-1', 'layout-2'] },
        valueSources: { 'spacing:16px': ['element:structural-spacing'] },
      }),
    })
    underSupportedTokens.evidence = buildTokenEvidence(underSupportedTokens, [
      capture('https://example.com/'),
      capture('https://example.com/about'),
    ])
    underSupportedTokens.evidence['spacing.0'].eligiblePageCount = 4
    underSupportedTokens.evidence['spacing.0'].pageSupportRatio = 0.5

    promotePortableDesignTokens(underSupportedTokens)

    expect(underSupportedTokens.spacing).toEqual([])
    expect(underSupportedTokens.candidates?.values).toContainEqual(
      expect.objectContaining({ group: 'spacing', value: '16px' }),
    )
  })

  test('counts the structural border alias once when it describes the same computed border', () => {
    const borderTokens: DesignToken = { ...tokens, colors: { border: '#b5bac2' } }
    const styles = createExtractedStyles({
      usageCount: {
        'borderColor:rgb(181, 186, 194)': 1,
        'structuralBorderColor:rgb(181, 186, 194)': 1,
      },
      valueSources: {
        'borderColor:rgb(181, 186, 194)': ['computed:border'],
        'structuralBorderColor:rgb(181, 186, 194)': ['element:structure'],
      },
    })

    const evidence = buildTokenEvidence(borderTokens, [{ url: 'https://example.com/', viewport: 'desktop', styles }])

    expect(evidence['colors.border']).toMatchObject({
      observationCount: 1,
      ownerCount: 1,
      semanticConfidence: 'medium',
      measurementConfidence: 'low',
      reuseScope: 'local',
    })
  })

  test('uses distinct DOM owners instead of text length, aliases, or box-side counts', () => {
    const ownerTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['2px'],
    }
    const styles = createExtractedStyles({
      usageCount: { 'spacing:2px': 100 },
      usageOwnerCounts: { 'spacing:2px': 1 },
      usageOwnerIds: { 'spacing:2px': ['same-element'] },
      valueSources: { 'spacing:2px': ['element:content-spacing'] },
      valueSourceCounts: { 'spacing:2px': { 'element:content-spacing': 1 } },
    })
    ownerTokens.evidence = buildTokenEvidence(ownerTokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles },
    ])

    expect(ownerTokens.evidence['spacing.0']).toMatchObject({
      observationCount: 1,
      ownerCount: 1,
      reuseScope: 'local',
    })
    promotePortableDesignTokens(ownerTokens)
    expect(ownerTokens.spacing).toEqual([])
  })

  test('uses one canonical capture per page instead of assuming cross-viewport locator identity', () => {
    const scopedTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      spacing: ['16px'],
    }
    const capture = (owners: string[]) =>
      createExtractedStyles({
        usageCount: { 'spacing:16px': owners.length },
        usageOwnerCounts: { 'spacing:16px': owners.length },
        usageOwnerIds: { 'spacing:16px': owners },
        valueSources: { 'spacing:16px': ['element:content-spacing'] },
        valueSourceCounts: { 'spacing:16px': { 'element:content-spacing': owners.length } },
        valueSourceOwnerIds: { 'spacing:16px': { 'element:content-spacing': owners } },
      })
    const evidence = buildTokenEvidence(scopedTokens, [
      {
        url: 'https://example.com/',
        viewport: 'desktop',
        styles: capture(['body > main:nth-of-type(1)']),
      },
      {
        url: 'https://example.com/',
        viewport: 'mobile',
        styles: capture(['body > main:nth-of-type(1)', 'body > nav:nth-of-type(1)']),
      },
    ])['spacing.0']

    expect(evidence).toMatchObject({
      ownerCount: 1,
      observationCount: 1,
      pageCount: 1,
      captureCount: 2,
      reuseScope: 'local',
      sourceCounts: { 'element:content-spacing': 1 },
    })
  })

  test('derives semantic agreement independently from measurement support', () => {
    const semanticTokens: DesignToken = { ...structuredClone(tokens), colors: { primary: '#1772f6' } }
    const value = 'rgb(23, 114, 246)'
    const styles = createExtractedStyles({
      usageCount: {
        [`primaryActionBackgroundColor:${value}`]: 2,
        [`accentColor:${value}`]: 2,
        [`destructiveActionBackgroundColor:${value}`]: 3,
      },
      usageOwnerCounts: {
        [`primaryActionBackgroundColor:${value}`]: 2,
        [`accentColor:${value}`]: 2,
        [`destructiveActionBackgroundColor:${value}`]: 3,
      },
      usageOwnerIds: {
        [`primaryActionBackgroundColor:${value}`]: ['action-1', 'action-2'],
        [`accentColor:${value}`]: ['action-1', 'action-2'],
        [`destructiveActionBackgroundColor:${value}`]: ['danger-1', 'danger-2', 'danger-3'],
      },
      valueSources: {
        [`primaryActionBackgroundColor:${value}`]: ['element:primary-action'],
        [`accentColor:${value}`]: ['element:primary-action'],
        [`destructiveActionBackgroundColor:${value}`]: ['element:destructive-action'],
      },
    })

    const evidence = buildTokenEvidence(semanticTokens, [{ url: 'https://example.com/', viewport: 'desktop', styles }])[
      'colors.primary'
    ]

    expect(evidence.measurementConfidence).not.toBe('low')
    expect(evidence).toMatchObject({ semanticConfidence: 'low', reuseScope: 'local', ownerCount: 2 })
    expect(evidence.semanticAgreement).toBeLessThan(0.6)
  })

  test('subtracts the union of distinct specialized background owners from ordinary surface support', () => {
    const surfaceTokens: DesignToken = { ...structuredClone(tokens), colors: { surface: '#dc2626' } }
    const value = 'rgb(220, 38, 38)'
    const styles = createExtractedStyles({
      usageCount: {
        [`bgColor:${value}`]: 3,
        [`actionBackgroundColor:${value}`]: 1,
        [`accentColor:${value}`]: 1,
        [`statusBackgroundColor:${value}`]: 1,
      },
      usageOwnerIds: {
        [`bgColor:${value}`]: ['ordinary-surface', 'action', 'status'],
        [`actionBackgroundColor:${value}`]: ['action'],
        [`accentColor:${value}`]: ['action'],
        [`statusBackgroundColor:${value}`]: ['status'],
      },
      valueSources: {
        [`bgColor:${value}`]: ['computed:background'],
        [`actionBackgroundColor:${value}`]: ['element:action'],
        [`accentColor:${value}`]: ['element:action'],
        [`statusBackgroundColor:${value}`]: ['element:status'],
      },
    })

    const evidence = buildTokenEvidence(surfaceTokens, [{ url: 'https://example.com/', viewport: 'desktop', styles }])[
      'colors.surface'
    ]

    expect(evidence).toMatchObject({
      ownerCount: 1,
      observationCount: 1,
      semanticConfidence: 'low',
      reuseScope: 'local',
    })
    expect(evidence.semanticAgreement).toBeCloseTo(1 / 3, 3)

    const legacyEvidence = buildTokenEvidence(surfaceTokens, [
      {
        url: 'https://example.com/',
        viewport: 'desktop',
        styles: createExtractedStyles({ usageCount: styles.usageCount, valueSources: styles.valueSources }),
      },
    ])['colors.surface']
    expect(legacyEvidence).toMatchObject({ ownerCount: 1, semanticConfidence: 'low', reuseScope: 'local' })
    expect(legacyEvidence.semanticAgreement).toBeCloseTo(1 / 3, 3)
  })

  test('keeps a weak semantic alias as a candidate when the same value has a portable role', () => {
    const sharedValueTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: { primary: '#1772f6', border: '#1772f6' },
    }
    const value = 'rgb(23, 114, 246)'
    const styles = createExtractedStyles({
      usageCount: {
        [`primaryActionBackgroundColor:${value}`]: 3,
        [`accentColor:${value}`]: 3,
        [`borderColor:${value}`]: 1,
      },
      usageOwnerIds: {
        [`primaryActionBackgroundColor:${value}`]: ['action-1', 'action-2', 'action-3'],
        [`accentColor:${value}`]: ['action-1', 'action-2', 'action-3'],
        [`borderColor:${value}`]: ['border-1'],
      },
      valueSources: {
        [`primaryActionBackgroundColor:${value}`]: ['element:primary-action'],
        [`accentColor:${value}`]: ['element:primary-action'],
        [`borderColor:${value}`]: ['computed:border'],
      },
    })
    sharedValueTokens.evidence = buildTokenEvidence(sharedValueTokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles },
    ])

    promotePortableDesignTokens(sharedValueTokens)

    expect(sharedValueTokens.colors.primary).toBe('#1772f6')
    expect(sharedValueTokens.colors.border).toBeUndefined()
    expect(sharedValueTokens.candidates?.values).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^candidate\.colors\./),
        role: 'border',
        value: '#1772f6',
        sourcePath: 'colors.border',
        rejectionReason: 'local-scope',
      }),
    )
  })

  test('supports a repeated editorial accent across emphasized foreground and rule usage', () => {
    const accentTokens: DesignToken = { ...structuredClone(tokens), colors: { 'editorial-accent': '#9a3b2e' } }
    const value = 'rgb(154, 59, 46)'
    const styles = createExtractedStyles({
      usageCount: {
        [`textColor:${value}`]: 2,
        [`actionForegroundColor:${value}`]: 1,
        [`borderColor:${value}`]: 1,
      },
      usageOwnerIds: {
        [`textColor:${value}`]: ['drop-cap', 'editor-action'],
        [`actionForegroundColor:${value}`]: ['editor-action'],
        [`borderColor:${value}`]: ['quote-rule'],
      },
      valueSources: {
        [`textColor:${value}`]: ['computed:text'],
        [`actionForegroundColor:${value}`]: ['element:action'],
        [`borderColor:${value}`]: ['computed:border'],
      },
    })
    accentTokens.evidence = buildTokenEvidence(accentTokens, [
      { url: 'https://example.com/article', viewport: 'desktop', styles },
    ])

    expect(accentTokens.evidence['colors.editorial-accent']).toMatchObject({
      ownerCount: 3,
      semanticConfidence: 'medium',
      reuseScope: 'foundation',
    })
    promotePortableDesignTokens(accentTokens)
    expect(accentTokens.colors['editorial-accent']).toBe('#9a3b2e')
  })

  test('separates declaration measurement confidence from semantic reuse confidence', () => {
    const declaredTokens: DesignToken = { ...tokens, colors: { 'palette-1': '#7c3aed' } }
    const declaredStyles = createExtractedStyles({
      usageCount: {
        'declaredColor:rgb(124, 58, 237)': 1,
        'brandTokenColor:rgb(124, 58, 237)': 1,
      },
      valueSources: {
        'declaredColor:rgb(124, 58, 237)': ['css-variable:--brand-primary'],
        'brandTokenColor:rgb(124, 58, 237)': ['css-variable:--brand-primary'],
      },
    })

    const evidence = buildTokenEvidence(declaredTokens, [
      { url: 'https://example.com/', viewport: 'desktop', styles: declaredStyles },
      { url: 'https://example.com/about', viewport: 'desktop', styles: declaredStyles },
      { url: 'https://example.com/docs', viewport: 'desktop', styles: declaredStyles },
    ])

    expect(evidence['colors.palette-1']).toMatchObject({
      confidence: 'low',
      measurementConfidence: 'high',
      semanticConfidence: 'low',
      reuseScope: 'declared-only',
      eligiblePageCount: 3,
      pageSupportRatio: 1,
    })
    expect(evidence['colors.palette-1'].reasons).toContain('declared-only')
    expect(evidence['colors.palette-1'].reasons).not.toContain('computed-style')
  })

  test('keeps negative and layout-dependent spacing out of the reusable scale', () => {
    const spacingTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['-16px', '128px', '216px', '258.5px'],
    }
    const captures = Array.from({ length: 8 }, (_value, index) => {
      const sourceCounts = {
        'spacing:-16px': { 'geometry:negative-offset': 4 },
        'spacing:128px': { 'element:structural-spacing': 2 },
        'spacing:216px': { 'element:content-spacing': 1 },
        'spacing:258.5px': { 'element:content-spacing': 3 },
      }
      return {
        url: `https://example.com/page-${index + 1}`,
        viewport: 'desktop',
        styles: createExtractedStyles({
          usageCount: {
            'spacing:-16px': 4,
            'spacing:128px': 2,
            'spacing:216px': 1,
            'spacing:258.5px': 3,
          },
          usageOwnerIds: {
            'spacing:-16px': ['negative-1', 'negative-2', 'negative-3', 'negative-4'],
            'spacing:128px': ['section-1', 'section-2'],
            'spacing:216px': ['layout-offset'],
            'spacing:258.5px': ['grid-1', 'grid-2', 'grid-3'],
          },
          valueSources: Object.fromEntries(
            Object.entries(sourceCounts).map(([key, counts]) => [key, Object.keys(counts)]),
          ),
          valueSourceCounts: sourceCounts,
        }),
      }
    })
    spacingTokens.evidence = buildTokenEvidence(spacingTokens, captures)

    expect(spacingTokens.evidence['spacing.0'].reuseScope).toBe('local')
    expect(spacingTokens.evidence['spacing.1'].reuseScope).toBe('foundation')
    expect(spacingTokens.evidence['spacing.2'].reuseScope).toBe('local')
    expect(spacingTokens.evidence['spacing.3'].reuseScope).toBe('local')

    promotePortableDesignTokens(spacingTokens)
    expect(spacingTokens.spacing).toEqual(['128px'])
    expect(spacingTokens.candidates?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ group: 'spacing', value: '-16px' }),
        expect.objectContaining({ group: 'spacing', value: '216px' }),
        expect.objectContaining({ group: 'spacing', value: '258.5px' }),
      ]),
    )
  })

  test('requires two independent large-spacing owners on every supporting route', () => {
    const largeSpacingTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: ['128px'],
    }
    const capture = (url: string, ownerIds: string[]) => ({
      url,
      viewport: 'desktop',
      styles: createExtractedStyles({
        usageCount: { 'spacing:128px': ownerIds.length },
        usageOwnerIds: { 'spacing:128px': ownerIds },
        valueSources: { 'spacing:128px': ['element:structural-spacing'] },
        valueSourceCounts: { 'spacing:128px': { 'element:structural-spacing': ownerIds.length } },
        valueSourceOwnerIds: { 'spacing:128px': { 'element:structural-spacing': ownerIds } },
      }),
    })

    largeSpacingTokens.evidence = buildTokenEvidence(largeSpacingTokens, [
      capture('https://example.com/a', ['a-1', 'a-2', 'a-3']),
      capture('https://example.com/b', ['b-1']),
    ])

    expect(largeSpacingTokens.evidence['spacing.0']).toMatchObject({
      reuseScope: 'local',
      foundationOwnerCount: 4,
      minimumPageFoundationOwnerCount: 1,
    })
  })

  test('keeps pill/control radius sentinels local while retaining repeated surface radii', () => {
    const radiusTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: [],
      radii: ['12px', '980px'],
    }
    const captures = Array.from({ length: 8 }, (_value, index) => ({
      url: `https://example.com/page-${index + 1}`,
      viewport: 'desktop',
      styles: createExtractedStyles({
        usageCount: { 'radius:12px': 2, 'radius:980px': 8 },
        usageOwnerIds: {
          'radius:12px': ['surface-1', 'surface-2'],
          'radius:980px': Array.from({ length: 8 }, (_item, owner) => `pill-${owner}`),
        },
        valueSources: {
          'radius:12px': ['computed:ordinary-radius', 'element:content-radius'],
          'radius:980px': [
            'geometry:circle-or-pill',
            'element:control-radius',
            ...(index < 2 ? ['element:content-radius'] : []),
          ],
        },
        valueSourceCounts: {
          'radius:12px': { 'computed:ordinary-radius': 2, 'element:content-radius': 2 },
          'radius:980px': {
            'geometry:circle-or-pill': 8,
            'element:control-radius': 8,
            ...(index < 2 ? { 'element:content-radius': 1 } : {}),
          },
        },
      }),
    }))
    radiusTokens.evidence = buildTokenEvidence(radiusTokens, captures)

    expect(radiusTokens.evidence['radii.0'].reuseScope).toBe('foundation')
    expect(radiusTokens.evidence['radii.1'].reuseScope).toBe('component')

    promotePortableDesignTokens(radiusTokens)
    expect(radiusTokens.radii).toEqual(['12px'])
    expect(radiusTokens.candidates?.values).toContainEqual(
      expect.objectContaining({ group: 'radii', value: '980px', rejectionReason: 'component-scope' }),
    )
  })

  test('does not double-count one ordinary owner when promoting an extreme radius', () => {
    const radiusTokens: DesignToken = {
      ...structuredClone(tokens),
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: [],
      radii: ['980px'],
    }
    const capture = (url: string, owner: string) => ({
      url,
      viewport: 'desktop',
      styles: createExtractedStyles({
        usageCount: { 'radius:980px': 1 },
        usageOwnerIds: { 'radius:980px': [owner] },
        valueSources: { 'radius:980px': ['computed:ordinary-radius', 'element:content-radius'] },
        valueSourceCounts: {
          'radius:980px': { 'computed:ordinary-radius': 1, 'element:content-radius': 1 },
        },
        valueSourceOwnerIds: {
          'radius:980px': { 'computed:ordinary-radius': [owner], 'element:content-radius': [owner] },
        },
      }),
    })

    radiusTokens.evidence = buildTokenEvidence(radiusTokens, [
      capture('https://example.com/a', 'a-surface'),
      capture('https://example.com/b', 'b-surface'),
    ])

    expect(radiusTokens.evidence['radii.0']).toMatchObject({
      reuseScope: 'local',
      foundationOwnerCount: 2,
      minimumPageFoundationOwnerCount: 1,
    })
  })

  test('preserves token evidence in structured and human-readable exports', () => {
    const evidence = buildTokenEvidence(tokens, [
      { url: 'https://example.com/?session=secret', viewport: 'desktop', styles: observedStyles() },
    ])
    const evidencedTokens = { ...tokens, evidence }
    const dtcg = JSON.parse(generateDtcgJson(evidencedTokens)) as {
      $extensions: Record<string, Record<string, unknown>>
    }
    const designDoc = generateDesignDoc(evidencedTokens, 'https://example.com/')

    const publicPrimaryEvidence = dtcg.$extensions['com.imprint.tokenEvidence']['colors.primary'] as {
      pages: string[]
    }
    expect(publicPrimaryEvidence).toBeDefined()
    expect(designDoc).toContain('## Extraction Confidence')
    expect(designDoc).toContain('### Dominant Observed Color Roles')
    expect(designDoc).toContain('| Action | `--color-primary` |')
    expect(evidence['colors.primary'].pages[0]).toBe('https://example.com/?session=secret')
    expect(publicPrimaryEvidence.pages[0]).toBe('https://example.com/')
  })

  test('assigns each observed color value to one dominant role and removes alias noise', () => {
    const designDoc = generateDesignDoc({
      ...tokens,
      colors: { primary: '#1772f6', 'palette-1': '#1772f6', foreground: '#111827' },
      usageCount: {
        'actionColor:rgb(23, 114, 246)': 8,
        'textColor:rgb(23, 114, 246)': 1,
        'textColor:rgb(17, 24, 39)': 12,
      },
    })
    const dominantRoles = designDoc.split('### Complete Color Tokens')[0]

    expect(dominantRoles).toContain('| Action | `--color-primary` |')
    expect(dominantRoles).not.toContain('`--color-palette-1`')
    expect(dominantRoles).toContain('| Text | `--color-foreground` |')
  })

  test('uses grounded semantic names to prevent surface, border, and status colors from becoming actions', () => {
    const designDoc = generateDesignDoc({
      ...tokens,
      colors: {
        surface: '#f8fafc',
        danger: '#dc2626',
        'border-subtle': '#d1d5db',
        'palette-9': '#64748b',
      },
      usageCount: {
        'actionColor:#f8fafc': 8,
        'bgColor:#f8fafc': 1,
        'actionColor:#dc2626': 6,
        'statusColor:#dc2626': 1,
        'textColor:#d1d5db': 4,
        'borderColor:#d1d5db': 1,
        'bgColor:#64748b': 3,
      },
    })
    const dominantRoles = designDoc.split('### Core Portable Color Tokens')[0]

    expect(dominantRoles).toMatch(/\| Surface\/background \|[^\n]*`--color-surface`[^\n]*\|/)
    expect(dominantRoles).not.toContain('`--color-observed-64748b`')
    expect(dominantRoles).toContain('| Status/delta | `--color-danger` |')
    expect(dominantRoles).toContain('| Border | `--color-border-subtle` |')
    expect(dominantRoles).not.toContain('| Action/accent | `--color-surface`')
    expect(designDoc).toContain('Observed Unassigned Colors (Evidence Appendix)')
    expect(designDoc).toContain('value: "#64748b"')
    expect(designDoc).toContain('pageCount: 0')
    expect(designDoc).not.toContain('observations:')
    expect(designDoc).not.toContain('| `--color-observed-64748b` |')
  })
})
