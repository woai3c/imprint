import { describe, expect, test } from 'vitest'

import { buildEnhancementPrompt, parseEnhancementResponse } from '../../src/core/analyzer/llm-enhancer.js'
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

describe('LLM enhancement protocol', () => {
  test('requests only structured color rename proposals', () => {
    const prompt = buildEnhancementPrompt(createTokens(), 'https://example.com')

    expect(prompt).toContain('"renames"')
    expect(prompt).toContain('"tokenId"')
    expect(prompt).not.toContain('designSummary')
    expect(prompt).not.toContain('designIntent')
    expect(prompt).not.toContain('featureTags')
  })

  test('parses wrapped rename output from an Agent CLI', () => {
    const response = JSON.stringify({
      type: 'result',
      result: JSON.stringify({
        renames: [{ tokenId: 'primary', name: 'action-brand' }],
      }),
    })

    expect(parseEnhancementResponse(response)).toEqual({
      renames: [{ tokenId: 'primary', name: 'action-brand' }],
    })
  })

  test('normalizes the previous colorNames shape for compatibility', () => {
    expect(parseEnhancementResponse('{"colorNames":{"primary":"action-brand"}}')).toEqual({
      renames: [{ tokenId: 'primary', name: 'action-brand' }],
    })
  })

  test('rejects output that only contains unused narrative fields', () => {
    expect(parseEnhancementResponse('{"designSummary":"generic summary","featureTags":["modern"]}')).toBeNull()
  })
})
