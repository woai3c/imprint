import { describe, expect, test } from 'vitest'

import { buildTokenEvidence } from '../../src/core/analyzer/token-evidence.js'
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

function observedStyles() {
  return createExtractedStyles({
    usageCount: {
      'actionColor:rgb(23, 114, 246)': 4,
      'brandTokenColor:rgb(23, 114, 246)': 1,
      'fontTextFamily:Inter, sans-serif': 120,
      'fontSize:16px': 20,
      'fontWeight:400': 20,
      'typeMetric:16px|24px': 20,
      'spacing:16px': 8,
    },
    valueSources: {
      'brandTokenColor:rgb(23, 114, 246)': ['css-variable:--brand-primary'],
      'actionColor:rgb(23, 114, 246)': ['element:action'],
      'fontTextFamily:Inter, sans-serif': ['rendered:text'],
    },
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

  test('preserves token evidence in structured and human-readable exports', () => {
    const evidence = buildTokenEvidence(tokens, [
      { url: 'https://example.com/?session=secret', viewport: 'desktop', styles: observedStyles() },
    ])
    const evidencedTokens = { ...tokens, evidence }
    const dtcg = JSON.parse(generateDtcgJson(evidencedTokens)) as {
      $extensions: Record<string, Record<string, unknown>>
    }
    const designDoc = generateDesignDoc(evidencedTokens, 'https://example.com/')

    expect(dtcg.$extensions['com.imprint.tokenEvidence']['colors.primary']).toBeDefined()
    expect(designDoc).toContain('## Extraction Confidence')
    expect(evidence['colors.primary'].pages[0]).toBe('https://example.com/')
  })
})
