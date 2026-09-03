import { compile } from 'tailwindcss'
import { describe, expect, test } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import { opaqueRouteIdentity } from '../../src/core/analyzer/url-identity.js'
import {
  buildDarkModeExportData,
  generateCssVariables,
  generateDesignDoc,
  generateDtcgJson,
  generateScssVariables,
  generateTailwindTheme,
  restoreDarkModeExportData,
} from '../../src/core/export/index.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

const baseTokens: DesignToken = {
  colors: { background: '#ffffff', foreground: '#111827', primary: '#1772f6' },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['1rem'],
    fontWeights: ['400'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: ['4px'],
  radii: ['8px'],
  shadows: ['0 1px 2px rgb(0 0 0 / 10%)'],
  borders: [],
  zIndices: [],
  transitions: [],
}

function darkRenderedTextOwners(ownerIds: string[]) {
  return ownerIds.map((ownerId) => ({
    ownerId,
    textRole: 'body' as const,
    styles: {
      color: 'rgb(245, 245, 245)',
      backgroundColor: 'rgb(22, 23, 29)',
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
      fontWeight: '400',
      lineHeight: '24px',
      letterSpacing: 'normal',
    },
    source: {
      kind: 'direct-text' as const,
      widthPx: 160,
      heightPx: 24,
      visibleWidthPx: 160,
      visibleHeightPx: 24,
      paintedAreaPx: 3840,
      captureIntersectionRatio: 1,
      effectiveClipPathAreaRatio: 1,
      ancestorClipCount: 0,
      clientRectCount: 1,
      glyphRectCount: 1,
      visibleBounds: { xPx: 0, yPx: 0, widthPx: 160, heightPx: 24 },
      visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 160, heightPx: 24 }],
      visibleGlyphAreaPx: 3840,
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
      foreground: 'rgb(245, 245, 245)',
    },
  }))
}

describe('dark mode export data', () => {
  test('builds deterministic dark tokens once for every export entry point', () => {
    const darkTextOwnerIds = Array.from({ length: 20 }, (_value, index) => `dark-copy-${index}`)
    const darkMode = buildDarkModeExportData({
      hasDarkMode: true,
      method: 'media-query',
      selector: undefined,
      source: { url: 'https://example.com/', viewport: 'desktop' },
      darkStyles: createExtractedStyles({
        colors: ['rgb(22, 23, 29)', 'rgb(245, 245, 245)', 'rgb(179, 154, 255)'],
        backgroundColors: ['rgb(22, 23, 29)'],
        textColors: ['rgb(245, 245, 245)'],
        shadows: ['0 2px 8px rgb(0 0 0 / 40%)'],
        usageCount: {
          'bgArea:rgb(22, 23, 29)': 100,
          'bgColor:rgb(22, 23, 29)': 10,
          'textColor:rgb(245, 245, 245)': 20,
          'primaryActionBackgroundColor:rgb(179, 154, 255)': 8,
          'accentColor:rgb(179, 154, 255)': 8,
          'shadow:0 2px 8px rgb(0 0 0 / 40%)': 2,
        },
        usageOwnerIds: {
          'bgColor:rgb(22, 23, 29)': ['page-root'],
          'textColor:rgb(245, 245, 245)': darkTextOwnerIds,
          'primaryActionBackgroundColor:rgb(179, 154, 255)': Array.from({ length: 8 }, (_value, index) => `a${index}`),
          'accentColor:rgb(179, 154, 255)': Array.from({ length: 8 }, (_value, index) => `a${index}`),
        },
        valueSources: {
          'bgColor:rgb(22, 23, 29)': ['element:page-background'],
          'textColor:rgb(245, 245, 245)': ['rendered:text'],
          'primaryActionBackgroundColor:rgb(179, 154, 255)': ['element:primary-action'],
          'accentColor:rgb(179, 154, 255)': ['element:primary-action'],
        },
        textColorPairObservations: [
          {
            captureId: 'dark|desktop',
            background: 'rgb(22, 23, 29)',
            foreground: 'rgb(245, 245, 245)',
            textRole: 'body',
            count: darkTextOwnerIds.length,
            ownerIds: darkTextOwnerIds,
          },
        ],
        renderedTextStyleObservations: darkRenderedTextOwners(darkTextOwnerIds),
      }),
    })

    expect(darkMode?.darkTokens?.colors.background).toBe('#16171d')
    expect(darkMode?.darkTokens?.colors.foreground).toBe('#f5f5f5')
    expect(darkMode?.darkTokens?.colors.primary).toBe('#b39aff')
    expect(darkMode?.darkTokens?.evidence?.['colors.foreground']).toMatchObject({
      pages: ['https://example.com/'],
      pageRefs: [opaqueRouteIdentity('https://example.com/')],
      renderedTextOwners: expect.arrayContaining([
        expect.objectContaining({
          page: 'https://example.com/',
          routeId: opaqueRouteIdentity('https://example.com/'),
          viewport: 'desktop',
        }),
      ]),
      pairedSurface: {
        routeSupport: expect.arrayContaining([
          expect.objectContaining({
            page: 'https://example.com/',
            routeId: opaqueRouteIdentity('https://example.com/'),
          }),
        ]),
      },
    })
    expect(darkMode?.selector).toBeUndefined()
  })

  test('binds a query-bearing dark capture to its sanitized canonical Evidence page', () => {
    const sourceUrl = 'https://example.com/?access_token=private-value#panel'
    const publicUrl = 'https://example.com/'
    const routeId = opaqueRouteIdentity(sourceUrl)
    const darkMode = buildDarkModeExportData(
      {
        hasDarkMode: true,
        method: 'media-query',
        source: { url: sourceUrl, viewport: 'desktop' },
        darkStyles: createExtractedStyles({
          colors: ['rgb(22, 23, 29)', 'rgb(245, 245, 245)'],
          backgroundColors: ['rgb(22, 23, 29)'],
          textColors: ['rgb(245, 245, 245)'],
          usageCount: {
            'bgArea:rgb(22, 23, 29)': 100,
            'bgColor:rgb(22, 23, 29)': 4,
            'textColor:rgb(245, 245, 245)': 4,
          },
          usageOwnerIds: {
            'bgColor:rgb(22, 23, 29)': ['page-root'],
            'textColor:rgb(245, 245, 245)': ['copy-1', 'copy-2', 'copy-3', 'copy-4'],
          },
          valueSources: {
            'bgColor:rgb(22, 23, 29)': ['element:page-background'],
            'textColor:rgb(245, 245, 245)': ['rendered:text'],
          },
        }),
      },
      baseTokens,
      { pages: [{ id: 'page-home-desktop', routeId, url: publicUrl, viewport: 'desktop', images: [] }] },
    )

    expect(darkMode?.darkTokens?.colors.background).toBe('#16171d')
    expect(darkMode?.darkTokens?.evidence?.['colors.background']).toMatchObject({
      pages: [publicUrl],
      pageRefs: [routeId],
    })
    expect(darkMode?.darkTokens?.evidence?.['colors.background'].sources).not.toContain('restored:unbound-dark-token')
  })

  test('does not fabricate rendered owner or surface-pair provenance without a real dark capture source', () => {
    const ownerIds = ['copy-1', 'copy-2']
    const darkMode = buildDarkModeExportData({
      hasDarkMode: true,
      method: 'media-query',
      darkStyles: createExtractedStyles({
        colors: ['rgb(22, 23, 29)', 'rgb(245, 245, 245)'],
        backgroundColors: ['rgb(22, 23, 29)'],
        textColors: ['rgb(245, 245, 245)'],
        usageCount: {
          'bgColor:rgb(22, 23, 29)': 2,
          'textColor:rgb(245, 245, 245)': 2,
        },
        usageOwnerIds: {
          'bgColor:rgb(22, 23, 29)': ['page-root'],
          'textColor:rgb(245, 245, 245)': ownerIds,
        },
        valueSources: {
          'bgColor:rgb(22, 23, 29)': ['element:page-background'],
          'textColor:rgb(245, 245, 245)': ['rendered:text'],
        },
        textColorPairObservations: [
          {
            captureId: 'legacy-dark|desktop',
            background: 'rgb(22, 23, 29)',
            foreground: 'rgb(245, 245, 245)',
            textRole: 'body',
            count: ownerIds.length,
            ownerIds,
          },
        ],
        renderedTextStyleObservations: darkRenderedTextOwners(ownerIds),
      }),
    })

    const foregroundCandidate = darkMode?.darkTokens?.candidates?.values?.find(
      (candidate) => candidate.group === 'colors' && candidate.role === 'foreground',
    )
    expect(darkMode?.darkTokens?.colors.foreground).toBeUndefined()
    expect(foregroundCandidate).toBeDefined()
    expect(foregroundCandidate?.evidence.sources).not.toContain('rendered:text')
    expect(foregroundCandidate?.evidence.sources).not.toContain('observed:text-background-pair')
    expect(foregroundCandidate?.evidence.renderedTextOwners).toBeUndefined()
    expect(foregroundCandidate?.evidence.pairedSurface).toBeUndefined()
  })

  test('does not reintroduce a dark-only value that the promoted base catalog rejected', () => {
    const baseWithoutShadows = { ...structuredClone(baseTokens), shadows: [] }
    const darkMode = buildDarkModeExportData(
      {
        hasDarkMode: true,
        method: 'media-query',
        darkStyles: createExtractedStyles({
          colors: ['rgb(22, 23, 29)', 'rgb(245, 245, 245)'],
          backgroundColors: ['rgb(22, 23, 29)'],
          textColors: ['rgb(245, 245, 245)'],
          shadows: ['0 2px 8px rgb(0 0 0 / 40%)'],
          usageCount: {
            'bgColor:rgb(22, 23, 29)': 10,
            'textColor:rgb(245, 245, 245)': 20,
            'shadow:0 2px 8px rgb(0 0 0 / 40%)': 4,
          },
          usageOwnerIds: {
            'shadow:0 2px 8px rgb(0 0 0 / 40%)': ['shadow-1', 'shadow-2', 'shadow-3', 'shadow-4'],
          },
          valueSources: {
            'shadow:0 2px 8px rgb(0 0 0 / 40%)': ['element:structural-shadow'],
          },
        }),
      },
      baseWithoutShadows,
    )

    expect(darkMode?.darkTokens?.shadows).toEqual([])
    expect(darkMode?.darkTokens?.candidates?.values).toContainEqual(
      expect.objectContaining({
        group: 'shadows',
        value: '0 2px 8px rgb(0 0 0 / 40%)',
        rejectionReason: 'not-in-base-catalog',
      }),
    )
  })

  test('keeps a changed dark override when the promoted base catalog owns that slot', () => {
    const darkShadow = '0 2px 8px rgb(0 0 0 / 40%)'
    const darkMode = buildDarkModeExportData(
      {
        hasDarkMode: true,
        method: 'media-query',
        darkStyles: createExtractedStyles({
          colors: ['rgb(22, 23, 29)', 'rgb(245, 245, 245)'],
          backgroundColors: ['rgb(22, 23, 29)'],
          textColors: ['rgb(245, 245, 245)'],
          shadows: [darkShadow],
          usageCount: {
            'bgColor:rgb(22, 23, 29)': 10,
            'textColor:rgb(245, 245, 245)': 20,
            [`shadow:${darkShadow}`]: 4,
          },
          usageOwnerIds: {
            [`shadow:${darkShadow}`]: ['shadow-1', 'shadow-2', 'shadow-3', 'shadow-4'],
          },
          valueSources: { [`shadow:${darkShadow}`]: ['element:structural-shadow'] },
        }),
      },
      baseTokens,
    )

    expect(darkMode?.darkTokens?.shadows).toEqual([darkShadow])
    expect(darkMode?.overrides).toMatchObject({ 'shadow.1': darkShadow })
    expect(darkMode?.darkTokens?.candidates?.values || []).not.toContainEqual(
      expect.objectContaining({ group: 'shadows', value: darkShadow, rejectionReason: 'not-in-base-catalog' }),
    )
  })

  test('does not let dark mode add more scale slots than the promoted base catalog', () => {
    const primaryShadow = '0 2px 8px rgb(0 0 0 / 40%)'
    const extraShadow = '0 12px 32px rgb(0 0 0 / 55%)'
    const darkMode = buildDarkModeExportData(
      {
        hasDarkMode: true,
        method: 'media-query',
        darkStyles: createExtractedStyles({
          colors: ['rgb(22, 23, 29)', 'rgb(245, 245, 245)'],
          backgroundColors: ['rgb(22, 23, 29)'],
          textColors: ['rgb(245, 245, 245)'],
          shadows: [primaryShadow, extraShadow],
          usageCount: {
            'bgColor:rgb(22, 23, 29)': 10,
            'textColor:rgb(245, 245, 245)': 20,
            [`shadow:${primaryShadow}`]: 8,
            [`shadow:${extraShadow}`]: 4,
          },
          usageOwnerIds: {
            [`shadow:${primaryShadow}`]: Array.from({ length: 8 }, (_value, index) => `primary-${index}`),
            [`shadow:${extraShadow}`]: Array.from({ length: 4 }, (_value, index) => `extra-${index}`),
          },
          valueSources: {
            [`shadow:${primaryShadow}`]: ['element:structural-shadow'],
            [`shadow:${extraShadow}`]: ['element:structural-shadow'],
          },
        }),
      },
      baseTokens,
    )

    expect(darkMode?.darkTokens?.shadows).toHaveLength(baseTokens.shadows.length)
    expect(darkMode?.darkTokens?.candidates?.values).toContainEqual(
      expect.objectContaining({ group: 'shadows', rejectionReason: 'not-in-base-catalog' }),
    )
  })

  test('maps multi-value dark scales by explicit shared values instead of positional indexes', () => {
    const base = { ...structuredClone(baseTokens), spacing: ['4px', '8px'] }
    const darkMode = buildDarkModeExportData(
      {
        hasDarkMode: true,
        method: 'media-query',
        darkStyles: createExtractedStyles({
          colors: ['rgb(22, 23, 29)', 'rgb(245, 245, 245)'],
          backgroundColors: ['rgb(22, 23, 29)'],
          textColors: ['rgb(245, 245, 245)'],
          spacings: ['8px', '16px'],
          usageCount: { 'spacing:8px': 4, 'spacing:16px': 4 },
          usageOwnerIds: {
            'spacing:8px': ['eight-1', 'eight-2', 'eight-3', 'eight-4'],
            'spacing:16px': ['sixteen-1', 'sixteen-2', 'sixteen-3', 'sixteen-4'],
          },
          valueSources: {
            'spacing:8px': ['element:structural-spacing'],
            'spacing:16px': ['element:structural-spacing'],
          },
        }),
      },
      base,
    )

    expect(darkMode?.darkTokens?.spacing).toEqual(['4px', '8px'])
    expect(darkMode?.overrides).toBeUndefined()
    expect(darkMode?.darkTokens?.candidates?.values).toContainEqual(
      expect.objectContaining({ group: 'spacing', value: '16px', rejectionReason: 'not-in-base-catalog' }),
    )
  })

  test('restores full dark tokens and remains compatible with legacy color-only records', () => {
    const sourceUrl = 'https://example.com/'
    const routeId = opaqueRouteIdentity(sourceUrl)
    const evidence = {
      pages: [{ id: 'page-home-desktop', routeId, url: sourceUrl, viewport: 'desktop', images: [] }],
    }
    const darkEvidence = (value: string) => ({
      value,
      confidence: 'medium' as const,
      measurementConfidence: 'medium' as const,
      semanticConfidence: 'medium' as const,
      reuseScope: 'foundation' as const,
      observationCount: 4,
      ownerCount: 4,
      semanticAgreement: 1,
      pageCount: 1,
      captureCount: 1,
      eligiblePageCount: 1,
      pageSupportRatio: 1,
      pages: [sourceUrl],
      pageRefs: [routeId],
      sources: ['usage:bgColor'],
      reasons: ['rendered-use' as const],
    })
    const fullDarkTokens = {
      ...baseTokens,
      colors: { background: '#16171d' },
      evidence: {
        'colors.background': darkEvidence('#16171d'),
      },
    }
    const restoredFull = restoreDarkModeExportData(
      fullDarkTokens,
      baseTokens,
      'class-toggle',
      '[data-theme="dark"]',
      evidence,
    )
    const restoredLegacy = restoreDarkModeExportData(fullDarkTokens.colors, baseTokens, 'media-query')

    expect(restoredFull?.darkTokens).toMatchObject(fullDarkTokens)
    expect(restoredFull?.darkTokens?.evidence?.['colors.background']).toMatchObject({
      semanticConfidence: 'medium',
      reuseScope: 'foundation',
    })
    expect(restoredFull?.method).toBe('class-toggle')
    expect(restoredFull?.selector).toBe('[data-theme="dark"]')
    expect(restoredLegacy?.darkTokens?.typography).toEqual(baseTokens.typography)
    expect(restoredLegacy?.darkTokens?.colors).toEqual({})
    expect(restoredLegacy?.overrides).toBeUndefined()
    expect(restoredLegacy?.darkTokens?.candidates?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          group: 'colors',
          role: 'background',
          value: '#16171d',
          rejectionReason: 'ungrounded-dark-override',
        }),
      ]),
    )
  })

  test('rejects a restored dark foreground without capture-bound rendered owner and pair evidence', () => {
    const sourceUrl = 'https://example.com/'
    const routeId = opaqueRouteIdentity(sourceUrl)
    const restored = restoreDarkModeExportData(
      {
        ...baseTokens,
        colors: { foreground: '#f5f5f5' },
        evidence: {
          'colors.foreground': {
            value: '#f5f5f5',
            confidence: 'high',
            measurementConfidence: 'high',
            semanticConfidence: 'high',
            reuseScope: 'foundation',
            observationCount: 4,
            ownerCount: 4,
            semanticAgreement: 1,
            pageCount: 1,
            captureCount: 1,
            eligiblePageCount: 1,
            pageSupportRatio: 1,
            pages: [sourceUrl],
            pageRefs: [routeId],
            sources: ['usage:textColor'],
            reasons: ['rendered-use'],
          },
        },
      },
      baseTokens,
      'media-query',
      undefined,
      { pages: [{ id: 'page-home-desktop', routeId, url: sourceUrl, viewport: 'desktop', images: [] }] },
    )

    expect(restored?.overrides).toBeUndefined()
    expect(restored?.darkTokens?.colors.foreground).toBeUndefined()
    expect(restored?.darkTokens?.candidates?.values).toContainEqual(
      expect.objectContaining({
        group: 'colors',
        role: 'foreground',
        value: '#f5f5f5',
        rejectionReason: 'ungrounded-dark-override',
      }),
    )
  })

  test('rejects a restored dark override whose page reference contradicts canonical Evidence', () => {
    const sourceUrl = 'https://example.com/'
    const routeId = opaqueRouteIdentity(sourceUrl)
    const restored = restoreDarkModeExportData(
      {
        ...baseTokens,
        colors: { background: '#16171d' },
        evidence: {
          'colors.background': {
            value: '#16171d',
            confidence: 'high',
            measurementConfidence: 'high',
            semanticConfidence: 'high',
            reuseScope: 'foundation',
            observationCount: 4,
            ownerCount: 4,
            semanticAgreement: 1,
            pageCount: 1,
            captureCount: 1,
            eligiblePageCount: 1,
            pageSupportRatio: 1,
            pages: ['imprint://dark-mode/'],
            pageRefs: [routeId],
            sources: ['usage:bgColor'],
            reasons: ['rendered-use'],
          },
        },
      },
      baseTokens,
      'media-query',
      undefined,
      { pages: [{ id: 'page-home-desktop', routeId, url: sourceUrl, viewport: 'desktop', images: [] }] },
    )

    expect(restored?.overrides).toBeUndefined()
    expect(restored?.darkTokens?.colors.background).toBeUndefined()
    expect(restored?.darkTokens?.candidates?.values).toContainEqual(
      expect.objectContaining({
        group: 'colors',
        role: 'background',
        value: '#16171d',
        rejectionReason: 'ungrounded-dark-override',
      }),
    )
  })

  test('restores a changed dark foreground when its rendered pair is bound to canonical Evidence', () => {
    const sourceUrl = 'https://example.com/'
    const routeId = opaqueRouteIdentity(sourceUrl)
    const ownerIds = ['copy-1', 'copy-2']
    const built = buildDarkModeExportData(
      {
        hasDarkMode: true,
        method: 'media-query',
        source: { url: sourceUrl, viewport: 'desktop' },
        darkStyles: createExtractedStyles({
          colors: ['rgb(22, 23, 29)', 'rgb(245, 245, 245)'],
          backgroundColors: ['rgb(22, 23, 29)'],
          textColors: ['rgb(245, 245, 245)'],
          usageCount: {
            'bgColor:rgb(22, 23, 29)': 2,
            'textColor:rgb(245, 245, 245)': 2,
          },
          usageOwnerIds: {
            'bgColor:rgb(22, 23, 29)': ['page-root'],
            'textColor:rgb(245, 245, 245)': ownerIds,
          },
          valueSources: {
            'bgColor:rgb(22, 23, 29)': ['element:page-background'],
            'textColor:rgb(245, 245, 245)': ['rendered:text'],
          },
          textColorPairObservations: [
            {
              captureId: 'dark-home|desktop',
              background: 'rgb(22, 23, 29)',
              foreground: 'rgb(245, 245, 245)',
              textRole: 'body',
              count: ownerIds.length,
              ownerIds,
            },
          ],
          renderedTextStyleObservations: darkRenderedTextOwners(ownerIds),
        }),
      },
      baseTokens,
    )
    const restored = restoreDarkModeExportData(built?.darkTokens, baseTokens, 'media-query', undefined, {
      pages: [{ id: 'page-home-desktop', routeId, url: sourceUrl, viewport: 'desktop', images: [] }],
    })

    expect(restored?.darkTokens?.colors.foreground).toBe('#f5f5f5')
    expect(restored?.overrides).toMatchObject({ 'color.foreground': '#f5f5f5' })
  })

  test('rejects a changed dark value carrying inherited light evidence at the same path', () => {
    const restored = restoreDarkModeExportData(
      {
        ...baseTokens,
        colors: { background: '#16171d' },
        evidence: {
          'colors.background': {
            value: '#ffffff',
            confidence: 'high',
            measurementConfidence: 'high',
            semanticConfidence: 'high',
            reuseScope: 'foundation',
            observationCount: 8,
            ownerCount: 8,
            semanticAgreement: 1,
            pageCount: 2,
            captureCount: 2,
            eligiblePageCount: 2,
            pageSupportRatio: 1,
            pages: ['https://example.com/', 'https://example.com/about'],
            sources: ['usage:bgColor'],
            reasons: ['cross-page'],
          },
        },
      },
      baseTokens,
      'media-query',
    )

    expect(restored?.darkTokens?.colors.background).toBeUndefined()
    expect(restored?.overrides).toBeUndefined()
    expect(restored?.darkTokens?.candidates?.values).toContainEqual(
      expect.objectContaining({
        group: 'colors',
        value: '#16171d',
        rejectionReason: 'ungrounded-dark-override',
        evidence: expect.objectContaining({ value: '#16171d', ownerCount: 0 }),
      }),
    )
  })

  test('does not treat independently clustered dark palette indexes as base token overrides', () => {
    const restored = restoreDarkModeExportData(
      {
        ...baseTokens,
        colors: { background: '#16171d', 'palette-3': '#0084ff' },
        evidence: {
          'colors.palette-3': {
            value: '#0084ff',
            confidence: 'high',
            observationCount: 8,
            pageCount: 1,
            captureCount: 1,
            pages: [],
            sources: ['usage:bgColor'],
            reasons: [],
          },
        },
      },
      baseTokens,
      'media-query',
    )

    expect(restored?.darkTokens?.colors['palette-3']).toBeUndefined()
    expect(restored?.darkTokens?.colors['dark-palette-3']).toBeUndefined()
    expect(restored?.darkTokens?.evidence?.['colors.palette-3']).toBeUndefined()
    expect(restored?.darkTokens?.evidence?.['colors.dark-palette-3']).toBeUndefined()
    expect(restored?.darkTokens?.candidates?.values).toContainEqual(
      expect.objectContaining({
        group: 'colors',
        role: 'palette-3',
        value: '#0084ff',
        rejectionReason: 'not-in-base-catalog',
      }),
    )
  })

  test('includes the dark variant in DTCG JSON without changing the base token paths', () => {
    const darkTokens = { ...baseTokens, colors: { background: '#16171d', foreground: '#f5f5f5' } }
    const dtcg = JSON.parse(generateDtcgJson(baseTokens, { hasDarkMode: true, darkTokens, method: 'media-query' })) as {
      color: Record<string, { $value: string }>
      dark: {
        color: Record<string, { $value: string }>
        shadow: Record<string, { $value: string }>
        spacing: Record<string, { $value: string }>
      }
      $extensions: Record<string, { method: string }>
    }

    expect(dtcg.color.background.$value).toBe('#ffffff')
    expect(dtcg.dark.color.background.$value).toBe('#16171d')
    expect(dtcg.dark.shadow.sm.$value).toBe(darkTokens.shadows[0])
    expect(dtcg.dark.spacing['1'].$value).toBe(darkTokens.spacing[0])
    expect(dtcg.$extensions['com.imprint.darkMode'].method).toBe('media-query')
  })

  test('includes dark colors and shadows in Tailwind overrides', () => {
    const darkTokens = {
      ...baseTokens,
      colors: { background: '#16171d', foreground: '#f5f5f5' },
      shadows: ['0 2px 8px rgb(0 0 0 / 40%)'],
    }
    const tailwind = generateTailwindTheme(baseTokens, {
      hasDarkMode: true,
      darkTokens,
      method: 'media-query',
    })

    expect(tailwind).toContain('@media (prefers-color-scheme: dark)')
    expect(tailwind).toContain('--color-background: #16171d;')
    expect(tailwind).toContain('--shadow-sm: 0 2px 8px rgb(0 0 0 / 40%);')
  })

  test('uses Tailwind v4 namespaces that generate real utilities', async () => {
    const tailwind = generateTailwindTheme(
      {
        ...baseTokens,
        typography: { ...baseTokens.typography, letterSpacings: ['-0.01em'] },
        borders: ['1px solid #e5e7eb'],
        zIndices: ['10'],
        transitions: ['150ms', '200ms'],
      },
      undefined,
      [{ width: 640, label: 'tablet-sm' }],
    )

    expect(tailwind).toContain('--text-base: 1rem;')
    expect(tailwind).toContain('--leading-normal: 1.5;')
    expect(tailwind).toContain('--font-weight-normal: 400;')
    expect(tailwind).toContain('--tracking-tight: -0.01em;')
    expect(tailwind).toContain('--breakpoint-tablet-sm: 40rem;')
    expect(tailwind).toContain(':root {')
    expect(tailwind).toContain('--border-1: 1px solid #e5e7eb;')
    expect(tailwind).not.toContain('--font-size-base:')

    const compiler = await compile(`${tailwind}\n@tailwind utilities;`)
    const css = compiler.build([
      'text-base',
      'leading-normal',
      'font-normal',
      'tracking-tight',
      'p-1',
      'rounded-sm',
      'shadow-sm',
      'tablet-sm:text-base',
    ])
    expect(css).toContain('.text-base')
    expect(css).toContain('.leading-normal')
    expect(css).toContain('.font-normal')
    expect(css).toContain('.tracking-tight')
    expect(css).toContain('.p-1')
    expect(css).toContain('.rounded-sm')
    expect(css).toContain('.shadow-sm')
    expect(css).toContain('@media (width >= 40rem)')
  })

  test('exports every promoted font system under stable generic-family names', () => {
    const multiFontTokens: DesignToken = {
      ...structuredClone(baseTokens),
      typography: {
        ...structuredClone(baseTokens.typography),
        fontFamilies: ['Georgia', 'Inter'],
        fontStacks: ['Georgia, serif', 'Inter, sans-serif'],
      },
    }

    const css = generateCssVariables(multiFontTokens)
    const tailwind = generateTailwindTheme(multiFontTokens)
    const scss = generateScssVariables(multiFontTokens)
    const designDoc = generateDesignDoc(multiFontTokens)
    const dtcg = JSON.parse(generateDtcgJson(multiFontTokens))

    expect(css).toContain('--font-serif: Georgia, serif;')
    expect(css).toContain('--font-sans: Inter, sans-serif;')
    expect(tailwind).toContain('--font-serif: Georgia, serif;')
    expect(tailwind).toContain('--font-sans: Inter, sans-serif;')
    expect(scss).toContain('$font-serif: Georgia, serif;')
    expect(scss).toContain('$font-sans: Inter, sans-serif;')
    expect(designDoc).toContain('font-family-serif:')
    expect(designDoc).toContain('fontFamily: Georgia, serif')
    expect(designDoc).toContain('font-family-sans:')
    expect(designDoc).toContain('fontFamily: Inter, sans-serif')
    expect(dtcg.typography.fontStacks.$value).toEqual(['Georgia, serif', 'Inter, sans-serif'])
  })

  test('keeps base font token names when an observed dark override changes generic family', () => {
    const darkTokens: DesignToken = {
      ...structuredClone(baseTokens),
      typography: {
        ...structuredClone(baseTokens.typography),
        fontFamilies: ['Georgia'],
        fontStacks: ['Georgia, serif'],
        fontWeights: ['700'],
      },
    }
    const darkMode = {
      hasDarkMode: true,
      darkTokens,
      overrides: {
        'typography.font-family.1': 'Georgia',
        'typography.font-stack.1': 'Georgia, serif',
        'typography.font-weight.1': '700',
      },
      method: 'media-query' as const,
    }

    const css = generateCssVariables(baseTokens, darkMode)
    const tailwind = generateTailwindTheme(baseTokens, darkMode)
    const scss = generateScssVariables(baseTokens, darkMode)
    const designDoc = generateDesignDoc(baseTokens, undefined, undefined, darkMode)

    expect(css).toMatch(/Dark mode overrides[\s\S]*--font-sans: Georgia, serif;/)
    expect(css).not.toMatch(/Dark mode overrides[\s\S]*--font-serif:/)
    expect(tailwind).toMatch(/Dark mode overrides[\s\S]*--font-sans: Georgia, serif;/)
    expect(scss).toContain('$dark-font-sans: Georgia, serif;')
    expect(tailwind).toMatch(/Dark mode overrides[\s\S]*--font-weight-normal: 700;/)
    expect(tailwind).not.toMatch(/Dark mode overrides[\s\S]*--font-weight-bold: 700;/)
    expect(scss).toMatch(/@mixin imprint-dark-theme \{[\s\S]*--font-sans: Georgia, serif;/)
    expect(designDoc).toContain('typography.font-stack.1: Georgia, serif')
    expect(designDoc).toContain('font-family-sans:')
    expect(designDoc).toContain('fontFamily: Georgia, serif')
  })

  test('preserves an observed attribute selector in CSS, Tailwind, and SCSS', () => {
    const darkMode = {
      hasDarkMode: true,
      darkTokens: { ...baseTokens, colors: { background: '#16171d', foreground: '#f5f5f5' } },
      method: 'class-toggle' as const,
      selector: '[data-theme="dark"]',
    }

    expect(generateCssVariables(baseTokens, darkMode)).toContain('[data-theme="dark"] {')
    expect(generateTailwindTheme(baseTokens, darkMode)).toContain('[data-theme="dark"] {')
    expect(generateScssVariables(baseTokens, darkMode)).toContain('[data-theme="dark"] {')
    expect(generateScssVariables(baseTokens, darkMode)).toContain('@mixin imprint-dark-theme')
    expect(generateScssVariables(baseTokens, darkMode)).toContain('$font-weight-normal: 400;')
    expect(generateScssVariables(baseTokens, darkMode)).toContain('$dark-line-height-normal: 1.5;')
  })

  test('labels dark token provenance without implying a dark-by-default site', () => {
    const darkTokens = { ...baseTokens, colors: { background: '#16171d', foreground: '#f5f5f5' } }
    const mediaDoc = generateDesignDoc(baseTokens, undefined, undefined, {
      hasDarkMode: true,
      darkTokens,
      method: 'media-query',
    })
    expect(mediaDoc).toContain('observed by emulating prefers-color-scheme: dark')
    expect(mediaDoc).toContain('does not imply the site loads in dark by default')

    const toggleDoc = generateDesignDoc(
      baseTokens,
      undefined,
      undefined,
      { hasDarkMode: true, darkTokens, method: 'class-toggle', selector: '[data-theme="dark"]' },
      undefined,
      undefined,
      'zh-CN',
    )
    expect(toggleDoc).toContain('切换 [data-theme="dark"] 后读取计算样式')
    expect(toggleDoc).toContain('不代表该站点默认以深色加载')
  })

  test('rejects unsafe stored dark selectors', () => {
    const restored = restoreDarkModeExportData(baseTokens, baseTokens, 'class-toggle', 'body { color: red }')
    expect(restored?.selector).toBe('.dark')
  })

  test('ignores empty dark snapshots and safely defaults inconsistent methods', () => {
    expect(restoreDarkModeExportData({}, baseTokens, 'media-query')).toBeUndefined()
    expect(restoreDarkModeExportData({ background: '#16171d' }, baseTokens, 'none')?.method).toBe('media-query')
  })

  test('reports canonical independent color owners instead of duplicated raw browser counts', () => {
    const designDoc = generateDesignDoc({
      ...baseTokens,
      usageCount: {
        'bgColor:rgb(255, 255, 255)': 3,
        'textColor:rgb(17, 24, 39)': 7,
      },
      evidence: {
        'colors.background': {
          value: '#ffffff',
          confidence: 'high',
          observationCount: 3,
          ownerCount: 2,
          pageCount: 1,
          captureCount: 1,
          pages: ['https://example.com/'],
          sources: ['computed:background'],
          roleCounts: { bgColor: 2 },
          reasons: ['rendered-use'],
        },
        'colors.foreground': {
          value: '#111827',
          confidence: 'high',
          observationCount: 7,
          ownerCount: 4,
          pageCount: 1,
          captureCount: 1,
          pages: ['https://example.com/'],
          sources: ['rendered:text'],
          roleCounts: { textColor: 4 },
          reasons: ['rendered-use'],
        },
      },
    })

    expect(designDoc).toContain('| `--color-background` | `#ffffff` | 2× (background) |')
    expect(designDoc).toContain('| `--color-foreground` | `#111827` | 4× (text) |')
    expect(designDoc).not.toContain('| `--color-background` | `#ffffff` | 3×')
    expect(designDoc).not.toContain('| `--color-foreground` | `#111827` | 7×')
  })

  test('reports structural color usage for default and subtle border tokens', () => {
    const tokens = {
      ...baseTokens,
      colors: {
        ...baseTokens.colors,
        border: 'rgb(235, 236, 237)',
        'border-subtle': 'rgb(248, 248, 250)',
      },
      usageCount: {
        'borderColor:rgb(235, 236, 237)': 34,
        'borderColor:rgb(248, 248, 250)': 40,
      },
      evidence: {
        'colors.border': {
          value: 'rgb(235, 236, 237)',
          confidence: 'high',
          observationCount: 34,
          ownerCount: 6,
          pageCount: 2,
          captureCount: 2,
          pages: ['https://example.com/', 'https://example.com/about'],
          sources: ['computed:border'],
          roleCounts: { borderColor: 6 },
          reasons: ['cross-page', 'rendered-use'],
        },
        'colors.border-subtle': {
          value: 'rgb(248, 248, 250)',
          confidence: 'high',
          observationCount: 40,
          ownerCount: 8,
          pageCount: 2,
          captureCount: 2,
          pages: ['https://example.com/', 'https://example.com/about'],
          sources: ['computed:border'],
          roleCounts: { borderColor: 8 },
          reasons: ['cross-page', 'rendered-use'],
        },
      },
    }
    const englishDoc = generateDesignDoc(tokens)
    const chineseDoc = generateDesignDoc(tokens, undefined, undefined, undefined, undefined, undefined, 'zh-CN')

    expect(englishDoc).toContain('| `--color-border` | `#ebeced` | 6× (border) | high · 2 pages |')
    expect(chineseDoc).toContain('| `--color-border-subtle` | `#f8f8fa` | 8× (边框) | 高 · 2页 |')
    expect(englishDoc).not.toContain('| `--color-border` | `#ebeced` | 34×')
    expect(chineseDoc).not.toContain('| `--color-border-subtle` | `#f8f8fa` | 40×')
  })
})
