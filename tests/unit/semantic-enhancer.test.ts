import { describe, expect, test } from 'vitest'

import { buildSemanticNamingPrompt, parseSemanticNamingResponse } from '../../src/core/analyzer/semantic-enhancer.js'
import type { DesignToken } from '../../src/core/analyzer/types.js'

function createTokens(): DesignToken {
  return {
    colors: {
      background: '#ffffff',
      primary: '#2563eb',
    },
    typography: {
      fontFamilies: ['Inter'],
      fontStacks: ['Inter, sans-serif'],
      fontSizes: ['1rem'],
      fontWeights: ['400'],
      lineHeights: ['1.5'],
      letterSpacings: [],
    },
    spacing: [],
    radii: [],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
  }
}

describe('Semantic naming protocol', () => {
  test('requests structured renames only from extracted evidence', () => {
    const prompt = buildSemanticNamingPrompt(createTokens(), 'https://example.com', {
      featureTags: ['minimal palette'],
      language: 'zh-CN',
    })

    expect(prompt).toContain('"renames"')
    expect(prompt).toContain('"tokenId"')
    expect(prompt).toContain('primary: #2563eb')
    expect(prompt).toContain('minimal palette')
    expect(prompt).toContain('Simplified Chinese')
    expect(prompt).not.toContain('"examples"')
    expect(prompt).not.toContain('designSummary')
    expect(prompt).not.toContain('designIntent')
  })

  test('parses wrapped rename output from an Agent CLI', () => {
    const response = JSON.stringify({
      type: 'result',
      result: JSON.stringify({
        renames: [{ tokenId: 'primary', name: 'action-brand' }],
      }),
    })

    expect(parseSemanticNamingResponse(response)).toEqual([{ tokenId: 'primary', name: 'action-brand' }])
  })

  test('normalizes the previous colorNames shape for compatibility', () => {
    expect(parseSemanticNamingResponse('{"colorNames":{"primary":"action-brand"}}')).toEqual([
      { tokenId: 'primary', name: 'action-brand' },
    ])
  })

  test('returns an empty list for narrative-only or unrelated output', () => {
    expect(parseSemanticNamingResponse('{"designSummary":"generic summary","featureTags":["modern"]}')).toEqual([])
    expect(parseSemanticNamingResponse('no json here')).toEqual([])
  })
})
