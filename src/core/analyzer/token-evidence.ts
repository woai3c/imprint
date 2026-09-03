import { normalizeColorValue } from './color-cluster.js'
import {
  buildForegroundPairEvidence,
  buildFoundationForegroundPairEvidence,
  isFoundationForegroundPair,
  isPrimaryForegroundPair,
} from './color-pair-evidence.js'
import { normalizeCssFontFamilyList, normalizeCssFontFamilyName, primaryCssFontFamily } from './font-family.js'
import { type CanonicalTokenEntry, buildCanonicalTokenCatalog } from './token-catalog.js'
import type {
  DesignToken,
  ExtractedStyles,
  PairedSurfaceEvidence,
  TokenConfidence,
  TokenEvidence,
  TokenReuseScope,
} from './types.js'
import { opaqueRouteIdentity } from './url-identity.js'
import { pageIdentityUrl } from './url-identity.js'

export interface TokenEvidenceCapture {
  /** Internal transaction identity used to bind styles to the exact committed page capture. */
  captureKey?: string
  url: string
  viewport: string
  styles: ExtractedStyles
}

const COLOR_CATEGORIES = [
  'primaryActionColor',
  'primaryActionBackgroundColor',
  'primaryActionForegroundColor',
  'actionColor',
  'actionBackgroundColor',
  'actionForegroundColor',
  'destructiveActionBackgroundColor',
  'destructiveActionForegroundColor',
  'statusBackgroundColor',
  'statusForegroundColor',
  'statusColor',
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
] as const

function categoriesForEntry(entry: CanonicalTokenEntry): string[] {
  if (entry.group === 'colors') {
    // Semantic agreement is a competition across every observed use of the exact value. Restricting collection to
    // the proposed role makes aliases such as bgColor + statusBackgroundColor look perfectly unambiguous.
    return [...COLOR_CATEGORIES]
  }
  const categories: Record<Exclude<CanonicalTokenEntry['group'], 'colors'>, string[]> = {
    'typography.fontFamilies': ['fontTextFamily', 'fontFamily'],
    'typography.fontStacks': ['fontTextFamily', 'fontFamily'],
    'typography.fontSizes': ['fontSize'],
    'typography.fontWeights': ['fontWeight'],
    'typography.lineHeights': ['typeMetric', 'lineHeight'],
    'typography.letterSpacings': ['letterSpacing'],
    spacing: ['spacing'],
    radii: ['radius'],
    shadows: ['shadow'],
    borders: ['border'],
    zIndices: ['zIndex'],
    transitions: ['transition'],
  }
  return categories[entry.group]
}

function cssPixels(value: string): number | null {
  const match = value.trim().match(/^(-?\d*\.?\d+)(px|rem)$/i)
  if (!match) return null
  const numeric = Number.parseFloat(match[1])
  return match[2].toLowerCase() === 'rem' ? numeric * 16 : numeric
}

function valuesMatch(entry: CanonicalTokenEntry, category: string, observedValue: string): boolean {
  if (entry.group === 'colors') {
    return (
      normalizeColorValue(entry.value) !== null &&
      normalizeColorValue(entry.value) === normalizeColorValue(observedValue)
    )
  }
  if (entry.group === 'typography.fontStacks') {
    return normalizeCssFontFamilyList(observedValue) === normalizeCssFontFamilyList(entry.value)
  }
  if (entry.group === 'typography.fontFamilies') {
    return normalizeCssFontFamilyName(primaryCssFontFamily(observedValue)) === normalizeCssFontFamilyName(entry.value)
  }
  if (entry.group === 'typography.fontSizes') {
    const tokenPixels = cssPixels(entry.value)
    const observedPixels = cssPixels(observedValue)
    return tokenPixels !== null && observedPixels !== null && Math.abs(tokenPixels - observedPixels) < 0.01
  }
  if (entry.group === 'spacing' || entry.group === 'radii') {
    const tokenPixels = cssPixels(entry.value)
    const observedPixels = cssPixels(observedValue)
    return tokenPixels !== null && observedPixels !== null && Math.abs(tokenPixels - observedPixels) <= 0.1
  }
  if (entry.group === 'typography.lineHeights' && category === 'typeMetric') {
    const [fontSize, lineHeight] = observedValue.split('|').map(cssPixels)
    const ratio = fontSize && lineHeight ? lineHeight / fontSize : null
    return ratio !== null && Math.abs(ratio - Number.parseFloat(entry.value)) < 0.001
  }
  return entry.value.trim().toLowerCase() === observedValue.trim().toLowerCase()
}

export function measurementConfidenceFor(
  pageCount: number,
  _captureCount: number,
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
  // Capture count is coverage, not independent support. A second viewport of one URL must not raise confidence.
  return score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low'
}

function count(counts: ReadonlyMap<string, number>, category: string): number {
  return counts.get(category) || 0
}

function observationCountForEntry(entry: CanonicalTokenEntry, counts: ReadonlyMap<string, number>): number {
  if (entry.group !== 'colors') return Math.max(0, ...counts.values())
  const declaredFallback = () => Math.max(count(counts, 'declaredColor'), count(counts, 'brandTokenColor'))
  if ((entry.role || '').startsWith('border')) {
    return count(counts, 'borderColor') || count(counts, 'structuralBorderColor') || declaredFallback()
  }
  if (['background', 'surface', 'secondary'].includes(entry.role || '')) {
    return count(counts, 'bgColor') || declaredFallback()
  }
  if (['foreground', 'muted-foreground'].includes(entry.role || '')) {
    return count(counts, 'textColor') || declaredFallback()
  }
  if (['primary', 'danger', 'accent', 'editorial-accent', 'decorative-accent'].includes(entry.role || '')) {
    return colorSemanticAgreement(entry.role || '', counts).support || declaredFallback()
  }

  const baseRendered = count(counts, 'bgColor') + count(counts, 'textColor') + count(counts, 'borderColor')
  if (baseRendered > 0) return baseRendered
  const renderedFallback = Math.max(
    count(counts, 'structuralBorderColor'),
    ...[...counts.entries()]
      .filter(([category]) => !['bgArea', 'declaredColor', 'brandTokenColor'].includes(category))
      .map(([, value]) => value),
  )
  return renderedFallback || declaredFallback()
}

interface ColorSemanticSupport {
  support: number
  competition: number
}

const SEMANTIC_COLOR_ROLES = new Set([
  'background',
  'surface',
  'secondary',
  'foreground',
  'muted-foreground',
  'border',
  'border-subtle',
  'primary',
  'danger',
  'accent',
  'editorial-accent',
  'decorative-accent',
])

function ownerUnion(owners: ReadonlyMap<string, ReadonlySet<string>>, categories: readonly string[]): Set<string> {
  return new Set(categories.flatMap((category) => [...(owners.get(category) || [])]))
}

function ownerDifference(first: ReadonlySet<string>, second: ReadonlySet<string>): Set<string> {
  return new Set([...first].filter((owner) => !second.has(owner)))
}

function ownerCompetition(expected: ReadonlySet<string>, families: ReadonlySet<string>[]): number {
  const competitors = new Set(families.flatMap((family) => [...family]))
  for (const owner of expected) competitors.delete(owner)
  return competitors.size
}

function hasCompleteRenderedOwnerEvidence(
  owners: ReadonlyMap<string, ReadonlySet<string>>,
  counts: ReadonlyMap<string, number>,
): boolean {
  let renderedCategories = 0
  for (const category of COLOR_CATEGORIES) {
    if (category === 'declaredColor' || category === 'brandTokenColor') continue
    if (count(counts, category) <= 0) continue
    renderedCategories += 1
    if ((owners.get(category)?.size || 0) === 0) return false
  }
  return renderedCategories > 0
}

function ownerColorSemanticSupport(
  role: string,
  owners: ReadonlyMap<string, ReadonlySet<string>>,
): ColorSemanticSupport | null {
  if (!SEMANTIC_COLOR_ROLES.has(role)) return null

  const background = ownerUnion(owners, ['bgColor', 'bgArea'])
  const foreground = ownerUnion(owners, ['textColor'])
  const border = ownerUnion(owners, ['borderColor', 'structuralBorderColor'])
  const primaryActionBackground = ownerUnion(owners, ['primaryActionBackgroundColor', 'primaryActionColor'])
  const genericActionBackground = ownerUnion(owners, ['actionBackgroundColor', 'actionColor'])
  const actionBackground = new Set([...primaryActionBackground, ...genericActionBackground])
  const actionForeground = ownerUnion(owners, ['primaryActionForegroundColor', 'actionForegroundColor'])
  const destructiveBackground = ownerUnion(owners, ['destructiveActionBackgroundColor'])
  const statusBackground = ownerUnion(owners, ['statusBackgroundColor'])
  const selected = ownerUnion(owners, ['selectedColor'])
  const specializedBackground = new Set([
    ...actionBackground,
    ...destructiveBackground,
    ...statusBackground,
    ...selected,
  ])
  const specializedForeground = ownerUnion(owners, [
    'primaryActionForegroundColor',
    'actionForegroundColor',
    'destructiveActionForegroundColor',
    'statusForegroundColor',
    'statusColor',
    'linkColor',
    'selectedColor',
  ])
  const reusableBackground = ownerDifference(background, specializedBackground)
  const reusableForeground = ownerDifference(foreground, specializedForeground)
  const linkedAccent = ownerUnion(owners, ['accentColor', 'linkColor', 'selectedColor'])

  let expected: Set<string>
  let competition: number
  if (role === 'background') {
    expected = reusableBackground
    competition = 0
  } else if (role === 'surface' || role === 'secondary') {
    expected = reusableBackground
    competition = ownerCompetition(expected, [specializedBackground])
  } else if (role === 'foreground' || role === 'muted-foreground') {
    expected = reusableForeground
    competition = ownerCompetition(expected, [specializedForeground])
  } else if (role.startsWith('border')) {
    expected = border
    competition = 0
  } else if (role === 'primary') {
    expected = primaryActionBackground
    competition = ownerCompetition(expected, [
      destructiveBackground,
      statusBackground,
      genericActionBackground,
      selected,
    ])
  } else if (role === 'danger') {
    expected = destructiveBackground
    competition = ownerCompetition(expected, [actionBackground, statusBackground, selected])
  } else if (role === 'accent') {
    expected = new Set([...genericActionBackground, ...linkedAccent])
    competition = ownerCompetition(expected, [destructiveBackground, statusBackground])
  } else if (role === 'editorial-accent') {
    expected = new Set([...linkedAccent, ...actionForeground, ...foreground, ...border])
    competition = 0
  } else {
    expected = new Set([...linkedAccent, ...background])
    competition = ownerCompetition(expected, [destructiveBackground, statusBackground, actionBackground])
  }

  return { support: expected.size, competition }
}

function observationOwnerCountForEntry(
  entry: CanonicalTokenEntry,
  owners: ReadonlyMap<string, ReadonlySet<string>>,
  counts: ReadonlyMap<string, number>,
): number {
  const role = entry.role || ''
  if (entry.group === 'colors' && SEMANTIC_COLOR_ROLES.has(role)) {
    return colorSemanticSupport(role, counts, owners).support
  }
  const categories =
    entry.group !== 'colors'
      ? [...owners.keys()]
      : role === 'background' || role === 'surface' || role === 'secondary'
        ? ['bgColor', 'bgArea']
        : role === 'foreground' || role === 'muted-foreground'
          ? ['textColor']
          : role.startsWith('border')
            ? ['borderColor', 'structuralBorderColor']
            : role === 'primary'
              ? ['primaryActionBackgroundColor', 'primaryActionColor']
              : role === 'danger'
                ? ['destructiveActionBackgroundColor', 'destructiveActionForegroundColor']
                : role === 'accent'
                  ? ['actionBackgroundColor', 'actionColor', 'accentColor', 'linkColor', 'selectedColor']
                  : role === 'editorial-accent'
                    ? [
                        'accentColor',
                        'linkColor',
                        'selectedColor',
                        'actionForegroundColor',
                        'primaryActionForegroundColor',
                        'textColor',
                        'borderColor',
                        'structuralBorderColor',
                      ]
                    : role === 'decorative-accent'
                      ? ['accentColor', 'linkColor', 'selectedColor', 'bgColor', 'bgArea']
                      : [...owners.keys()]
  const distinctOwners = new Set(categories.flatMap((category) => [...(owners.get(category) || [])]))
  return distinctOwners.size || observationCountForEntry(entry, counts)
}

const RENDERED_USAGE_SOURCES = new Set([
  'usage:primaryActionColor',
  'usage:primaryActionBackgroundColor',
  'usage:primaryActionForegroundColor',
  'usage:actionColor',
  'usage:actionBackgroundColor',
  'usage:actionForegroundColor',
  'usage:selectedColor',
  'usage:accentColor',
  'usage:linkColor',
  'usage:bgArea',
  'usage:bgColor',
  'usage:textColor',
  'usage:structuralBorderColor',
  'usage:borderColor',
  'usage:destructiveActionBackgroundColor',
  'usage:destructiveActionForegroundColor',
  'usage:statusBackgroundColor',
  'usage:statusForegroundColor',
  'usage:statusColor',
])

function isRenderedUsageSource(source: string): boolean {
  return (
    RENDERED_USAGE_SOURCES.has(source) ||
    (source.startsWith('usage:') && !['usage:declaredColor', 'usage:brandTokenColor'].includes(source))
  )
}

function familyCount(counts: ReadonlyMap<string, number>, categories: readonly string[]): number {
  return Math.max(0, ...categories.map((category) => count(counts, category)))
}

function countColorSemanticSupport(role: string, counts: ReadonlyMap<string, number>): ColorSemanticSupport {
  const background = familyCount(counts, ['bgColor', 'bgArea'])
  const foreground = count(counts, 'textColor')
  const border = familyCount(counts, ['borderColor', 'structuralBorderColor'])
  const primaryActionBackground = familyCount(counts, ['primaryActionBackgroundColor', 'primaryActionColor'])
  const genericActionBackground = familyCount(counts, ['actionBackgroundColor', 'actionColor'])
  // Primary and hierarchy-neutral actions are disjoint semantic families. Without owner IDs, addition is the safe
  // fallback: treating them as aliases can manufacture ordinary-surface support from specialized elements.
  const actionBackground = primaryActionBackground + genericActionBackground
  const actionForeground = familyCount(counts, ['primaryActionForegroundColor', 'actionForegroundColor'])
  const destructiveBackground = count(counts, 'destructiveActionBackgroundColor')
  const destructiveForeground = count(counts, 'destructiveActionForegroundColor')
  const destructive = Math.max(destructiveBackground, destructiveForeground)
  const statusBackground = count(counts, 'statusBackgroundColor')
  const statusForeground = familyCount(counts, ['statusForegroundColor', 'statusColor'])
  const status = Math.max(statusBackground, statusForeground)
  const selected = count(counts, 'selectedColor')
  const specializedBackground = actionBackground + destructiveBackground + statusBackground + selected
  const specializedForeground =
    actionForeground + destructiveForeground + statusForeground + count(counts, 'linkColor') + selected
  const reusableBackground = Math.max(0, background - specializedBackground)
  const reusableForeground = Math.max(0, foreground - specializedForeground)
  const linkedAccent = familyCount(counts, ['accentColor', 'linkColor', 'selectedColor'])

  let expected = 0
  let competitors: number[] = []
  if (role === 'background') {
    expected = reusableBackground
    // Specialized elements may legitimately reuse the page canvas. They do not create page-background support, but
    // they also must not invalidate an independently observed standards-backed canvas owner.
    competitors = []
  } else if (['surface', 'secondary'].includes(role)) {
    expected = reusableBackground
    competitors = [specializedBackground]
  } else if (['foreground', 'muted-foreground'].includes(role)) {
    expected = reusableForeground
    competitors = [specializedForeground]
  } else if (role.startsWith('border')) {
    expected = border
    competitors = []
  } else if (role === 'primary') {
    expected = primaryActionBackground
    // Action backgrounds are also recorded as accent usage. Only accent owners beyond the action support conflict
    // with a primary-role claim; counting the alias itself would manufacture disagreement from one observation.
    competitors = [
      destructiveBackground,
      statusBackground,
      genericActionBackground,
      Math.max(0, selected - primaryActionBackground),
    ]
  } else if (role === 'danger') {
    expected = destructiveBackground
    competitors = [actionBackground, statusBackground, selected]
  } else if (role === 'accent') {
    expected = Math.max(genericActionBackground, linkedAccent)
    competitors = [destructiveBackground, statusBackground]
  } else if (role === 'editorial-accent') {
    // Editorial accents commonly span emphasized text, link-like foregrounds, and rules. These categories may alias
    // on one owner, so use their maximum and let the distinct-owner gate establish actual repetition.
    expected = Math.max(linkedAccent, actionForeground, foreground, border)
    competitors = []
  } else if (role === 'decorative-accent') {
    expected = Math.max(linkedAccent, background)
    competitors = [destructiveBackground, statusBackground, actionBackground]
  } else {
    const roles = [
      background,
      foreground,
      border,
      actionBackground,
      actionForeground,
      destructive,
      status,
      linkedAccent,
    ]
    expected = Math.max(...roles)
    competitors = roles.filter((value) => value !== expected)
  }
  return { support: expected, competition: competitors.reduce((sum, value) => sum + value, 0) }
}

function colorSemanticSupport(
  role: string,
  counts: ReadonlyMap<string, number>,
  owners?: ReadonlyMap<string, ReadonlySet<string>>,
): ColorSemanticSupport {
  if (owners && hasCompleteRenderedOwnerEvidence(owners, counts)) {
    const exact = ownerColorSemanticSupport(role, owners)
    if (exact) return exact
  }
  return countColorSemanticSupport(role, counts)
}

function colorSemanticAgreement(
  role: string,
  counts: ReadonlyMap<string, number>,
  exactSupport?: ColorSemanticSupport,
): { agreement: number; support: number } {
  const result = exactSupport || countColorSemanticSupport(role, counts)
  const total = result.support + result.competition
  return { agreement: total > 0 ? result.support / total : 0, support: result.support }
}

const COMPONENT_SCOPE_SOURCES = new Set([
  'element:control-spacing',
  'element:specialized-spacing',
  'element:control-radius',
  'element:specialized-radius',
  'element:control-shadow',
  'element:specialized-shadow',
  'geometry:circle-or-pill',
])

const FOUNDATION_SCOPE_SOURCES = new Set([
  'element:page-background',
  'element:structural-spacing',
  'element:content-spacing',
  'element:structural-radius',
  'element:content-radius',
  'element:structural-shadow',
  'element:content-shadow',
  'rendered:text',
  'computed:border',
])

const INTERACTIVE_ELEMENT_SOURCES = new Set([
  'element:primary-action',
  'element:action',
  'element:destructive-action',
  'element:selected',
  'element:link',
])

function independentScopeOwnerCount(
  sourceCounts: ReadonlyMap<string, number>,
  sourceOwners: ReadonlyMap<string, ReadonlySet<string>>,
  scopeSources: ReadonlySet<string>,
): number {
  const exactOwners = new Set<string>()
  let conservativeFallback = 0
  for (const source of scopeSources) {
    for (const owner of sourceOwners.get(source) || []) exactOwners.add(owner)
    conservativeFallback = Math.max(conservativeFallback, sourceCounts.get(source) || 0)
  }
  // Legacy captures may expose only source counts. Taking the maximum retains useful evidence without summing the
  // same owner once for `computed:*` and again for its element scope.
  return Math.max(exactOwners.size, conservativeFallback)
}

function semanticAssessment(
  entry: CanonicalTokenEntry,
  roleCounts: ReadonlyMap<string, number>,
  sourceCounts: ReadonlyMap<string, number>,
  pageCount: number,
  ownerCount: number,
  foundationOwnerCountsByPage: ReadonlyMap<string, number>,
  componentOwnerCountsByPage: ReadonlyMap<string, number>,
  colorSupport?: ColorSemanticSupport,
): { confidence: TokenConfidence; agreement: number; componentOnly: boolean; reusableSource: boolean } {
  if (entry.group === 'colors') {
    const result = colorSemanticAgreement(entry.role || '', roleCounts, colorSupport)
    const confidence =
      result.support <= 0 || result.agreement < 0.6
        ? 'low'
        : result.agreement >= 0.8 && pageCount >= 2
          ? 'high'
          : 'medium'
    return {
      confidence,
      agreement: result.agreement,
      componentOnly: false,
      reusableSource: result.support > 0,
    }
  }

  const component = [...componentOwnerCountsByPage.values()].reduce((sum, amount) => sum + amount, 0)
  const foundation = [...foundationOwnerCountsByPage.values()].reduce((sum, amount) => sum + amount, 0)
  const scoped = component + foundation
  const genericRendered = [...sourceCounts.entries()].some(
    ([source, amount]) =>
      amount > 0 &&
      (source.startsWith('computed:') || source === 'rendered:text') &&
      !COMPONENT_SCOPE_SOURCES.has(source),
  )
  const agreement = scoped > 0 ? Math.max(component, foundation) / scoped : genericRendered ? 1 : 0
  const minimumFoundationOwners = Math.max(1, pageCount)
  const everySupportingPageHasFoundationOwners = (minimum: number) =>
    foundationOwnerCountsByPage.size === pageCount &&
    [...foundationOwnerCountsByPage.values()].every((amount) => amount >= minimum)
  let valueEligible = true
  if (entry.group === 'spacing') {
    const pixels = cssPixels(entry.value)
    if (pixels !== null && pixels <= 0) valueEligible = false
    if (pixels !== null && pixels > 96) {
      const stableIntegralMeasurement = Math.abs(pixels - Math.round(pixels)) <= 0.01
      valueEligible = stableIntegralMeasurement && everySupportingPageHasFoundationOwners(2)
    }
  }
  if (entry.group === 'radii') {
    const circleOrPill = sourceCounts.get('geometry:circle-or-pill') || 0
    const ordinaryRadius = sourceCounts.get('computed:ordinary-radius') || 0
    if (circleOrPill > ordinaryRadius) valueEligible = false
    if (!everySupportingPageHasFoundationOwners(1)) valueEligible = false
    const pixels = cssPixels(entry.value)
    if (pixels !== null && pixels > 96 && !everySupportingPageHasFoundationOwners(2)) valueEligible = false
  }
  const reusableSource =
    valueEligible && (foundation >= minimumFoundationOwners || (scoped === 0 && genericRendered && pageCount >= 2))
  const componentOnly = component > 0 && !reusableSource
  const confidence =
    agreement < 2 / 3 || ownerCount <= 0 ? 'low' : agreement >= 0.85 && pageCount >= 2 ? 'high' : 'medium'
  return {
    confidence,
    agreement,
    componentOnly,
    reusableSource,
  }
}

function evidenceSemantics(
  entry: CanonicalTokenEntry,
  sources: ReadonlySet<string>,
  sourceCounts: ReadonlyMap<string, number>,
  roleCounts: ReadonlyMap<string, number>,
  pageCount: number,
  eligiblePageCount: number,
  ownerCount: number,
  foundationOwnerCountsByPage: ReadonlyMap<string, number>,
  componentOwnerCountsByPage: ReadonlyMap<string, number>,
  colorSupport?: ColorSemanticSupport,
  pairedSurface?: PairedSurfaceEvidence,
): {
  confidence: TokenConfidence
  reuseScope: TokenReuseScope
  pageSupportRatio: number
  semanticAgreement: number
} {
  const pageSupportRatio = eligiblePageCount > 0 ? pageCount / eligiblePageCount : 0
  const declared = [...sources].some(
    (source) =>
      source.startsWith('css-variable:') || source === 'usage:declaredColor' || source === 'usage:brandTokenColor',
  )
  const rendered = [...sources].some(
    (source) =>
      isRenderedUsageSource(source) ||
      source === 'rendered:text' ||
      source.startsWith('computed:') ||
      source.startsWith('element:'),
  )
  if (declared && !rendered) {
    return { confidence: 'low', reuseScope: 'declared-only', pageSupportRatio, semanticAgreement: 0 }
  }

  const semantic = semanticAssessment(
    entry,
    roleCounts,
    sourceCounts,
    pageCount,
    ownerCount,
    foundationOwnerCountsByPage,
    componentOwnerCountsByPage,
    colorSupport,
  )
  if (semantic.componentOnly) {
    return {
      confidence: semantic.confidence,
      reuseScope: 'component',
      pageSupportRatio,
      semanticAgreement: semantic.agreement,
    }
  }
  const crossPageFoundation =
    eligiblePageCount >= 2 &&
    pageCount >= 2 &&
    pageSupportRatio >= 0.75 &&
    semantic.confidence !== 'low' &&
    semantic.reusableSource &&
    ownerCount >= pageCount
  const pairedForegroundFoundation =
    entry.group === 'colors' &&
    ['foreground', 'muted-foreground'].includes(entry.role || '') &&
    semantic.confidence !== 'low' &&
    Boolean(
      pairedSurface && pairedSurface.mainTextOwnerCount <= ownerCount && pairedSurface.mainTextPageCount <= pageCount,
    ) &&
    (entry.role === 'foreground' ? isPrimaryForegroundPair(pairedSurface) : isFoundationForegroundPair(pairedSurface))
  const requiresPairedForeground =
    entry.group === 'colors' && ['foreground', 'muted-foreground'].includes(entry.role || '')
  const repeatedOnePageFoundation =
    eligiblePageCount === 1 &&
    pageCount === 1 &&
    rendered &&
    semantic.confidence !== 'low' &&
    semantic.reusableSource &&
    ownerCount >= 2
  const declaredAndRenderedOnePageFoundation =
    eligiblePageCount === 1 &&
    pageCount === 1 &&
    declared &&
    rendered &&
    semantic.confidence !== 'low' &&
    semantic.reusableSource &&
    ownerCount >= 1
  const standardsBackedPageFoundation =
    entry.group === 'colors' &&
    entry.role === 'background' &&
    eligiblePageCount === 1 &&
    pageCount === 1 &&
    sources.has('element:page-background') &&
    semantic.confidence !== 'low' &&
    ownerCount >= 1
  if (
    requiresPairedForeground
      ? pairedForegroundFoundation
      : crossPageFoundation ||
        repeatedOnePageFoundation ||
        declaredAndRenderedOnePageFoundation ||
        standardsBackedPageFoundation
  ) {
    return {
      confidence: semantic.confidence,
      reuseScope: 'foundation',
      pageSupportRatio,
      semanticAgreement: semantic.agreement,
    }
  }
  if (pageCount > 0) {
    return {
      confidence: semantic.confidence,
      reuseScope: 'local',
      pageSupportRatio,
      semanticAgreement: semantic.agreement,
    }
  }
  return { confidence: 'low', reuseScope: 'unknown', pageSupportRatio, semanticAgreement: 0 }
}

function evidencePageUrl(value: string): string {
  return pageIdentityUrl(value)
}

function summedPageCounts(valuesByPage: ReadonlyMap<string, ReadonlyMap<string, number>>): Map<string, number> {
  const result = new Map<string, number>()
  for (const values of valuesByPage.values()) {
    for (const [key, count] of values) result.set(key, (result.get(key) || 0) + count)
  }
  return result
}

function viewportEvidencePriority(viewport: string): number {
  if (viewport === 'desktop') return 3
  if (viewport === 'tablet') return 2
  if (viewport === 'mobile') return 1
  return 0
}

function needsRenderedTextOwnerEvidence(entry: CanonicalTokenEntry): boolean {
  return (
    entry.group.startsWith('typography.') ||
    (entry.group === 'colors' && ['foreground', 'muted-foreground'].includes(entry.role || ''))
  )
}

function renderedTextObservationMatchesEntry(
  entry: CanonicalTokenEntry,
  observation: NonNullable<ExtractedStyles['renderedTextStyleObservations']>[number],
): boolean {
  if (entry.group === 'colors') {
    if (!['foreground', 'muted-foreground'].includes(entry.role || '')) return false
    if (observation.source.glyphPaintKind !== 'solid-color') return false
    const foreground = observation.source.foreground || observation.styles.color
    return Boolean(foreground && valuesMatch(entry, 'textColor', foreground))
  }
  if (entry.group === 'typography.fontFamilies' || entry.group === 'typography.fontStacks') {
    return valuesMatch(entry, 'fontTextFamily', observation.styles.fontFamily)
  }
  if (entry.group === 'typography.fontSizes') {
    return valuesMatch(entry, 'fontSize', observation.styles.fontSize)
  }
  if (entry.group === 'typography.fontWeights') {
    return valuesMatch(entry, 'fontWeight', observation.styles.fontWeight)
  }
  if (entry.group === 'typography.lineHeights') {
    return valuesMatch(entry, 'typeMetric', `${observation.styles.fontSize}|${observation.styles.lineHeight}`)
  }
  if (entry.group === 'typography.letterSpacings') {
    return valuesMatch(entry, 'letterSpacing', observation.styles.letterSpacing)
  }
  return false
}

export function buildTokenEvidence(
  tokens: DesignToken,
  captures: TokenEvidenceCapture[],
): Record<string, TokenEvidence> {
  const evidence: Record<string, TokenEvidence> = {}
  const eligiblePageCount = new Set(captures.map((capture) => evidencePageUrl(capture.url))).size
  const foundationSurfaces = [tokens.colors.background, tokens.colors.surface, tokens.colors.secondary]
  const primaryForegroundPair = tokens.colors.foreground
    ? buildFoundationForegroundPairEvidence(foundationSurfaces, tokens.colors.foreground, captures)
    : undefined

  for (const entry of buildCanonicalTokenCatalog(tokens)) {
    const pairedSurface =
      entry.group === 'colors' && ['foreground', 'muted-foreground'].includes(entry.role || '')
        ? entry.role === 'foreground'
          ? primaryForegroundPair
          : buildForegroundPairEvidence(
              primaryForegroundPair?.background || tokens.colors.background,
              entry.value,
              captures,
            )
        : undefined
    const pairedBackground = pairedSurface ? normalizeColorValue(pairedSurface.background) : null
    const pages = new Set<string>()
    const roleCountsByPage = new Map<string, Map<string, number>>()
    const sourceCountsByPage = new Map<string, Map<string, number>>()
    const foundationOwnerCountsByPage = new Map<string, number>()
    const componentOwnerCountsByPage = new Map<string, number>()
    const ownerCountsByPage = new Map<string, number>()
    const colorSupportByPage = new Map<string, ColorSemanticSupport>()
    const sourcesByPage = new Map<string, Set<string>>()
    const renderedTextOwnersByPage = new Map<string, NonNullable<TokenEvidence['renderedTextOwners']>>()
    const representativePriorityByPage = new Map<string, number>()
    let captureCount = 0

    for (const [captureIndex, capture] of captures.entries()) {
      let captureMatched = false
      const matchedSources = new Set<string>()
      const matchedRoleCounts = new Map<string, number>()
      const matchedSourceCounts = new Map<string, number>()
      const matchedRoleOwners = new Map<string, Set<string>>()
      const matchedSourceOwners = new Map<string, Set<string>>()
      for (const category of categoriesForEntry(entry)) {
        const prefix = `${category}:`
        for (const [key, rawCount] of Object.entries(capture.styles.usageCount)) {
          if (!key.startsWith(prefix) || !Number.isFinite(rawCount) || rawCount <= 0) continue
          const observedValue = key.slice(prefix.length)
          if (!valuesMatch(entry, category, observedValue)) continue
          captureMatched = true
          const usageOwnerIds = capture.styles.usageOwnerIds?.[key] || []
          for (const ownerId of usageOwnerIds) {
            const categoryOwners = matchedRoleOwners.get(category) || new Set<string>()
            categoryOwners.add(ownerId)
            matchedRoleOwners.set(category, categoryOwners)
          }
          const usageOwnerCount = capture.styles.usageOwnerCounts?.[key]
          const normalizedCount =
            usageOwnerIds.length > 0
              ? usageOwnerIds.length
              : Number.isFinite(usageOwnerCount) && Number(usageOwnerCount) > 0
                ? Number(usageOwnerCount)
                : Number(rawCount)
          matchedRoleCounts.set(category, Math.max(matchedRoleCounts.get(category) || 0, normalizedCount))
          matchedSources.add(`usage:${category}`)
          const valueSources = capture.styles.valueSources?.[key] || []
          for (const source of valueSources) {
            matchedSources.add(source)
            // valueSourceCounts is already owner-normalized for this exact value/source pair by the extractor.
            // Assigning every owner of the value to every source manufactures semantic agreement whenever the same
            // value appears in more than one scope (for example, content and control spacing).
            const amount = capture.styles.valueSourceCounts?.[key]?.[source]
            const normalizedAmount = Number.isFinite(amount) && Number(amount) > 0 ? Number(amount) : 1
            matchedSourceCounts.set(source, Math.max(matchedSourceCounts.get(source) || 0, normalizedAmount))
            const sourceOwnerIds = capture.styles.valueSourceOwnerIds?.[key]?.[source] || []
            if (sourceOwnerIds.length > 0) {
              const sourceOwners = matchedSourceOwners.get(source) || new Set<string>()
              for (const ownerId of sourceOwnerIds) sourceOwners.add(ownerId)
              matchedSourceOwners.set(source, sourceOwners)
            }
          }
        }
      }
      if (!captureMatched) continue
      for (const [category, owners] of matchedRoleOwners) {
        matchedRoleCounts.set(category, owners.size)
      }
      for (const [source, owners] of matchedSourceOwners) matchedSourceCounts.set(source, owners.size)
      const page = evidencePageUrl(capture.url)
      // Support belongs to the proposed token role, not every other semantic use of the same literal value.
      const captureOwnerCount = observationOwnerCountForEntry(entry, matchedRoleOwners, matchedRoleCounts)
      const captureColorSupport =
        entry.group === 'colors'
          ? colorSemanticSupport(entry.role || '', matchedRoleCounts, matchedRoleOwners)
          : undefined
      const priority = viewportEvidencePriority(capture.viewport) * 1_000_000 - captureIndex
      const existingPriority = representativePriorityByPage.get(page)
      if (existingPriority === undefined || priority > existingPriority) {
        representativePriorityByPage.set(page, priority)
        roleCountsByPage.set(page, matchedRoleCounts)
        sourceCountsByPage.set(page, matchedSourceCounts)
        foundationOwnerCountsByPage.set(
          page,
          independentScopeOwnerCount(matchedSourceCounts, matchedSourceOwners, FOUNDATION_SCOPE_SOURCES),
        )
        componentOwnerCountsByPage.set(
          page,
          independentScopeOwnerCount(matchedSourceCounts, matchedSourceOwners, COMPONENT_SCOPE_SOURCES),
        )
        ownerCountsByPage.set(page, captureOwnerCount)
        if (captureColorSupport) colorSupportByPage.set(page, captureColorSupport)
        sourcesByPage.set(page, matchedSources)
        if (needsRenderedTextOwnerEvidence(entry)) {
          const matchedOwnerIds = new Set([...matchedRoleOwners.values()].flatMap((owners) => [...owners]))
          const exactRenderedTextOwners = (capture.styles.renderedTextStyleObservations || [])
            .filter(
              (observation) =>
                matchedOwnerIds.has(observation.ownerId) &&
                renderedTextObservationMatchesEntry(entry, observation) &&
                (!pairedBackground ||
                  normalizeColorValue(observation.styles.backgroundColor || '') === pairedBackground),
            )
            .sort((first, second) => first.ownerId.localeCompare(second.ownerId))
          const renderedTextOwners = exactRenderedTextOwners.slice(0, 8).map((observation) => ({
            ...observation,
            page,
            routeId: opaqueRouteIdentity(page),
            viewport: capture.viewport,
          }))
          if (renderedTextOwners.length > 0) {
            matchedSources.add('rendered:text')
            matchedSourceCounts.set('rendered:text', exactRenderedTextOwners.length)
            renderedTextOwnersByPage.set(page, renderedTextOwners)
          } else {
            renderedTextOwnersByPage.delete(page)
          }
        }
      }
      captureCount += 1
      pages.add(page)
    }

    // nth-of-type paths are unique only inside one capture. One canonical matching capture per normalized URL keeps
    // responsive captures from either duplicating or accidentally merging owners without claiming cross-viewport ID.
    const roleCounts = summedPageCounts(roleCountsByPage)
    const sourceCounts = summedPageCounts(sourceCountsByPage)
    const ownerCount = [...ownerCountsByPage.values()].reduce((sum, count) => sum + count, 0)
    const colorSupport = [...colorSupportByPage.values()].reduce<ColorSemanticSupport>(
      (total, current) => ({
        support: total.support + current.support,
        competition: total.competition + current.competition,
      }),
      { support: 0, competition: 0 },
    )
    const sources = new Set([...sourcesByPage.values()].flatMap((values) => [...values]))
    const renderedTextOwners = [...renderedTextOwnersByPage.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .flatMap(([, owners]) => owners)
    const supportedPairPages = pairedSurface
      ? pairedSurface.routeSupport.filter((route) => route.supported).map((route) => route.page)
      : undefined
    const evidencePages = supportedPairPages || [...pages]
    const evidencePageCount = pairedSurface?.pageCount ?? pages.size
    const evidenceOwnerCount = pairedSurface?.ownerCount ?? ownerCount
    const evidenceCaptureCount = pairedSurface?.pageCount ?? captureCount
    if (pairedSurface) sources.add('observed:text-background-pair')
    if (sources.size === 0) sources.add('derived:token-builder')
    const measurementConfidence = measurementConfidenceFor(
      evidencePageCount,
      evidenceCaptureCount,
      evidenceOwnerCount,
      sources,
    )
    const semantics = evidenceSemantics(
      entry,
      sources,
      sourceCounts,
      roleCounts,
      evidencePageCount,
      eligiblePageCount,
      evidenceOwnerCount,
      foundationOwnerCountsByPage,
      componentOwnerCountsByPage,
      entry.group === 'colors' ? colorSupport : undefined,
      pairedSurface,
    )
    const reasons = new Set<TokenEvidence['reasons'][number]>()
    if (evidencePageCount >= 2) reasons.add('cross-page')
    if ([...sources].some((source) => source.startsWith('css-variable:'))) reasons.add('declared-token')
    if (semantics.reuseScope === 'declared-only') reasons.add('declared-only')
    if ([...sources].some((source) => INTERACTIVE_ELEMENT_SOURCES.has(source))) reasons.add('interactive-use')
    if (sources.has('rendered:text') || [...sources].some(isRenderedUsageSource)) reasons.add('rendered-use')
    if (pairedSurface) reasons.add('paired-surface')
    if ([...sources].some((source) => source.startsWith('computed:') || isRenderedUsageSource(source))) {
      reasons.add('computed-style')
    }

    evidence[entry.evidencePath] = {
      value: entry.value,
      confidence: semantics.confidence,
      measurementConfidence,
      semanticConfidence: semantics.confidence,
      reuseScope: semantics.reuseScope,
      observationCount: Number(evidenceOwnerCount.toFixed(3)),
      ownerCount: Number(evidenceOwnerCount.toFixed(3)),
      ...(entry.group !== 'colors'
        ? {
            foundationOwnerCount: [...foundationOwnerCountsByPage.values()].reduce((sum, amount) => sum + amount, 0),
            minimumPageFoundationOwnerCount:
              foundationOwnerCountsByPage.size > 0 ? Math.min(...foundationOwnerCountsByPage.values()) : 0,
          }
        : {}),
      semanticAgreement: Number(semantics.semanticAgreement.toFixed(3)),
      pageCount: evidencePageCount,
      captureCount: evidenceCaptureCount,
      eligiblePageCount,
      pageSupportRatio: Number(semantics.pageSupportRatio.toFixed(3)),
      pages: [...evidencePages].sort(),
      ...(renderedTextOwners.length > 0 ? { renderedTextOwners } : {}),
      sources: [...sources].sort(),
      ...(sourceCounts.size > 0
        ? {
            sourceCounts: Object.fromEntries(
              [...sourceCounts.entries()].sort(([first], [second]) => first.localeCompare(second)),
            ),
          }
        : {}),
      ...(roleCounts.size > 0
        ? {
            roleCounts: Object.fromEntries(
              [...roleCounts.entries()].sort(([first], [second]) => first.localeCompare(second)),
            ),
          }
        : {}),
      ...(pairedSurface ? { pairedSurface } : {}),
      reasons: [...reasons],
    }
  }

  return evidence
}
