import type { ComponentType, ComponentVariantCandidate, ComponentVariantPattern } from '../analyzer/component-detect.js'
import {
  hasVisibleBorder,
  hasVisibleColor,
  hasVisibleShadow,
  isReusableComponentPattern,
  normalizeComponentStyleRecord,
  summarizeComponentVariants,
} from '../analyzer/component-detect.js'
import type { DesignToken } from '../analyzer/types.js'
import { evidencePageRouteIdentity } from '../analyzer/url-identity.js'
import { isContextDependentRadius } from '../design-evidence/structural-styles.js'
import type { ComponentEvidence, DesignEvidence } from '../design-evidence/types.js'
import { canonicalCatalogPageIds } from './claim-catalog.js'

export const CATALOG_COMPONENT_TYPES = new Set<ComponentType>([
  'button',
  'card',
  'navigation',
  'input',
  'table',
  'modal',
  'list',
  'tab',
  'status',
])

export const COMPONENT_EVIDENCE_SAMPLE_LIMIT = 24
export const DESIGN_MD_COMPONENT_DETAIL_LIMIT = 14
const DESIGN_MD_COMPONENT_DETAIL_LIMIT_PER_TYPE = 4

interface ComponentDetailCandidate {
  component: string
  variant: string
  sourceInstances: number
  pageCount?: number
  reuseConfidence?: number
  reuseScope?: 'isolated' | 'page-repeated' | 'cross-page'
}

export function canonicalComponentEvidence(evidence: DesignEvidence): ComponentEvidence[] {
  const pageIds = canonicalCatalogPageIds(evidence)
  return evidence.components.filter(
    (component) =>
      pageIds.has(component.pageId) &&
      CATALOG_COMPONENT_TYPES.has(component.type as ComponentType) &&
      component.confidence >= 0.8,
  )
}

export function canonicalComponentCandidates(
  evidence: DesignEvidence,
  tokens: DesignToken = evidence.tokens,
): ComponentVariantCandidate[] {
  const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
  return canonicalComponentEvidence(evidence).map((component) => {
    const page = pageById.get(component.pageId)
    const pageWidth = page?.contentWidth || page?.viewportWidth
    const pageHeight = page?.contentHeight || page?.viewportHeight
    return {
      type: component.type as ComponentType,
      confidence: component.confidence,
      // Catalog pattern provenance is component-owned. Section and screenshot references remain on the raw evidence
      // instance instead of being counted as additional component observations.
      evidence: [component.id],
      styles: component.styles,
      tokenRefs: component.tokenRefs,
      primaryColor: tokens.colors.primary,
      surfaceColors: [tokens.colors.background, tokens.colors.surface, tokens.colors.secondary].filter(
        (color): color is string => Boolean(color),
      ),
      role: component.role,
      elementKind: component.elementKind,
      semanticIdentity: component.semanticIdentity,
      visualTreatment: component.visualTreatment,
      usageContext: component.usageContext,
      visualOwnerKey: component.visualOwnerKey,
      semanticSourceKey: component.semanticSourceKey,
      textStyleOwner: component.textStyleOwner,
      statusBoundary: component.statusBoundary,
      pageId: component.pageId,
      ...(pageWidth ? { widthPx: component.rect.width * pageWidth } : {}),
      ...(pageHeight ? { heightPx: component.rect.height * pageHeight } : {}),
    }
  })
}

/** The one component catalog consumed by transfer grammar and every DESIGN.md component summary. */
export function buildCanonicalComponentCatalog(
  evidence: DesignEvidence,
  tokens: DesignToken = evidence.tokens,
): ComponentVariantPattern[] {
  return summarizeComponentVariants(canonicalComponentCandidates(evidence, tokens))
}

export function canonicalComponentKey(component: string, variant: string | undefined): string {
  return `${component}\u0000${variant || 'default'}`
}

/** Stable variant identity shared by profile recipes and Component Specs. */
export function canonicalComponentVariant(pattern: Pick<ComponentVariantPattern, 'name' | 'type'>): string {
  if (pattern.name === pattern.type) return 'default'
  return pattern.name.startsWith(`${pattern.type}-`) ? pattern.name.slice(pattern.type.length + 1) : pattern.name
}

export function canonicalRepresentativeComponents(
  pattern: Pick<ComponentVariantPattern, 'representativeEvidence' | 'evidence'>,
  evidence: DesignEvidence,
): ComponentEvidence[] {
  const byId = new Map(canonicalComponentEvidence(evidence).map((component) => [component.id, component]))
  return [...new Set(pattern.representativeEvidence || pattern.evidence)]
    .flatMap((id) => {
      const component = byId.get(id)
      return component ? [component] : []
    })
    .sort((first, second) => first.id.localeCompare(second.id))
}

/**
 * A deterministic, route-balanced component-owned evidence sample shared by profile recipes and Component Specs.
 * Section and image provenance remains reachable through each sampled component in Design Evidence JSON.
 */
export function canonicalComponentEvidenceSample(
  pattern: Pick<ComponentVariantPattern, 'representativeEvidence' | 'evidence'>,
  evidence: DesignEvidence,
  limit = COMPONENT_EVIDENCE_SAMPLE_LIMIT,
): ComponentEvidence[] {
  const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const byRoute = new Map<string, ComponentEvidence[]>()
  for (const component of canonicalRepresentativeComponents(pattern, evidence)) {
    const page = pageById.get(component.pageId)
    const route = page ? evidencePageRouteIdentity(page) : component.pageId
    const group = byRoute.get(route) || []
    group.push(component)
    byRoute.set(route, group)
  }
  const groups = [...byRoute.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([, components]) => components.sort((first, second) => first.id.localeCompare(second.id)))
  const result: ComponentEvidence[] = []
  for (let offset = 0; result.length < limit; offset += 1) {
    let added = false
    for (const group of groups) {
      const component = group[offset]
      if (!component) continue
      result.push(component)
      added = true
      if (result.length >= limit) break
    }
    if (!added) break
  }
  return result
}

export function canonicalComponentSharedTokenRefs(components: readonly ComponentEvidence[]): string[] {
  if (components.length === 0) return []
  const support = new Map<string, number>()
  for (const component of components) {
    const styles = normalizeComponentStyleRecord(
      component.type as ComponentType,
      component.styles,
      component.textStyleOwner,
    )
    const dimensions = new Set<string>()
    if (styles.backgroundColor || styles.color) dimensions.add('color')
    if (
      Object.keys(styles).some(
        (property) => property === 'border' || /^border(?:Top|Right|Bottom|Left)$/.test(property),
      )
    ) {
      dimensions.add('border')
      dimensions.add('color')
    }
    if (['padding', 'gap', 'height', 'minHeight'].some((property) => styles[property])) dimensions.add('spacing')
    if (styles.borderRadius && !isContextDependentRadius(styles.borderRadius)) dimensions.add('radius')
    if (styles.boxShadow) dimensions.add('shadow')
    if (['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].some((property) => styles[property])) {
      dimensions.add('typography')
    }
    for (const ref of new Set(component.tokenRefs)) {
      const dimension = ref.startsWith('typography.')
        ? 'typography'
        : ref.startsWith('spacing.')
          ? 'spacing'
          : ref.startsWith('color.')
            ? 'color'
            : ref.startsWith('border.')
              ? 'border'
              : ref.startsWith('radius.') || ref.startsWith('rounded.')
                ? 'radius'
                : ref.startsWith('shadow.')
                  ? 'shadow'
                  : undefined
      if (!dimension || dimensions.has(dimension)) support.set(ref, (support.get(ref) || 0) + 1)
    }
  }
  const minimum = components.length <= 1 ? 1 : Math.max(2, Math.ceil(components.length * 0.8))
  return [...support.entries()]
    .filter(([, count]) => count >= minimum)
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .map(([ref]) => ref)
}

export function consensusComponentRole(pattern: ComponentVariantPattern): string | undefined {
  const support = pattern.styleObservationCount || 0
  return Object.entries(pattern.roleCounts || {})
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .find(([, count]) => support > 0 && count / support >= 0.8)?.[0]
}

function meaningfulStyleValue(property: string, value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!normalized || ['none', 'normal', 'auto', 'initial', 'inherit', 'unset'].includes(normalized)) return false
  if (property === 'border') return hasVisibleBorder(value)
  if (property === 'boxShadow') return hasVisibleShadow(value)
  if (property === 'borderRadius' && isContextDependentRadius(value)) return false
  if (['padding', 'gap', 'height', 'minHeight', 'borderRadius'].includes(property)) {
    const dimensions = normalized.match(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)?/g)
    return dimensions ? dimensions.some((dimension) => Math.abs(Number.parseFloat(dimension)) > 0.001) : true
  }
  if (['backgroundColor', 'color'].includes(property)) return hasVisibleColor(value)
  return true
}

function componentPaddingSides(value: string | undefined): readonly [number, number, number, number] | null {
  if (!value) return null
  const dimensions = value
    .trim()
    .split(/\s+/)
    .map((dimension) => Number.parseFloat(dimension))
  if (dimensions.length < 1 || dimensions.length > 4 || dimensions.some((dimension) => !Number.isFinite(dimension))) {
    return null
  }
  const [top, right = top, bottom = top, left = right] = dimensions
  return [top, right, bottom, left]
}

function hasButtonLikeBoundary(styles: Readonly<Record<string, string>>): boolean {
  if (hasVisibleColor(styles.backgroundColor)) return true
  if (
    Object.entries(styles).some(
      ([property, value]) =>
        (property === 'border' || /^border(?:Top|Right|Bottom|Left)$/.test(property)) && hasVisibleBorder(value),
    )
  ) {
    return true
  }
  const padding = componentPaddingSides(styles.padding)
  const height = Number.parseFloat(styles.height || '')
  return Boolean(
    padding &&
    Number.isFinite(height) &&
    height >= 28 &&
    (padding[1] + padding[3] >= 16 || padding[0] + padding[2] >= 12),
  )
}

/** Shared P1 contract used by profile recipes and Component Specs. */
export function isActionableComponentPattern(
  pattern: ComponentVariantPattern,
  sharedTokenRefs: readonly string[],
): boolean {
  if (!CATALOG_COMPONENT_TYPES.has(pattern.type) || !isReusableComponentPattern(pattern)) return false
  if (['button', 'tab'].includes(pattern.type) && pattern.visualTreatments?.includes('structural')) return false
  if (pattern.visualTreatments?.includes('button-like')) {
    if (!hasButtonLikeBoundary(pattern.styles)) return false
    const hasObservedLabelTypography = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].some(
      (property) => meaningfulStyleValue(property, pattern.styles[property] || ''),
    )
    if (!hasObservedLabelTypography) return false
  }
  if ((pattern.semanticIdentities?.length || 0) > 1 || (pattern.usageContexts?.length || 0) > 1) return false
  if (pattern.type === 'status') {
    const representativeCount = pattern.styleObservationCount || 0
    const requiredBoundarySupport = Math.max(2, Math.ceil(representativeCount * 0.8))
    if ((pattern.statusBoundarySupport || 0) < requiredBoundarySupport) return false
  }
  const dimensions = new Set(
    sharedTokenRefs.map((ref) => (ref.startsWith('typography.') ? 'typography' : ref.split('.')[0])),
  )
  for (const [property, value] of Object.entries(pattern.styles)) {
    if (!meaningfulStyleValue(property, value)) continue
    if (['backgroundColor', 'color'].includes(property)) dimensions.add('color')
    if (['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].includes(property)) {
      dimensions.add('typography')
    }
    if (['padding', 'gap', 'height', 'minHeight'].includes(property)) dimensions.add('spacing')
    if (property === 'borderRadius') dimensions.add('radius')
    if (property === 'border') dimensions.add('border')
    if (property === 'boxShadow') dimensions.add('shadow')
  }
  const hasAppearance = dimensions.has('color') || dimensions.has('typography')
  const hasStructure = ['spacing', 'radius', 'border', 'shadow'].some((dimension) => dimensions.has(dimension))
  return hasAppearance && hasStructure && dimensions.size >= 2
}

/** Selects a bounded, type-balanced human-facing detail set without truncating the canonical catalog. */
export function selectBalancedComponentDetails<T extends ComponentDetailCandidate>(recipes: readonly T[]): T[] {
  const scopeRank = { 'cross-page': 2, 'page-repeated': 1, isolated: 0 }
  const ranked = [...recipes].sort(
    (first, second) =>
      scopeRank[second.reuseScope || 'isolated'] - scopeRank[first.reuseScope || 'isolated'] ||
      (second.pageCount || 0) - (first.pageCount || 0) ||
      (second.reuseConfidence || 0) - (first.reuseConfidence || 0) ||
      second.sourceInstances - first.sourceInstances ||
      canonicalComponentKey(first.component, first.variant).localeCompare(
        canonicalComponentKey(second.component, second.variant),
      ),
  )
  const byType = new Map<string, T[]>()
  for (const recipe of ranked) {
    const group = byType.get(recipe.component) || []
    group.push(recipe)
    byType.set(recipe.component, group)
  }
  const typeOrder = [...byType.keys()].sort((first, second) => {
    const firstRank = ranked.indexOf(byType.get(first)![0])
    const secondRank = ranked.indexOf(byType.get(second)![0])
    return firstRank - secondRank || first.localeCompare(second)
  })
  const selected: T[] = []
  for (let offset = 0; offset < DESIGN_MD_COMPONENT_DETAIL_LIMIT_PER_TYPE; offset += 1) {
    for (const type of typeOrder) {
      const recipe = byType.get(type)?.[offset]
      if (!recipe) continue
      selected.push(recipe)
      if (selected.length >= DESIGN_MD_COMPONENT_DETAIL_LIMIT) return selected
    }
  }
  return selected
}

/**
 * The portable implementation-oriented style snapshot shared by every component artifact.
 * Raw evidence retains layout-dependent values, while recipes omit radii that the browser clamps against geometry.
 */
export function canonicalComponentRecipeStyles(styles: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(styles)
      .filter(
        ([property, value]) => value.trim() !== '' && !(property === 'borderRadius' && isContextDependentRadius(value)),
      )
      .sort(([first], [second]) => first.localeCompare(second)),
  )
}
