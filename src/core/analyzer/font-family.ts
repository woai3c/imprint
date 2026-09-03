const CSS_GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'cursive',
  'fantasy',
  'monospace',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
])

export interface ParsedCssFontFamily {
  raw: string
  name: string
  quoted: boolean
  generic: boolean
}

function splitCssFontFamilyList(value: string): string[] {
  const result: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false
  for (const character of value) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === '\\') {
      current += character
      escaped = true
      continue
    }
    if (quote) {
      current += character
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      current += character
      quote = character
      continue
    }
    if (character === ',') {
      if (current.trim()) result.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  if (current.trim()) result.push(current.trim())
  return result
}

function decodeCssEscapes(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character !== '\\') {
      result += character === '\0' ? '\ufffd' : character
      continue
    }

    const next = value[index + 1]
    if (next === undefined) {
      result += '\ufffd'
      continue
    }
    if (next === '\n' || next === '\f') {
      index += 1
      continue
    }
    if (next === '\r') {
      index += value[index + 2] === '\n' ? 2 : 1
      continue
    }

    const hexMatch = /^[\da-f]{1,6}/i.exec(value.slice(index + 1))
    if (hexMatch) {
      const codePoint = Number.parseInt(hexMatch[0], 16)
      result +=
        codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? '\ufffd'
          : String.fromCodePoint(codePoint)
      index += hexMatch[0].length
      if (/\s/.test(value[index + 1] || '')) {
        if (value[index + 1] === '\r' && value[index + 2] === '\n') index += 2
        else index += 1
      }
      continue
    }

    result += next
    index += 1
  }
  return result
}

function unquotedFamilyName(raw: string): { name: string; quoted: boolean } {
  const first = raw[0]
  const quoted = (first === '"' || first === "'") && raw.at(-1) === first
  const name = decodeCssEscapes(quoted ? raw.slice(1, -1) : raw)
  return { name: name.replace(/\s+/g, ' ').trim(), quoted }
}

export function parseCssFontFamilyList(value: string): ParsedCssFontFamily[] {
  return splitCssFontFamilyList(value).map((raw) => {
    const { name, quoted } = unquotedFamilyName(raw)
    const normalized = name.toLowerCase()
    return {
      raw,
      name,
      quoted,
      generic: !quoted && CSS_GENERIC_FONT_FAMILIES.has(normalized),
    }
  })
}

function normalizedFamily(family: ParsedCssFontFamily): string {
  const kind = family.generic ? 'generic' : 'family'
  return `${kind}:${family.name.toLowerCase()}`
}

/** Canonical exact CSS list identity. Quoted commas remain inside one family and quoted generic words stay custom. */
export function normalizeCssFontFamilyList(value: string): string {
  return parseCssFontFamilyList(value).map(normalizedFamily).join('|')
}

/** Canonical identity for one primary family, independent of harmless quote style around non-generic family names. */
export function normalizeCssFontFamilyName(value: string): string {
  const family = parseCssFontFamilyList(value)[0]
  return family ? normalizedFamily(family) : ''
}

/** Returns the first family as an atomic value while retaining quotes needed to protect embedded commas. */
export function primaryCssFontFamily(value: string): string {
  return parseCssFontFamilyList(value)[0]?.raw || ''
}

export function cssGenericFontFamilies(value: string): string[] {
  return parseCssFontFamilyList(value)
    .filter((family) => family.generic)
    .map((family) => family.name.toLowerCase())
}
