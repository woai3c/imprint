import { describe, expect, test } from 'vitest'

import {
  applyColorRenamesToExamples,
  buildExamplePrompt,
  parseExampleResponse,
} from '../../src/core/analyzer/example-generator.js'
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

describe('Example generation protocol', () => {
  test('requests compact examples built on the available CSS variables', () => {
    const prompt = buildExamplePrompt(createTokens(), 'https://example.com', {
      featureTags: ['minimal palette'],
      language: 'zh-CN',
    })

    expect(prompt).toContain('"examples"')
    expect(prompt).toContain('--color-primary')
    expect(prompt).toContain('minimal palette')
    expect(prompt).toContain('Simplified Chinese')
    expect(prompt).not.toContain('"renames"')
    expect(prompt).not.toContain('designSummary')
    expect(prompt).not.toContain('designIntent')
  })

  test('accepts safe AI examples and rejects executable or externally loaded HTML', () => {
    const response = JSON.stringify({
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

    expect(parseExampleResponse(response)).toEqual([
      {
        title: 'Action card',
        html: '<article style="color: var(--color-background)"><button>Continue</button></article>',
      },
    ])
  })

  test('parses examples wrapped in an Agent CLI envelope', () => {
    const response = JSON.stringify({
      type: 'result',
      result: JSON.stringify({
        examples: [{ title: 'Card', html: '<article style="color: var(--color-primary)">Card</article>' }],
      }),
    })

    expect(parseExampleResponse(response)).toEqual([
      { title: 'Card', html: '<article style="color: var(--color-primary)">Card</article>' },
    ])
  })

  test('returns an empty list for unrelated output', () => {
    expect(parseExampleResponse('{"designSummary":"generic summary"}')).toEqual([])
  })

  test('updates color variable references after accepted semantic renames', () => {
    expect(
      applyColorRenamesToExamples(
        [{ title: 'Card', html: '<article style="background: var(--color-primary)">Card</article>' }],
        [{ tokenId: 'primary', name: 'action-brand' }],
      ),
    ).toEqual([{ title: 'Card', html: '<article style="background: var(--color-action-brand)">Card</article>' }])
  })
})
