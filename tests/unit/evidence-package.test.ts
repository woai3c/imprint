import { describe, expect, test } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'
import { selectEvidencePackage } from '../../src/core/design-intelligence/evidence-selector.js'

const tokens: DesignToken = {
  colors: { primary: '#6b1eb9' },
  typography: {
    fontFamilies: [],
    fontStacks: [],
    fontSizes: [],
    fontWeights: [],
    lineHeights: [],
    letterSpacings: [],
  },
  spacing: [],
  radii: [],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: [],
}

function makeEvidence(): DesignEvidence {
  return {
    schemaVersion: '1',
    analysisId: 'analysis-test',
    source: {
      requestedUrl: 'https://example.com',
      finalUrl: 'https://example.com/',
      accessMode: 'anonymous',
    },
    pages: [{ id: 'page-a', url: 'https://example.com/', viewport: 'desktop', role: 'landing', images: [] }],
    tokens,
    featureTags: [],
    topology: {
      schemaVersion: '1',
      pages: [{ pageId: 'page-a', role: 'landing', sectionIds: ['section-a'] }],
      globalLayers: [],
      crossPagePatternIds: [],
    },
    sections: [
      {
        id: 'section-a',
        pageId: 'page-a',
        order: 0,
        role: 'header',
        rect: { x: 0, y: 0, width: 1, height: 0.03 },
        layoutMode: 'flow',
        tokenRefs: [],
        componentRefs: [],
        interactionRefs: [],
        mediaLayerRefs: [],
        evidenceRefs: [],
      },
    ],
    components: [],
    layoutNodes: [],
    interactionStyles: { hover: [], focus: [], active: [] },
    interactionObservations: [
      {
        id: 'interaction-a',
        pageId: 'page-a',
        sectionId: 'section-a',
        targetId: 'target-1',
        driver: 'hover',
        safety: 'passive',
        trigger: { kind: 'css-pseudo' },
        before: {
          color: '#ffffff',
          'background-color': '#16171d',
          'box-shadow': `0 0 0 1px ${'rgba(0,0,0,0.123456) '.repeat(12)}`,
        },
        after: {
          color: '#b39aff',
          'background-color': '#16171d',
          'box-shadow': `0 0 0 2px ${'rgba(0,0,0,0.123456) '.repeat(12)}`,
        },
        changedProperties: ['color', 'background-color', 'box-shadow', 'outline-color'],
        evidenceRefs: [],
      },
    ],
    breakpoints: [],
    responsiveObservations: [],
    motion: [],
    mediaLayers: [],
    coverage: {
      pageCoverage: 'complete',
      sectionCoverage: 1,
      viewportCoverage: ['desktop'],
      interactionCoverage: { candidates: 1, safelyObserved: 0, skipped: 0 },
      mediaCoverage: { majorRegions: 0, classifiedRegions: 0 },
      accessRestrictions: [],
      limitations: [],
    },
    limitations: [],
  }
}

describe('selectEvidencePackage packaging', () => {
  test('replaces section rects with coarse approximate bounds', () => {
    const selected = selectEvidencePackage(makeEvidence(), 'structural-only')
    const section = selected.evidence.sections[0]

    expect('rect' in section).toBe(false)
    expect(section.approxBounds).toEqual({
      widthShare: 'full',
      heightShare: 'strip',
      anchor: 'full',
      vertical: 'top',
    })
  })

  test('distills interaction before/after into short from/to pairs', () => {
    const selected = selectEvidencePackage(makeEvidence(), 'structural-only')
    const observation = selected.evidence.interactionObservations[0]

    expect('before' in observation).toBe(false)
    expect('after' in observation).toBe(false)
    // color changed and is short; background-color identical and box-shadow values are too long;
    // outline-color has no recorded before/after values.
    expect(observation.changes).toEqual([{ property: 'color', from: '#ffffff', to: '#b39aff' }])
    expect(observation.changedProperties).toContain('box-shadow')
  })
})
