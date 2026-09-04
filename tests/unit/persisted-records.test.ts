import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import { opaqueRouteIdentity } from '../../src/core/analyzer/url-identity.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import { buildDarkModeExportData } from '../../src/core/export/index.js'
import {
  compactTokenSnapshot,
  readAnalysisCompletion,
  readAnalysisTiming,
  readCaptureManifest,
  readDarkModeExportData,
  readDesignEvidence,
  readDesignTokens,
  readFirstScreenshotPath,
  readPageScreenshots,
  readStoredDesignTokens,
  readStringList,
  readValidationReport,
  referenceCaptureFromRecord,
  revalidateDesignTokens,
  toAnalysisSummary,
  toThemeSummary,
} from '../../src/main/persisted-records.js'
import type { ThemeSummaryRecord } from '../../src/shared/ipc-contract.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

const tokens: DesignToken = {
  colors: { background: '#ffffff' },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['16px'],
    fontWeights: ['400'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: ['8px'],
  radii: ['4px'],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: [],
}

describe('persisted record adapters', () => {
  it('compacts token snapshots without changing malformed legacy values', () => {
    expect(compactTokenSnapshot(JSON.stringify({ ...tokens, usageCount: { 'bgColor:#ffffff': 2 } }))).toBe(
      JSON.stringify(tokens),
    )
    expect(compactTokenSnapshot('{invalid')).toBe('{invalid')
    expect(compactTokenSnapshot(null)).toBeNull()
  })

  it('compacts light and dark token fields in theme summaries', () => {
    const record: ThemeSummaryRecord = {
      id: 'theme-1',
      name: 'Example',
      source_url: 'https://example.com',
      screenshot_path: null,
      tokens_json: JSON.stringify({ ...tokens, usageCount: { 'bgColor:#ffffff': 2 } }),
      dark_tokens_json: JSON.stringify({ ...tokens, usageCount: { 'bgColor:#000000': 1 } }),
      dark_mode_method: 'media-query',
      dark_mode_selector: null,
      tags: '[]',
      is_favorite: 0,
      created_at: '2026-08-24T00:00:00.000Z',
      updated_at: '2026-08-24T00:00:00.000Z',
    }

    expect(JSON.parse(toThemeSummary(record).tokens_json)).not.toHaveProperty('usageCount')
    expect(JSON.parse(toThemeSummary(record).dark_tokens_json || '{}')).not.toHaveProperty('usageCount')
  })

  it('decodes typed analysis fields at the persistence boundary', () => {
    expect(readDesignTokens(JSON.stringify(tokens))).toEqual(tokens)
    expect(readDesignTokens('{}')).toBeNull()
    expect(readDesignTokens('{invalid')).toBeNull()
    expect(readStringList(JSON.stringify(['responsive', 2, 'dark-mode']))).toEqual([])
    expect(readStringList(JSON.stringify(['responsive', 'dark-mode']))).toEqual(['responsive', 'dark-mode'])
    expect(readValidationReport(JSON.stringify({ schemaVersion: '1' }))).toEqual({ schemaVersion: '1' })
    expect(readValidationReport('[]')).toBeNull()
  })

  it('revalidates complete stored token evidence before returning portable values', () => {
    const staleTokens: DesignToken = {
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
      radii: [],
      shadows: [],
      borders: [],
      zIndices: [],
      transitions: [],
      evidence: {
        'spacing.0': {
          value: '2px',
          confidence: 'low',
          measurementConfidence: 'high',
          semanticConfidence: 'low',
          reuseScope: 'local',
          observationCount: 1,
          ownerCount: 1,
          foundationOwnerCount: 0,
          minimumPageFoundationOwnerCount: 0,
          semanticAgreement: 0.25,
          pageCount: 1,
          captureCount: 1,
          eligiblePageCount: 1,
          pageSupportRatio: 1,
          pages: ['https://example.com/'],
          sources: ['usage:gap'],
          reasons: ['computed-style'],
        },
      },
    }

    const restored = revalidateDesignTokens(staleTokens)

    expect(restored?.spacing).toEqual([])
    expect(restored?.candidates?.values).toContainEqual(
      expect.objectContaining({ group: 'spacing', value: '2px', rejectionReason: 'low-semantic-confidence' }),
    )
  })

  it('prefers the Evidence-owned catalog over an incomplete standalone legacy snapshot', () => {
    const stale = { ...tokens, colors: { background: '#ffffff', foreground: '#ffffff' } }
    const observed = { ...tokens, colors: { background: '#ffffff', foreground: '#1f2328' } }

    const restored = readStoredDesignTokens(JSON.stringify(stale), { tokens: observed } as DesignEvidence)

    expect(restored?.colors).toEqual(observed.colors)
  })

  it('reads screenshot paths and tolerates malformed legacy screenshot arrays', () => {
    const serialized = JSON.stringify([{ url: 'https://example.com', path: '/tmp/page.png', viewport: 'desktop' }])
    const mixed = JSON.stringify([
      {},
      { url: 'https://example.com', path: '/tmp/page.png', viewport: 'desktop', width: 1440 },
      { url: 'https://example.com', path: 42, viewport: 'mobile' },
    ])

    expect(readFirstScreenshotPath(serialized)).toBe('/tmp/page.png')
    expect(readFirstScreenshotPath('{invalid')).toBeNull()
    expect(readPageScreenshots(serialized)).toHaveLength(1)
    expect(readPageScreenshots(mixed)).toEqual([
      { url: 'https://example.com', path: '/tmp/page.png', viewport: 'desktop', width: 1440 },
    ])
    expect(readPageScreenshots(undefined)).toEqual([])
    expect(readPageScreenshots('{invalid')).toEqual([])
  })

  it('normalizes stored timing fields while retaining valid optional measurements', () => {
    expect(
      readAnalysisTiming(
        JSON.stringify({
          userWaitMs: 12.5,
          browserMs: -1,
          validationMs: 'invalid',
          totalMs: 120,
          imageCount: 3,
          budgetExceeded: ['screenshots', 4],
        }),
      ),
    ).toEqual({
      userWaitMs: 12.5,
      validationMs: 0,
      totalMs: 120,
      imageCount: 3,
      budgetExceeded: ['screenshots'],
    })
    expect(readAnalysisTiming('{invalid')).toBeUndefined()
  })

  it('accepts only supported completion records', () => {
    expect(readAnalysisCompletion(JSON.stringify({ reason: 'complete' }))).toEqual({ reason: 'complete' })
    expect(readAnalysisCompletion(JSON.stringify({ reason: 'time-limit', activeLimitMs: 30_000 }))).toEqual({
      reason: 'time-limit',
      activeLimitMs: 30_000,
    })
    expect(readAnalysisCompletion(JSON.stringify({ reason: 'time-limit' }))).toBeUndefined()
    expect(readAnalysisCompletion(JSON.stringify({ reason: 'unknown' }))).toBeUndefined()
  })

  it('checks the stable capture-manifest envelope before restoring it', () => {
    const manifest = {
      schemaVersion: '1',
      tool: {},
      request: {},
      environment: { viewports: [] },
      stabilization: { animationFreeze: {} },
      capture: {},
    }

    expect(readCaptureManifest(JSON.stringify(manifest))).toEqual(manifest)
    expect(readCaptureManifest(JSON.stringify({ ...manifest, schemaVersion: '2' }))).toBeNull()
    expect(readCaptureManifest('{invalid')).toBeNull()
  })

  it('restores evidence eligibility and derives history summary display fields', () => {
    const evidence = {
      schemaVersion: '1',
      analysisId: 'analysis-1',
      source: {
        requestedUrl: 'https://example.com/path',
        finalUrl: 'https://example.com/path',
        accessMode: 'anonymous',
        siteName: '  Example Studio  ',
      },
      pages: [
        {
          id: 'page-1',
          url: 'https://example.com/path',
          viewport: 'desktop',
          siteName: 'Fallback page name',
          images: [],
          health: {
            status: 'degraded',
            issues: [{ code: 'horizontal-overflow' }],
            evidenceEligible: false,
          },
        },
      ],
      tokens,
      featureTags: [],
      topology: { schemaVersion: '1', pages: [], globalLayers: [], crossPagePatternIds: [] },
      sections: [],
      components: [],
      layoutNodes: [],
      interactionStyles: { hover: [], focus: [], active: [] },
      interactionObservations: [],
      breakpoints: [],
      responsiveObservations: [],
      motion: [],
      mediaLayers: [],
      coverage: {},
      limitations: [],
    }
    const serializedEvidence = JSON.stringify(evidence)
    const restored = readDesignEvidence(serializedEvidence)
    const summary = toAnalysisSummary({
      id: 'analysis-1',
      url: 'https://www.example.com/path',
      page_screenshots_json: JSON.stringify([{ path: '/tmp/page.png' }]),
      design_evidence_json: serializedEvidence,
    })

    expect(restored?.pages[0].health?.evidenceEligible).toBe(true)
    expect(summary).toMatchObject({
      id: 'analysis-1',
      url: 'https://www.example.com/path',
      site_name: 'Example Studio',
      screenshot_path: '/tmp/page.png',
    })
    expect(summary).not.toHaveProperty('page_screenshots_json')
    expect(summary).not.toHaveProperty('design_evidence_json')

    expect(readDesignEvidence(JSON.stringify({ ...evidence, pages: [{}] }))).toBeNull()
    expect(
      readDesignEvidence(JSON.stringify({ ...evidence, pages: [{ ...evidence.pages[0], images: [{}] }] })),
    ).toBeNull()
  })

  it('falls back to the hostname when stored evidence has no site name', () => {
    expect(toAnalysisSummary({ url: 'https://www.example.com/path' }, null)).toMatchObject({
      site_name: 'example.com',
      screenshot_path: null,
    })
  })

  it('uses the lightweight stored history projection without exposing its internal column', () => {
    expect(
      toAnalysisSummary({
        id: 'analysis-projected',
        url: 'https://example.com',
        site_name: 'Stored name',
        preview_path: '/tmp/preview.jpg',
        design_evidence_json: '{invalid',
      }),
    ).toEqual({
      id: 'analysis-projected',
      url: 'https://example.com',
      site_name: 'Stored name',
      screenshot_path: '/tmp/preview.jpg',
    })
  })

  it('restores dark tokens and comparison captures from valid records', () => {
    const sourceUrl = 'https://example.com/'
    const routeId = opaqueRouteIdentity(sourceUrl)
    const ownerIds = ['copy-1', 'copy-2', 'copy-3', 'copy-4']
    const baseTokens = {
      ...tokens,
      colors: { background: '#ffffff', foreground: '#111111' },
    }
    const builtDarkMode = buildDarkModeExportData(
      {
        hasDarkMode: true,
        method: 'media-query',
        source: { url: sourceUrl, viewport: 'desktop' },
        darkStyles: createExtractedStyles({
          colors: ['rgb(0, 0, 0)', 'rgb(255, 255, 255)'],
          backgroundColors: ['rgb(0, 0, 0)'],
          textColors: ['rgb(255, 255, 255)'],
          usageCount: {
            'bgColor:rgb(0, 0, 0)': 4,
            'textColor:rgb(255, 255, 255)': 4,
          },
          usageOwnerIds: {
            'bgColor:rgb(0, 0, 0)': ['page-root'],
            'textColor:rgb(255, 255, 255)': ownerIds,
          },
          valueSources: {
            'bgColor:rgb(0, 0, 0)': ['element:page-background'],
            'textColor:rgb(255, 255, 255)': ['rendered:text'],
          },
          semanticSurfaceObservations: [
            {
              captureId: 'dark-home|desktop',
              ownerId: 'page-root',
              value: 'rgb(0, 0, 0)',
              domain: 'foundation',
              role: 'page-canvas',
              rendered: true,
              declared: false,
              elementKind: 'body',
              areaRatio: 1,
              viewportCoverage: 1,
            },
          ],
          textColorPairObservations: [
            {
              captureId: 'dark-home|desktop',
              background: 'rgb(0, 0, 0)',
              foreground: 'rgb(255, 255, 255)',
              textRole: 'body',
              count: ownerIds.length,
              ownerIds,
            },
          ],
          renderedTextStyleObservations: ownerIds.map((ownerId) => ({
            ownerId,
            textRole: 'body' as const,
            styles: {
              color: 'rgb(255, 255, 255)',
              backgroundColor: 'rgb(0, 0, 0)',
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
              foreground: 'rgb(255, 255, 255)',
            },
          })),
        }),
      },
      baseTokens,
    )
    expect(builtDarkMode?.darkTokens).toBeDefined()
    if (!builtDarkMode?.darkTokens) throw new Error('Fixture must produce a valid paired dark theme')
    const darkTokens = builtDarkMode.darkTokens
    const restoredDarkTokens = readDarkModeExportData(
      JSON.stringify(darkTokens),
      baseTokens,
      'media-query',
      undefined,
      {
        pages: [
          {
            id: 'page-home-desktop',
            routeId,
            url: sourceUrl,
            viewport: 'desktop',
            images: [],
          },
        ],
      },
    )?.darkTokens
    expect(restoredDarkTokens).toMatchObject(darkTokens)
    expect(restoredDarkTokens?.evidence?.['colors.background']).toMatchObject({
      semanticConfidence: 'medium',
      reuseScope: 'foundation',
    })
    expect(readDarkModeExportData('{invalid', baseTokens, 'media-query')).toBeUndefined()

    expect(
      referenceCaptureFromRecord({
        id: 'analysis-1',
        url: 'https://example.com/requested',
        final_url: 'https://example.com/final',
        route_identity: 'route-123456789abc',
        created_at: '2026-08-24T00:00:00.000Z',
        tokens_json: JSON.stringify(tokens),
      }),
    ).toMatchObject({
      analysisId: 'analysis-1',
      url: 'https://example.com/final',
      routeIdentity: 'route-123456789abc',
      createdAt: '2026-08-24T00:00:00.000Z',
      tokens,
      evidence: null,
      manifest: null,
    })
    expect(referenceCaptureFromRecord({ id: 'analysis-2', tokens_json: '{}' })).toBeNull()
  })
})
