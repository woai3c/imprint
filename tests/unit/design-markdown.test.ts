import { describe, expect, test } from 'vitest'

import { splitDesignMarkdown } from '../../src/renderer/components/analyze/design-markdown.js'

describe('DESIGN.md preview parsing', () => {
  test('separates YAML frontmatter from the Markdown body', () => {
    const result = splitDesignMarkdown('---\nversion: alpha\nname: Example\n---\n# Design System\n\nUseful body.')

    expect(result).toEqual({
      frontmatter: 'version: alpha\nname: Example',
      body: '# Design System\n\nUseful body.',
    })
  })

  test('supports a BOM and CRLF without exposing them in the preview', () => {
    const result = splitDesignMarkdown('\uFEFF---\r\nversion: alpha\r\n---\r\n# Body')

    expect(result).toEqual({ frontmatter: 'version: alpha', body: '# Body' })
  })

  test('does not treat a later thematic break as frontmatter', () => {
    const content = '# Body\n\n---\n\nMore content'

    expect(splitDesignMarkdown(content)).toEqual({ body: content })
  })

  test('leaves malformed frontmatter untouched', () => {
    const content = '---\nversion: alpha\n# Missing closing delimiter'

    expect(splitDesignMarkdown(content)).toEqual({ body: content })
  })
})
