import { describe, expect, test } from 'vitest'

import {
  buildExamplePrompt,
  completeExampleGeneration,
  createExampleValidationContext,
  deriveSourceIdentity,
  parseExampleResponse,
  parseExampleResponseDetailed,
  validateExampleHtml,
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

  test('rejects protocol-relative and CSS image resource loading', () => {
    expect(
      parseExampleResponse(
        JSON.stringify({
          examples: [
            {
              title: 'Remote background',
              html: '<article style="background-image:image-set(\'//tracker.test/a.png\' 1x)">Card</article>',
            },
            {
              title: 'Legacy background',
              html: '<table background="//tracker.test/a.png"><tr><td>Card</td></tr></table>',
            },
          ],
        }),
      ),
    ).toEqual([])
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
})

describe('Example source-identity and style validation', () => {
  const tokens = createTokens()
  const context = createExampleValidationContext(tokens, 'https://www.zhihu.com')

  test('derives the source identity from the hostname without www or TLD', () => {
    expect(deriveSourceIdentity('https://www.zhihu.com')).toBe('zhihu')
    expect(deriveSourceIdentity('https://vite.dev/guide')).toBe('vite')
    expect(deriveSourceIdentity('not a url')).toBeUndefined()
  })

  test('rejects examples that mention the source brand in visible text', () => {
    const violations = validateExampleHtml(
      'Hot questions',
      '<article style="color: var(--color-primary)">zhihu 热榜</article>',
      context,
    )
    expect(violations).toContain('source-identity')
    expect(
      validateExampleHtml('Zhihu daily', '<article style="color: var(--color-primary)">Feed</article>', context),
    ).toContain('source-identity')
  })

  test('rejects ICP filing and license text', () => {
    expect(
      validateExampleHtml('Footer', '<footer style="color: var(--color-primary)">京ICP证030173号</footer>', context),
    ).toContain('legal-identity')
    expect(
      validateExampleHtml('Footer', '<footer style="color: var(--color-primary)">ICP license 123</footer>', context),
    ).toContain('legal-identity')
  })

  test('rejects literal colors and unknown CSS variables in inline styles', () => {
    expect(validateExampleHtml('Card', '<article style="color: #ffffff">Card</article>', context)).toContain(
      'literal-color',
    )
    expect(validateExampleHtml('Card', '<article style="color: rgb(255, 255, 255)">Card</article>', context)).toContain(
      'literal-color',
    )
    expect(validateExampleHtml('Card', '<article style="background: white">Card</article>', context)).toContain(
      'literal-color',
    )
    expect(
      validateExampleHtml('Card', '<article style="color: var(--color-brand-blue)">Card</article>', context),
    ).toContain('unknown-variable')
  })

  test('accepts token-only examples with neutral copy', () => {
    const violations = validateExampleHtml(
      'Analytics overview',
      '<article style="background: var(--color-background); color: var(--color-primary)"><h2>Weekly report</h2><button style="color: inherit">Open</button></article>',
      context,
    )
    expect(violations).toEqual([])
  })

  test('parseExampleResponse filters rejected examples and reports violations', () => {
    const response = JSON.stringify({
      examples: [
        {
          title: 'Neutral card',
          html: '<article style="color: var(--color-primary)">Project status</article>',
        },
        {
          title: 'Leaked brand',
          html: '<article style="color: var(--color-primary)">zhihu trending</article>',
        },
        {
          title: 'Hardcoded color',
          html: '<article style="color: #fff">Card</article>',
        },
      ],
    })

    const result = parseExampleResponseDetailed(response, context)
    expect(result.examples).toEqual([
      {
        title: 'Neutral card',
        html: '<article style="color: var(--color-primary)">Project status</article>',
      },
    ])
    expect(result.rejections).toEqual([
      { title: 'Example 2', violations: ['source-identity', 'unapproved-copy'] },
      { title: 'Example 3', violations: ['unapproved-copy', 'literal-color'] },
    ])
  })

  test('rejects localized source copy, CSS variable fallbacks, and unquoted literal styles', () => {
    const zhContext = createExampleValidationContext(tokens, 'https://www.zhihu.com', 'zh-CN')
    expect(
      validateExampleHtml('数据概览', '<article style="color: var(--color-primary)">知乎热榜</article>', zhContext),
    ).toContain('unapproved-copy')
    expect(
      validateExampleHtml(
        '数据概览',
        '<article aria-label="&#x77e5;&#x4e4e;" style="color: var(--color-primary)">项目状态</article>',
        zhContext,
      ),
    ).toContain('unapproved-copy')
    expect(
      validateExampleHtml('Neutral card', '<article style="color: var(--color-primary, #fff)">Card</article>', context),
    ).toEqual(expect.arrayContaining(['literal-color', 'variable-fallback']))
    expect(validateExampleHtml('Neutral card', '<article style=color:#fff>Card</article>', context)).toContain(
      'literal-color',
    )
  })

  test('does not mistake CSS property names for named colors', () => {
    expect(
      validateExampleHtml(
        'Neutral card',
        '<article style="white-space: nowrap; color: var(--color-primary)">Card</article>',
        context,
      ),
    ).toEqual([])
  })

  test('repairs a rejected response once and returns only validated examples', async () => {
    let repairs = 0
    const result = await completeExampleGeneration(
      JSON.stringify({ examples: [{ title: 'Neutral card', html: '<article style="color:#fff">Card</article>' }] }),
      context,
      'en',
      async () => {
        repairs += 1
        return JSON.stringify({
          examples: [
            {
              title: 'Neutral card',
              html: '<article style="color:var(--color-primary)">Card</article>',
            },
          ],
        })
      },
    )
    expect(repairs).toBe(1)
    expect(result.status).toBe('complete')
    expect(result.examples).toHaveLength(1)
  })

  test('prompt forbids source identity, copied content, and literal colors', () => {
    const prompt = buildExamplePrompt(tokens, 'https://www.zhihu.com', { language: 'en' })
    expect(prompt).toContain('"zhihu"')
    expect(prompt).toContain('NEVER write literal colors')
    expect(prompt).toContain('ICP')
    expect(prompt).not.toContain('MUST look like they belong on')
  })
})
