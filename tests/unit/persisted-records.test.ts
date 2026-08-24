import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import {
  compactTokenSnapshot,
  readAnalysisCompletion,
  readAnalysisTiming,
  readCaptureManifest,
  readDarkModeExportData,
  readDesignEvidence,
  readFirstScreenshotPath,
  readPageScreenshots,
  referenceCaptureFromRecord,
  toAnalysisSummary,
  toThemeSummary,
} from '../../src/main/persisted-records.js'
import type { ThemeSummaryRecord } from '../../src/shared/ipc-contract.js'

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

  it('reads screenshot paths and preserves strict screenshot-array parsing', () => {
    const serialized = JSON.stringify([{ url: 'https://example.com', path: '/tmp/page.png', viewport: 'desktop' }])

    expect(readFirstScreenshotPath(serialized)).toBe('/tmp/page.png')
    expect(readFirstScreenshotPath('{invalid')).toBeNull()
    expect(readPageScreenshots(serialized)).toHaveLength(1)
    expect(readPageScreenshots(undefined)).toEqual([])
    expect(() => readPageScreenshots('{invalid')).toThrow()
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
      source: { siteName: '  Example Studio  ' },
      pages: [
        {
          siteName: 'Fallback page name',
          health: {
            status: 'degraded',
            issues: [{ code: 'horizontal-overflow' }],
            evidenceEligible: false,
          },
        },
      ],
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
  })

  it('falls back to the hostname when stored evidence has no site name', () => {
    expect(toAnalysisSummary({ url: 'https://www.example.com/path' }, null)).toMatchObject({
      site_name: 'example.com',
      screenshot_path: null,
    })
  })

  it('restores dark tokens and comparison captures from valid records', () => {
    const darkTokens = { ...tokens, colors: { background: '#000000' } }
    expect(readDarkModeExportData(JSON.stringify(darkTokens), tokens, 'media-query')?.darkTokens).toEqual(darkTokens)
    expect(readDarkModeExportData('{invalid', tokens, 'media-query')).toBeUndefined()

    expect(
      referenceCaptureFromRecord({
        id: 'analysis-1',
        url: 'https://example.com/requested',
        final_url: 'https://example.com/final',
        created_at: '2026-08-24T00:00:00.000Z',
        tokens_json: JSON.stringify(tokens),
      }),
    ).toMatchObject({
      analysisId: 'analysis-1',
      url: 'https://example.com/final',
      createdAt: '2026-08-24T00:00:00.000Z',
      tokens,
      evidence: null,
      manifest: null,
    })
    expect(referenceCaptureFromRecord({ id: 'analysis-2', tokens_json: '{}' })).toBeNull()
  })
})
