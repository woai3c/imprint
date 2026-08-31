import { normalizeColorValue } from './color-cluster.js'
import type { DesignToken, ExtractedStyles, TokenConfidence, TokenEvidence, TokenReuseScope } from './types.js'

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
  'destructiveActionBackgroundColor',
  'destructiveActionForegroundColor',
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
  if (path.startsWith('spacing.') || path.startsWith('radii.')) {
    const tokenPixels = cssPixels(tokenValue)
    const observedPixels = cssPixels(observedValue)
    return tokenPixels !== null && observedPixels !== null && Math.abs(tokenPixels - observedPixels) <= 0.1
  }
  if (path.startsWith('typography.lineHeights.') && category === 'typeMetric') {
    const [fontSize, lineHeight] = observedValue.split('|').map(cssPixels)
    const ratio = fontSize && lineHeight ? lineHeight / fontSize : null
    return ratio !== null && Math.abs(ratio - Number.parseFloat(tokenValue)) < 0.001
  }
  return tokenValue.trim().toLowerCase() === observedValue.trim().toLowerCase()
}

export function measurementConfidenceFor(
  pageCount: number,
  captureCount: number,
  observationCount: number,
  sources: ReadonlySet<string>,
): TokenConfidence {
  let score = pageCount >= 3 ? 4 : pageCount === 2 ? 3 : pageCount === 1 ? 1 : 0
  if ([...sources].some((source) => source.startsWith('css-variable:'))) score += 2
  if (
    [...sources].some(
      (source) =>
        source === 'element:primary-action' ||
        source === 'element:action' ||
        source === 'element:destructive-action' ||
        source === 'element:selected',
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

function observationCountForEntry(path: string, counts: ReadonlyMap<string, number>): number {
  if (!path.startsWith('colors.')) return [...counts.values()].reduce((total, count) => total + count, 0)
  const count = (category: string) => counts.get(category) || 0
  const declaredFallback = () => Math.max(count('declaredColor'), count('brandTokenColor'))
  if (path.startsWith('colors.border')) {
    return count('borderColor') || count('structuralBorderColor') || declaredFallback()
  }
  if (/^colors\.(?:background|surface|secondary)$/.test(path)) return count('bgColor') || declaredFallback()
  if (/^colors\.(?:foreground|muted-foreground)$/.test(path)) return count('textColor') || declaredFallback()

  // Semantic color categories annotate the same computed property observations
  // that bgColor/textColor/borderColor already count. Prefer those mutually
  // exclusive base properties and use role/declaration categories as fallbacks.
  const baseRendered = count('bgColor') + count('textColor') + count('borderColor')
  if (baseRendered > 0) return baseRendered
  const renderedFallback = Math.max(
    count('structuralBorderColor'),
    ...[...counts.entries()]
      .filter(([category]) => !['bgArea', 'declaredColor', 'brandTokenColor'].includes(category))
      .map(([, value]) => value),
  )
  if (renderedFallback > 0) return renderedFallback
  return Math.max(count('declaredColor'), count('brandTokenColor'))
}

const RENDERED_USAGE_SOURCES = new Set([
  'usage:primaryActionColor',
  'usage:actionColor',
  'usage:selectedColor',
  'usage:accentColor',
  'usage:linkColor',
  'usage:bgArea',
  'usage:bgColor',
  'usage:textColor',
  'usage:structuralBorderColor',
  'usage:borderColor',
  'usage:primaryActionBackgroundColor',
  'usage:primaryActionForegroundColor',
  'usage:actionBackgroundColor',
  'usage:actionForegroundColor',
  'usage:destructiveActionBackgroundColor',
  'usage:destructiveActionForegroundColor',
  'usage:statusBackgroundColor',
  'usage:statusForegroundColor',
  'usage:statusColor',
])

function evidenceSemantics(
  measurementConfidence: TokenConfidence,
  sources: ReadonlySet<string>,
  pageCount: number,
  eligiblePageCount: number,
): { confidence: TokenConfidence; reuseScope: TokenReuseScope; pageSupportRatio: number } {
  const pageSupportRatio = eligiblePageCount > 0 ? pageCount / eligiblePageCount : 0
  const declared = [...sources].some(
    (source) =>
      source.startsWith('css-variable:') || source === 'usage:declaredColor' || source === 'usage:brandTokenColor',
  )
  const rendered = [...sources].some(
    (source) => RENDERED_USAGE_SOURCES.has(source) || source === 'rendered:text' || source.startsWith('computed:'),
  )
  if (declared && !rendered) return { confidence: 'low', reuseScope: 'declared-only', pageSupportRatio }
  const componentOnly =
    [...sources].some((source) => source === 'element:control-spacing' || source.startsWith('element:')) &&
    ![...sources].some(
      (source) =>
        source === 'element:structural-spacing' ||
        source === 'element:content-spacing' ||
        source === 'rendered:text' ||
        source.startsWith('computed:'),
    )
  if (componentOnly) return { confidence: measurementConfidence, reuseScope: 'component', pageSupportRatio }
  if (eligiblePageCount >= 2 && pageSupportRatio >= 0.75 && measurementConfidence === 'high') {
    return { confidence: measurementConfidence, reuseScope: 'foundation', pageSupportRatio }
  }
  if (pageCount > 0) return { confidence: measurementConfidence, reuseScope: 'local', pageSupportRatio }
  return { confidence: 'low', reuseScope: 'unknown', pageSupportRatio }
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
  const eligiblePageCount = new Set(captures.map((capture) => evidencePageUrl(capture.url))).size

  for (const entry of tokenEntries(tokens)) {
    const pages = new Set<string>()
    const sources = new Set<string>()
    let captureCount = 0
    let observationCount = 0

    for (const capture of captures) {
      let captureMatched = false
      const matchedCounts = new Map<string, number>()
      for (const category of entry.categories) {
        const prefix = `${category}:`
        for (const [key, count] of Object.entries(capture.styles.usageCount)) {
          if (!key.startsWith(prefix) || !Number.isFinite(count) || count <= 0) continue
          const observedValue = key.slice(prefix.length)
          if (!valuesMatch(entry.path, category, entry.value, observedValue)) continue
          captureMatched = true
          matchedCounts.set(category, (matchedCounts.get(category) || 0) + count)
          sources.add(`usage:${category}`)
          for (const source of capture.styles.valueSources?.[key] || []) sources.add(source)
        }
      }
      if (captureMatched) {
        observationCount += observationCountForEntry(entry.path, matchedCounts)
        captureCount += 1
        pages.add(evidencePageUrl(capture.url))
      }
    }

    if (sources.size === 0) sources.add('derived:token-builder')
    const measurementConfidence = measurementConfidenceFor(pages.size, captureCount, observationCount, sources)
    const semantics = evidenceSemantics(measurementConfidence, sources, pages.size, eligiblePageCount)
    const reasons = new Set<TokenEvidence['reasons'][number]>()
    if (pages.size >= 2) reasons.add('cross-page')
    if ([...sources].some((source) => source.startsWith('css-variable:'))) reasons.add('declared-token')
    if (semantics.reuseScope === 'declared-only') reasons.add('declared-only')
    if ([...sources].some((source) => source.startsWith('element:'))) reasons.add('interactive-use')
    if (sources.has('rendered:text')) reasons.add('rendered-use')
    if ([...sources].some((source) => source.startsWith('computed:') || RENDERED_USAGE_SOURCES.has(source))) {
      reasons.add('computed-style')
    }

    evidence[entry.path] = {
      value: entry.value,
      confidence: semantics.confidence,
      measurementConfidence,
      semanticConfidence: semantics.confidence,
      reuseScope: semantics.reuseScope,
      observationCount: Number(observationCount.toFixed(3)),
      pageCount: pages.size,
      captureCount,
      eligiblePageCount,
      pageSupportRatio: Number(semantics.pageSupportRatio.toFixed(3)),
      pages: [...pages].slice(0, 8),
      sources: [...sources].slice(0, 12),
      reasons: [...reasons],
    }
  }

  return evidence
}
