import { describe, expect, test } from 'vitest'

import {
  applyColorRenamesToExamples,
  buildEnhancementPrompt,
  parseEnhancementResponse,
} from '../../src/core/analyzer/llm-enhancer.js'
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
  test('requests structured renames and compact examples from extracted evidence', () => {
    const prompt = buildEnhancementPrompt(createTokens(), 'https://example.com', {
      featureTags: ['minimal palette'],
      language: 'zh-CN',
    })

    expect(prompt).toContain('"renames"')
    expect(prompt).toContain('"tokenId"')
    expect(prompt).toContain('"examples"')
    expect(prompt).toContain('minimal palette')
    expect(prompt).toContain('Simplified Chinese')
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

    expect(parseEnhancementResponse(response)).toEqual({
      renames: [{ tokenId: 'primary', name: 'action-brand' }],
      examples: [],
    })
  })

  test('normalizes the previous colorNames shape for compatibility', () => {
    expect(parseEnhancementResponse('{"colorNames":{"primary":"action-brand"}}')).toEqual({
      renames: [{ tokenId: 'primary', name: 'action-brand' }],
      examples: [],
    })
  })

  test('accepts safe AI examples and rejects executable or externally loaded HTML', () => {
    const response = JSON.stringify({
      renames: [],
      examples: [
        {
          title: 'Action card',
          html: '<article style="color: var(--color-background)"><button>Continue</button></article>',
        },
        {
          title: 'Unsafe script',
          html: '<button onclick="alert(1)">Run</button>',
        },
        {
          title: 'External image',
          html: '<img src="https://example.com/tracker.png">',
        },
      ],
    })

    expect(parseEnhancementResponse(response)).toEqual({
      renames: [],
      examples: [
        {
          title: 'Action card',
          html: '<article style="color: var(--color-background)"><button>Continue</button></article>',
        },
      ],
    })
  })

  test('updates color variable references after accepted semantic renames', () => {
    expect(
      applyColorRenamesToExamples(
        [{ title: 'Card', html: '<article style="background: var(--color-primary)">Card</article>' }],
        [{ tokenId: 'primary', name: 'action-brand' }],
      ),
    ).toEqual([{ title: 'Card', html: '<article style="background: var(--color-action-brand)">Card</article>' }])
  })

  test('rejects output that only contains unused narrative fields', () => {
    expect(parseEnhancementResponse('{"designSummary":"generic summary","featureTags":["modern"]}')).toBeNull()
  })
})
