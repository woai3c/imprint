import { describe, expect, it } from 'vitest'

import { buildAnalysisArtifacts } from '../../src/core/analysis-artifacts.js'
import type { AnalysisResult, DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'

const privateUrl = 'https://user:secret@example.com/products?token=private#details'
const tokens: DesignToken = {
  colors: { background: '#ffffff', foreground: '#111827', primary: '#2563eb' },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['16px'],
    fontWeights: ['400'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: ['8px'],
  radii: ['8px'],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: [],
}

const evidence: DesignEvidence = {
  schemaVersion: '1',
  analysisId: 'analysis-artifacts',
  source: { requestedUrl: privateUrl, finalUrl: privateUrl, accessMode: 'anonymous', language: 'en' },
  pages: [
    {
      id: 'page-1',
      url: privateUrl,
      viewport: 'desktop',
      role: 'landing',
      images: [],
    },
  ],
  tokens,
  featureTags: [],
  topology: {
    schemaVersion: '1',
    pages: [{ pageId: 'page-1', role: 'landing', sectionIds: ['section-1'] }],
    globalLayers: [],
    crossPagePatternIds: [],
  },
  sections: [
    {
      id: 'section-1',
      pageId: 'page-1',
      order: 0,
      role: 'hero',
      rect: { x: 0, y: 0, width: 1, height: 0.5 },
      layoutMode: 'flow',
      tokenRefs: ['color.primary'],
      componentRefs: [],
      interactionRefs: [],
      mediaLayerRefs: [],
      evidenceRefs: [],
    },
  ],
  components: [],
  layoutNodes: [],
  interactionStyles: { hover: [], focus: [], active: [] },
  interactionObservations: [],
  breakpoints: [],
  responsiveObservations: [],
  motion: [],
  mediaLayers: [],
  coverage: {
    pageCoverage: 'complete',
    captureCoverage: { expected: 1, captured: 1, status: 'complete', requestedViewports: ['desktop'] },
    sectionCoverage: 1,
    viewportCoverage: ['desktop'],
    interactionCoverage: { candidates: 0, safelyObserved: 0, skipped: 0 },
    mediaCoverage: { majorRegions: 0, classifiedRegions: 0, iconRegions: 0 },
    accessRestrictions: [],
    limitations: [],
  },
  limitations: [],
}

const result = {
  analysisId: evidence.analysisId,
  tokens,
  designEvidence: evidence,
  darkMode: null,
  featureTags: [],
  components: [],
  breakpoints: [],
  finalUrl: privateUrl,
  pageCoverage: {
    requested: 1,
    discovered: 0,
    selected: 0,
    analyzed: 1,
    pages: [{ url: privateUrl, source: 'requested', kind: 'entry' }],
  },
  extractionIssues: [{ stage: privateUrl, reason: `Failed at ${privateUrl}` }],
} as AnalysisResult

describe('buildAnalysisArtifacts', () => {
  it('builds one deterministic and privacy-safe artifact bundle for every entry point', () => {
    const artifacts = buildAnalysisArtifacts(result, { sourceUrl: privateUrl, language: 'en' })

    expect(artifacts.cssVariables).toContain('--color-primary: #2563eb')
    expect(artifacts.tailwindTheme).toContain('--color-primary: #2563eb')
    expect(artifacts.designDoc).toContain('# Design System')
    expect(artifacts.dtcgJson).toContain('design-tokens.github.io')
    expect(artifacts.evidenceJson).not.toContain('secret')
    expect(artifacts.profileJson).not.toContain('secret')
    expect(artifacts.finalUrl).toBe('https://example.com/products')
    expect(artifacts.pageCoverage.pages[0].url).toBe('https://example.com/products')
    expect(artifacts.extractionIssues[0]).toEqual({
      stage: privateUrl,
      reason: 'Failed at https://example.com/products',
    })
  })
})
