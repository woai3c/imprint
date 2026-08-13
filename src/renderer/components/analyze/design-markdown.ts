export interface DesignMarkdownParts {
  frontmatter?: string
  body: string
}

export function splitDesignMarkdown(content: string): DesignMarkdownParts {
  const source = content.startsWith('\uFEFF') ? content.slice(1) : content
  const opening = /^---[ \t]*\r?\n/.exec(source)
  if (!opening) return { body: content }

  const closing = /^---[ \t]*\r?$/gm
  closing.lastIndex = opening[0].length
  const match = closing.exec(source)
  if (!match) return { body: content }

  let bodyStart = match.index + match[0].length
  if (source.slice(bodyStart, bodyStart + 2) === '\r\n') bodyStart += 2
  else if (source[bodyStart] === '\n') bodyStart += 1

  return {
    frontmatter: source.slice(opening[0].length, match.index).replace(/\r?\n$/, ''),
    body: source.slice(bodyStart),
  }
}
