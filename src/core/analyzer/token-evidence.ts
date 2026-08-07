import { normalizeColorValue } from './color-cluster.js'
import type { DesignToken, ExtractedStyles, TokenConfidence, TokenEvidence } from './types.js'

export interface TokenEvidenceCapture {
  url: string
  viewport: string
  styles: ExtractedStyles
}

interface TokenEntry {
  path: string
  value: string
  categories: string[]
}

const COLOR_CATEGORIES = [
  'primaryActionColor',
  'actionColor',
  'brandTokenColor',
  'selectedColor',
  'accentColor',
  'linkColor',
  'declaredColor',
  'bgArea',
  'bgColor',
  'textColor',
  'structuralBorderColor',
  'borderColor',
]

function tokenEntries(tokens: DesignToken): TokenEntry[] {
  const entries: TokenEntry[] = []
  for (const [name, value] of Object.entries(tokens.colors)) {
    const categories = name === 'primary' || name === 'accent' ? COLOR_CATEGORIES : colorRoleCategories(name)
    entries.push({ path: `colors.${name}`, value, categories })
  }
  const typographyCategories: Record<keyof DesignToken['typography'], string[]> = {
    fontFamilies: ['fontTextFamily', 'fontFamily'],
    fontStacks: ['fontTextFamily', 'fontFamily'],
    fontSizes: ['fontSize'],
    fontWeights: ['fontWeight'],
    lineHeights: ['typeMetric', 'lineHeight'],
    letterSpacings: ['letterSpacing'],
  }
  for (const [group, values] of Object.entries(tokens.typography) as Array<
    [keyof DesignToken['typography'], string[]]
  >) {
    values.forEach((value, index) => {
      entries.push({ path: `typography.${group}.${index}`, value, categories: typographyCategories[group] })
    })
  }
  const arrayGroups: Array<
    [keyof Pick<DesignToken, 'spacing' | 'radii' | 'shadows' | 'borders' | 'zIndices' | 'transitions'>, string]
  > = [
    ['spacing', 'spacing'],
    ['radii', 'radius'],
    ['shadows', 'shadow'],
    ['borders', 'border'],
    ['zIndices', 'zIndex'],
    ['transitions', 'transition'],
  ]
  for (const [group, category] of arrayGroups) {
    tokens[group].forEach((value, index) => entries.push({ path: `${group}.${index}`, value, categories: [category] }))
  }
  return entries
}

function colorRoleCategories(name: string): string[] {
  if (name === 'background' || name === 'surface' || name === 'secondary') {
    return ['bgArea', 'bgColor', 'declaredColor']
  }
  if (name === 'foreground' || name === 'muted-foreground') return ['textColor', 'declaredColor']
  if (name.startsWith('border')) return ['structuralBorderColor', 'borderColor', 'declaredColor']
  return COLOR_CATEGORIES
}

function normalizedFont(value: string): string {
  return value.replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function cssPixels(value: string): number | null {
  const match = value.trim().match(/^(-?\d*\.?\d+)(px|rem)$/i)
  if (!match) return null
  const numeric = Number.parseFloat(match[1])
  return match[2].toLowerCase() === 'rem' ? numeric * 16 : numeric
}

function valuesMatch(path: string, category: string, tokenValue: string, observedValue: string): boolean {
  if (path.startsWith('colors.')) {
    return (
      normalizeColorValue(tokenValue) !== null && normalizeColorValue(tokenValue) === normalizeColorValue(observedValue)
    )
  }
  if (path.startsWith('typography.fontFamilies.') || path.startsWith('typography.fontStacks.')) {
    const tokenFont = normalizedFont(tokenValue)
    const observedFont = normalizedFont(observedValue)
    return observedFont === tokenFont || observedFont.split(',')[0].trim() === tokenFont.split(',')[0].trim()
  }
  if (path.startsWith('typography.fontSizes.')) {
    const tokenPixels = cssPixels(tokenValue)
    const observedPixels = cssPixels(observedValue)
    return tokenPixels !== null && observedPixels !== null && Math.abs(tokenPixels - observedPixels) < 0.01
  }
  if (path.startsWith('typography.lineHeights.') && category === 'typeMetric') {
    const [fontSize, lineHeight] = observedValue.split('|').map(cssPixels)
    const ratio = fontSize && lineHeight ? lineHeight / fontSize : null
    return ratio !== null && Math.abs(ratio - Number.parseFloat(tokenValue)) < 0.001
  }
  return tokenValue.trim().toLowerCase() === observedValue.trim().toLowerCase()
}

function confidenceFor(
  pageCount: number,
  captureCount: number,
  observationCount: number,
  sources: Set<string>,
): TokenConfidence {
  let score = pageCount >= 3 ? 4 : pageCount === 2 ? 3 : pageCount === 1 ? 1 : 0
  if ([...sources].some((source) => source.startsWith('css-variable:'))) score += 2
  if (
    [...sources].some(
      (source) => source === 'element:primary-action' || source === 'element:action' || source === 'element:selected',
    )
  ) {
    score += 2
  }
  if ([...sources].some((source) => source === 'rendered:text')) score += 1
  if (observationCount >= 10) score += 2
  else if (observationCount >= 2) score += 1
  if (captureCount >= 2) score += 1
  return score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low'
}

function evidencePageUrl(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return value.split(/[?#]/, 1)[0]
  }
}

export function buildTokenEvidence(
  tokens: DesignToken,
  captures: TokenEvidenceCapture[],
): Record<string, TokenEvidence> {
  const evidence: Record<string, TokenEvidence> = {}

  for (const entry of tokenEntries(tokens)) {
    const pages = new Set<string>()
    const sources = new Set<string>()
    let captureCount = 0
    let observationCount = 0

    for (const capture of captures) {
      let captureMatched = false
      for (const category of entry.categories) {
        const prefix = `${category}:`
        for (const [key, count] of Object.entries(capture.styles.usageCount)) {
          if (!key.startsWith(prefix) || !Number.isFinite(count) || count <= 0) continue
          const observedValue = key.slice(prefix.length)
          if (!valuesMatch(entry.path, category, entry.value, observedValue)) continue
          captureMatched = true
          observationCount += count
          sources.add(`usage:${category}`)
          for (const source of capture.styles.valueSources?.[key] || []) sources.add(source)
        }
      }
      if (captureMatched) {
        captureCount += 1
        pages.add(evidencePageUrl(capture.url))
      }
    }

    if (sources.size === 0) sources.add('derived:token-builder')
    const reasons = new Set<TokenEvidence['reasons'][number]>()
    if (pages.size >= 2) reasons.add('cross-page')
    if ([...sources].some((source) => source.startsWith('css-variable:'))) reasons.add('declared-token')
    if ([...sources].some((source) => source.startsWith('element:'))) reasons.add('interactive-use')
    if (sources.has('rendered:text')) reasons.add('rendered-use')
    if ([...sources].some((source) => source.startsWith('computed:') || source.startsWith('usage:'))) {
      reasons.add('computed-style')
    }

    evidence[entry.path] = {
      value: entry.value,
      confidence: confidenceFor(pages.size, captureCount, observationCount, sources),
      observationCount: Number(observationCount.toFixed(3)),
      pageCount: pages.size,
      captureCount,
      pages: [...pages].slice(0, 8),
      sources: [...sources].slice(0, 12),
      reasons: [...reasons],
    }
  }

  return evidence
}
