import { describe, expect, test } from 'vitest'

import type { DesignToken, GeneratedExampleComponent } from '../../src/core/analyzer/types.js'
import { generateDesignDoc } from '../../src/core/export/index.js'
import { parseExampleComponents } from '../../src/renderer/components/analyze/ExampleComponents.js'

const tokens: DesignToken = {
  colors: {
    background: '#faf7f2',
    foreground: '#1d2531',
    primary: '#d83425',
  },
  typography: {
    fontFamilies: ['Inter'],
    fontStacks: ['Inter, sans-serif'],
    fontSizes: ['0.875rem', '1rem', '1.5rem'],
    fontWeights: ['400', '600'],
    lineHeights: ['1.5'],
    letterSpacings: [],
  },
  spacing: ['4px', '8px', '16px'],
  radii: ['4px', '10px'],
  shadows: [],
  borders: [],
  zIndices: [],
  transitions: [],
}

const aiExamples: GeneratedExampleComponent[] = [
  {
    title: 'AI Card',
    html: '<article style="background: var(--color-background); color: var(--color-foreground)">Card</article>',
  },
]

describe('example component previews', () => {
  test('omits example HTML when no AI examples are available', () => {
    const designDoc = generateDesignDoc(tokens)

    expect(designDoc).not.toContain('## Example Components')
    expect(designDoc).not.toContain('```html')
    expect(parseExampleComponents(designDoc)).toEqual([])
  })

  test.each([
    ['en', 'Example Components'],
    ['zh-CN', '示例组件'],
  ] as const)('formats and parses validated %s AI examples', (language, sectionTitle) => {
    const designDoc = generateDesignDoc(
      tokens,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      language,
      aiExamples,
    )
    const examples = parseExampleComponents(designDoc)

    expect(designDoc).toContain(`## ${sectionTitle}`)
    expect(examples).toEqual(aiExamples)
  })
})
