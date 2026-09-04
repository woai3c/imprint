import {
  isPillRadius,
  isReusableComponentPattern,
  resolveComponentReuseEvidence,
} from '../analyzer/component-detect.js'
import type { ComponentVariantPattern } from '../analyzer/component-detect.js'
import type { DesignToken } from '../analyzer/types.js'
import { evidencePageRouteIdentity } from '../analyzer/url-identity.js'
import { resolveDesignTokenRef } from '../design-evidence/token-reference.js'
import type { ComponentEvidence, DesignEvidence, InteractionObservation } from '../design-evidence/types.js'
import { coreTranslator } from '../i18n/index.js'
import { canonicalCatalogPageIds } from './claim-catalog.js'
import {
  CATALOG_COMPONENT_TYPES,
  buildCanonicalComponentCatalog,
  canonicalComponentEvidenceSample,
  canonicalComponentRecipeStyles,
  canonicalComponentRecipeTokenRefs,
  canonicalComponentSharedTokenRefs,
  canonicalComponentVariant,
  canonicalRepresentativeComponents,
  isActionableComponentPattern,
} from './component-catalog.js'
import { isSurfaceEvidenceOwner, surfaceEvidenceStrategy, surfaceEvidenceTokenRefs } from './surface-evidence.js'
import type { SurfaceEvidenceOwner } from './surface-evidence.js'
import type {
  ComponentRecipe,
  ComponentRecipeRestriction,
  ComponentRecipeUseWhen,
  Confidence,
  DesignClaim,
  DesignClaimAssertion,
  DesignProfile,
  DesignTransferGrammar,
  PrioritizedDesignRule,
  StyleCoordinate,
  TransferRuleCategory,
} from './types.js'

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function stable(values: readonly string[], limit = Number.POSITIVE_INFINITY): string[] {
  return unique(values.filter(Boolean)).sort().slice(0, limit)
}

function baseReusableClaim(claim: DesignClaim): boolean {
  // Foundation catalog claims receive high confidence only when their combined
  // evidence spans multiple canonical URLs. Individual assertions can remain
  // instance-scoped because each assertion describes one observed owner.
  return claim.source !== 'unavailable' && claim.confidence === 'high' && claim.evidence.length > 0
}

type EvidenceTokenOwner =
  DesignEvidence['sections'][number] | DesignEvidence['components'][number] | DesignEvidence['layoutNodes'][number]

interface CanonicalFoundationScope {
  urls: string[]
  urlByPageId: Map<string, string>
  sections: DesignEvidence['sections']
  components: DesignEvidence['components']
  layoutNodes: DesignEvidence['layoutNodes']
}

function canonicalFoundationScope(evidence: DesignEvidence): CanonicalFoundationScope {
  const pageIds = canonicalCatalogPageIds(evidence)
  const canonicalPages = evidence.pages.filter((page) => pageIds.has(page.id))
  const urlByPageId = new Map(canonicalPages.map((page) => [page.id, evidencePageRouteIdentity(page)]))
  const sections = evidence.sections.filter((section) => pageIds.has(section.pageId))
  const sectionIds = new Set(sections.map((section) => section.id))
  return {
    urls: stable(canonicalPages.map(evidencePageRouteIdentity)),
    urlByPageId,
    sections,
    components: evidence.components.filter(
      (component) => pageIds.has(component.pageId) && sectionIds.has(component.sectionId),
    ),
    layoutNodes: evidence.layoutNodes.filter((node) => pageIds.has(node.pageId) && sectionIds.has(node.sectionId)),
  }
}

function foundationOwners(
  dimension: Exclude<StyleCoordinate['dimension'], 'composition'>,
  scope: CanonicalFoundationScope,
): EvidenceTokenOwner[] {
  if (dimension === 'color') return [...scope.sections, ...scope.components]
  if (dimension === 'typography') {
    return scope.layoutNodes.filter(
      (node) => node.observedTypography || node.tokenRefs.some((ref) => ref.startsWith('typography.')),
    )
  }
  if (dimension === 'shape') return scope.components
  if (dimension === 'density') return scope.sections
  return scope.sections.filter(isSurfaceEvidenceOwner)
}

function sharedFoundationTokenRefs(
  dimension: Exclude<StyleCoordinate['dimension'], 'composition'>,
  evidence: DesignEvidence,
  prefixes: readonly string[],
): string[] {
  const scope = canonicalFoundationScope(evidence)
  if (scope.urls.length < 2) return []
  const pageRefs = new Map<string, Set<string>>()
  for (const owner of foundationOwners(dimension, scope)) {
    const pageUrl = scope.urlByPageId.get(owner.pageId)
    if (!pageUrl) continue
    const refs = pageRefs.get(pageUrl) || new Set<string>()
    const ownerRefs =
      dimension === 'surface'
        ? surfaceEvidenceTokenRefs(owner as SurfaceEvidenceOwner, evidence.tokens)
        : owner.tokenRefs.filter((ref) => prefixes.some((prefix) => ref.startsWith(prefix)))
    ownerRefs.forEach((ref) => refs.add(ref))
    pageRefs.set(pageUrl, refs)
  }
  const requiredPages = Math.ceil(scope.urls.length * 0.75)
  const counts = new Map<string, number>()
  for (const refs of pageRefs.values()) {
    for (const ref of refs) counts.set(ref, (counts.get(ref) || 0) + 1)
  }
  return stable([...counts.entries()].flatMap(([ref, count]) => (count >= requiredPages ? [ref] : [])))
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function cssLengthSortValue(value: string): number {
  const match = value.trim().match(/^(-?\d*\.?\d+)(px|rem|em)?$/i)
  if (!match) return Number.POSITIVE_INFINITY
  const amount = Number.parseFloat(match[1])
  return ['rem', 'em'].includes((match[2] || '').toLowerCase()) ? amount * 16 : amount
}

function consistentContainerWidths(evidence: DesignEvidence): boolean {
  const scope = canonicalFoundationScope(evidence)
  if (scope.urls.length < 2) return false
  const widthsByUrl = new Map<string, number[]>()
  for (const section of scope.sections) {
    const url = scope.urlByPageId.get(section.pageId)
    if (!url) continue
    const widths = widthsByUrl.get(url) || []
    widths.push(section.rect.width)
    widthsByUrl.set(url, widths)
  }
  const pageMedians = [...widthsByUrl.values()].map((widths) => median(widths))
  if (pageMedians.length === 0) return false
  const center = median(pageMedians)
  return pageMedians.filter((width) => Math.abs(width - center) <= 0.12).length / scope.urls.length >= 0.75
}

function consistentSurfaceStrategy(evidence: DesignEvidence): boolean {
  const scope = canonicalFoundationScope(evidence)
  if (scope.urls.length < 2) return false
  const strategiesByUrl = new Map<string, Map<string, number>>()
  for (const owner of foundationOwners('surface', scope)) {
    const url = scope.urlByPageId.get(owner.pageId)
    if (!url) continue
    const strategies = strategiesByUrl.get(url) || new Map<string, number>()
    const strategy = surfaceEvidenceStrategy(owner as SurfaceEvidenceOwner)
    strategies.set(strategy, (strategies.get(strategy) || 0) + 1)
    strategiesByUrl.set(url, strategies)
  }
  const labels = [...strategiesByUrl.values()].map(
    (strategies) =>
      [...strategies.entries()].sort(
        (first, second) => second[1] - first[1] || first[0].localeCompare(second[0]),
      )[0][0],
  )
  if (labels.length === 0) return false
  const counts = new Map<string, number>()
  labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1))
  return Math.max(...counts.values()) / scope.urls.length >= 0.75
}

function isReusableFoundation(
  dimension: StyleCoordinate['dimension'],
  claim: DesignClaim,
  evidence: DesignEvidence,
): boolean {
  if (!baseReusableClaim(claim)) return false
  if (dimension === 'composition') return consistentContainerWidths(evidence)
  const claimRefs = new Set(claim.tokenRefs || [])
  if (dimension === 'surface') {
    const sharedRefs = sharedFoundationTokenRefs('surface', evidence, ['border.', 'shadow.', 'color.'])
    return consistentSurfaceStrategy(evidence) && sharedRefs.some((ref) => claimRefs.has(ref))
  }
  const prefixes: Record<Exclude<StyleCoordinate['dimension'], 'composition' | 'surface'>, string[]> = {
    color: ['color.'],
    typography: ['typography.'],
    shape: ['radius.'],
    density: ['spacing.'],
  }
  const sharedRefs = sharedFoundationTokenRefs(dimension, evidence, prefixes[dimension])
  const citedSharedRefs = sharedRefs.filter((ref) => claimRefs.has(ref))
  if (dimension === 'color') return citedSharedRefs.length >= 2
  if (dimension === 'typography') {
    return (
      citedSharedRefs.some(
        (ref) => ref.startsWith('typography.font-stack.') || ref.startsWith('typography.font-family.'),
      ) &&
      citedSharedRefs.some(
        (ref) => ref.startsWith('typography.font-size.') || ref.startsWith('typography.font-weight.'),
      )
    )
  }
  if (dimension === 'density') return citedSharedRefs.length >= 2
  return citedSharedRefs.length > 0
}

function rule(
  category: TransferRuleCategory,
  claim: DesignClaim,
  foundation?: { dimension: StyleCoordinate['dimension']; evidence: DesignEvidence },
): PrioritizedDesignRule {
  return {
    priority: foundation
      ? isReusableFoundation(foundation.dimension, claim, foundation.evidence)
        ? 'P0'
        : 'P2'
      : baseReusableClaim(claim)
        ? 'P0'
        : 'P2',
    category,
    claim: structuredClone(claim),
  }
}

function claimKey(claim: DesignClaim): string {
  return claim.catalogId || JSON.stringify([claim.statement, claim.implementation])
}

function deduplicateRules(rules: PrioritizedDesignRule[]): PrioritizedDesignRule[] {
  const seen = new Set<string>()
  return rules.filter((item) => {
    const key = claimKey(item.claim)
    if (seen.has(key) || item.claim.source === 'unavailable') return false
    seen.add(key)
    return true
  })
}

function withFoundationGuidance(
  category: TransferRuleCategory,
  source: DesignClaim,
  tokens: DesignToken,
  language: 'en' | 'zh-CN',
  evidence: DesignEvidence,
): DesignClaim {
  const t = coreTranslator(language, 'transferGrammar.foundation')
  if (source.source === 'unavailable') return structuredClone(source)
  const sourceRefs = source.tokenRefs || []
  const valuesFor = (refs: readonly string[]) =>
    refs.flatMap((ref) => {
      const value = resolveDesignTokenRef(tokens, ref)
      return value ? [value] : []
    })
  const reusableRefs = (
    dimension: Exclude<StyleCoordinate['dimension'], 'composition'>,
    prefixes: readonly string[],
  ) => {
    const shared = new Set(sharedFoundationTokenRefs(dimension, evidence, prefixes))
    const citedShared = sourceRefs.filter((ref) => shared.has(ref))
    return shared.size > 0 ? citedShared : sourceRefs.filter((ref) => prefixes.some((prefix) => ref.startsWith(prefix)))
  }
  if (category === 'color') {
    const supported = new Set(reusableRefs('color', ['color.']))
    const semanticRefs = ['background', 'surface', 'foreground', 'muted-foreground', 'primary', 'accent', 'border']
      .map((name) => `color.${name}`)
      .filter((ref) => supported.has(ref))
    const refs = semanticRefs.length > 0 ? semanticRefs : [...supported].slice(0, 6)
    const semanticRoleKeys: Record<string, string> = {
      'color.background': 'background',
      'color.surface': 'surface',
      'color.foreground': 'foreground',
      'color.muted-foreground': 'mutedForeground',
      'color.primary': 'primary',
      'color.accent': 'accent',
      'color.border': 'border',
    }
    const roles = refs.map((ref) => {
      const roleKey = semanticRoleKeys[ref]
      return roleKey ? t(`colorRoles.${roleKey}`) : t('observedColorRole', { ref })
    })
    return {
      ...structuredClone(source),
      statement: t('colorStatement', { roles: roles.join(t('listSeparator')) }),
      implementation: t('colorImplementation'),
      tokenRefs: refs,
    }
  }
  if (category === 'typography') {
    const typographyRefs = reusableRefs('typography', ['typography.'])
    const stackRefs = typographyRefs
      .filter((ref) => ref.startsWith('typography.font-stack.') || ref.startsWith('typography.font-family.'))
      .slice(0, 1)
    const sizeRefs = typographyRefs.filter((ref) => ref.startsWith('typography.font-size.')).slice(0, 8)
    const weightRefs = typographyRefs.filter((ref) => ref.startsWith('typography.font-weight.')).slice(0, 6)
    const stacks = valuesFor(stackRefs)
    const sizes = valuesFor(sizeRefs)
    const weights = valuesFor(weightRefs)
    return {
      ...structuredClone(source),
      statement: t('typographyStatement', {
        stacks: stacks.join(', '),
        sizes: sizes.join(', '),
        weights: weights.join(', '),
      }),
      implementation: t('typographyImplementation'),
      tokenRefs: [...stackRefs, ...sizeRefs, ...weightRefs],
    }
  }
  if (category === 'shape') {
    const radiusRefs = reusableRefs('shape', ['radius.']).slice(0, 10)
    const observedRadii = valuesFor(radiusRefs)
    const ordinary = observedRadii.filter((value) => {
      if (value.includes('%')) return false
      const maximum = Math.max(0, ...[...value.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0])))
      return maximum < 64
    })
    const special = observedRadii.filter((value) => !ordinary.includes(value))
    const canonicalPageIds = canonicalCatalogPageIds(evidence)
    const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
    const hasSpecialComponentShape = evidence.components.some((component) => {
      if (!canonicalPageIds.has(component.pageId)) return false
      const page = pageById.get(component.pageId)
      const pageHeight = page?.contentHeight || page?.viewportHeight
      const heightPx = pageHeight ? component.rect.height * pageHeight : undefined
      return isPillRadius(component.styles, { heightPx })
    })
    const specialShapeSummary =
      special.length > 0
        ? t('specialShapeValues', { values: special.join(', ') })
        : hasSpecialComponentShape
          ? t('specialShapeObserved')
          : t('specialShapeNotObserved')
    return {
      ...structuredClone(source),
      statement:
        ordinary.length > 0
          ? t('shapeStatement', {
              ordinary: ordinary.join(', '),
              special: specialShapeSummary,
            })
          : t('shapeWithoutSharedRadiusStatement', { special: specialShapeSummary }),
      implementation: t('shapeImplementation'),
      tokenRefs: radiusRefs,
    }
  }
  if (category === 'surface') {
    if (foundationOwners('surface', canonicalFoundationScope(evidence)).length === 0) {
      return structuredClone(source)
    }
    const counts = source.assertions?.find((assertion) => assertion.property === 'observed-surface-counts')?.value
    const values = Array.isArray(counts) ? counts : []
    const parsed = Object.fromEntries(
      values.flatMap((value) => {
        const [key, count] = String(value).split(':')
        return key && count ? [[key, Number(count)]] : []
      }),
    )
    const bordered = parsed.bordered || 0
    const shadowed = parsed.shadowed || 0
    const strategy = bordered > 0 && shadowed > 0 ? 'mixed' : bordered > 0 ? 'border' : shadowed > 0 ? 'shadow' : 'flat'
    const refs = reusableRefs('surface', ['border.', 'shadow.', 'color.']).slice(0, 12)
    return {
      ...structuredClone(source),
      statement: t('surfaceStatement', {
        count: parsed.owners || source.evidence.length,
        bordered,
        shadowed,
        strategy: t(`surfaceStrategies.${strategy}`),
      }),
      implementation: t(`surfaceImplementations.${strategy}`),
      tokenRefs: refs,
    }
  }
  if (category === 'density') {
    const ranked = reusableRefs('density', ['spacing.'])
      .flatMap((ref) => {
        const value = resolveDesignTokenRef(tokens, ref)
        return value ? [{ value, ref, count: tokens.usageCount?.[`spacing:${value}`] || 0 }] : []
      })
      .sort(
        (first, second) => second.count - first.count || sourceRefs.indexOf(first.ref) - sourceRefs.indexOf(second.ref),
      )
      .slice(0, 6)
      .sort(
        (first, second) =>
          cssLengthSortValue(first.value) - cssLengthSortValue(second.value) || first.value.localeCompare(second.value),
      )
    return {
      ...structuredClone(source),
      statement: t('densityStatement', { values: ranked.map((item) => item.value).join(', ') }),
      implementation: t('densityImplementation'),
      tokenRefs: ranked.map((item) => item.ref),
    }
  }
  return structuredClone(source)
}

function useWhen(component: string, variant: string, pattern: ComponentVariantPattern): ComponentRecipeUseWhen {
  if (component === 'button')
    return Object.entries(pattern.roleCounts || {}).some(
      ([role, count]) => role === 'primary-action' && count / Math.max(pattern.styleObservationCount || 0, 1) >= 0.8,
    )
      ? 'primary-action'
      : 'action'
  if (component === 'input') {
    return pattern.semanticIdentities?.includes('search') || pattern.usageContexts?.includes('search')
      ? 'search'
      : 'text-entry'
  }
  if (component === 'card') return 'content-group'
  if (component === 'navigation') return 'navigation'
  if (component === 'tab') return 'tab-navigation'
  if (component === 'list') return 'content-collection'
  if (component === 'table') return 'structured-data'
  if (component === 'modal') return 'overlay-dialog'
  if (component === 'status') return 'status-feedback'
  return 'specialized'
}

function recipeRestrictions(component: string, components: ComponentEvidence[]): ComponentRecipeRestriction[] {
  const restrictions: ComponentRecipeRestriction[] = ['keep-variant-scope']
  if (components.some((item) => isPillRadius(item.styles))) restrictions.push('do-not-globalize-special-shape')
  if (component === 'card' || component === 'modal') restrictions.push('do-not-promote-overlay-elevation')
  if (components.every((item) => item.stateRefs.length === 0)) restrictions.push('do-not-invent-unobserved-state')
  if (!CATALOG_COMPONENT_TYPES.has(component as ComponentVariantPattern['type'])) {
    restrictions.push('do-not-promote-local-layout')
  }
  return unique(restrictions)
}

function selectBalancedLocalRules(rules: PrioritizedDesignRule[], limit: number): PrioritizedDesignRule[] {
  type LocalRuleLane = TransferRuleCategory | 'motion'
  const laneFor = (item: PrioritizedDesignRule): LocalRuleLane =>
    item.category === 'interaction' &&
    item.claim.assertions?.some(
      (assertion) => assertion.target === 'motion' || assertion.property === 'transition-metadata-observed',
    )
      ? 'motion'
      : item.category
  const categoryOrder: LocalRuleLane[] = [
    'typography',
    'shape',
    'surface',
    'density',
    'color',
    'interaction',
    'motion',
    'responsive',
    'composition',
  ]
  const buckets = new Map(
    categoryOrder.map((category) => [category, rules.filter((item) => laneFor(item) === category)]),
  )
  const selected = new Set<string>()
  let depth = 0

  while (selected.size < limit) {
    let added = false
    for (const category of categoryOrder) {
      const item = buckets.get(category)?.[depth]
      if (!item) continue
      selected.add(claimKey(item.claim))
      added = true
      if (selected.size >= limit) break
    }
    if (!added) break
    depth += 1
  }

  return rules.filter((item) => selected.has(claimKey(item.claim))).slice(0, limit)
}

function identityConfidence(components: ComponentEvidence[], evidence: DesignEvidence): Confidence {
  const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const urls = new Set(components.map((component) => pageById.get(component.pageId)?.url).filter(Boolean))
  const average = components.reduce((total, component) => total + component.confidence, 0) / components.length
  return (urls.size >= 2 || components.length >= 3) && average >= 0.9 ? 'high' : 'medium'
}

function recipeConfidence(pattern: ComponentVariantPattern): Confidence {
  const reuse = resolveComponentReuseEvidence(pattern)
  if (reuse.reuseConfidence >= 0.8) return 'high'
  return reuse.reuseConfidence >= 0.55 ? 'medium' : 'low'
}

function interactionClaims(
  components: ComponentEvidence[],
  evidence: DesignEvidence,
  language: 'en' | 'zh-CN',
): DesignClaim[] {
  const t = coreTranslator(language, 'transferGrammar')
  const componentIds = new Set(components.map((component) => component.id))
  const stateIds = new Set(components.flatMap((component) => component.stateRefs))
  const observations = evidence.interactionObservations.filter(
    (observation) => stateIds.has(observation.id) && componentIds.has(observation.targetId),
  )
  const groups = new Map<string, InteractionObservation[]>()
  for (const observation of observations) {
    const key = JSON.stringify([observation.driver, stable(observation.changedProperties)])
    const items = groups.get(key) || []
    items.push(observation)
    groups.set(key, items)
  }
  return [...groups.values()].slice(0, 3).map((items) => {
    const representative = items[0]
    const evidenceIds = items.map((item) => item.id)
    return {
      statement: t('stateStatement', {
        driver: representative.driver,
        properties: stable(representative.changedProperties).join(', '),
      }),
      implementation: t('stateImplementation'),
      confidence: items.some((item) => item.safety === 'safe-active')
        ? identityConfidence(components, evidence)
        : 'medium',
      evidence: evidenceIds.map((evidenceId) => ({ evidenceId, note: t('evidenceNote') })),
      assertions: representative.changedProperties.map((property): DesignClaimAssertion => ({
        kind: 'interaction',
        target: representative.driver,
        predicate: 'property-change',
        scope: 'page',
        evidenceIds,
        property,
      })),
      source: 'deterministic-catalog',
    }
  })
}

function buildRecipes(evidence: DesignEvidence, language: 'en' | 'zh-CN'): ComponentRecipe[] {
  const t = coreTranslator(language, 'transferGrammar')
  const patterns = buildCanonicalComponentCatalog(evidence)

  return patterns
    .map((pattern) => {
      const items = canonicalRepresentativeComponents(pattern, evidence)
      return { pattern, items, evidenceSample: canonicalComponentEvidenceSample(pattern, evidence) }
    })
    .filter((group) => group.items.length > 0)
    .sort(
      (first, second) =>
        second.items.length - first.items.length || first.pattern.name.localeCompare(second.pattern.name),
    )
    .map(({ pattern, items, evidenceSample }) => {
      const component = pattern.type
      const variant = canonicalComponentVariant(pattern)
      const confidence = recipeConfidence(pattern)
      const reuse = resolveComponentReuseEvidence(pattern)
      const sourceIds = evidenceSample.map((item) => item.id)
      const observedStyles = canonicalComponentRecipeStyles(pattern.styles, pattern)
      const allSharedTokenRefs = canonicalComponentRecipeTokenRefs(
        canonicalComponentSharedTokenRefs(items),
        observedStyles,
      )
      const sharedTokenRefs = allSharedTokenRefs.slice(0, 10)
      const priority: ComponentRecipe['priority'] =
        isReusableComponentPattern(pattern) && isActionableComponentPattern(pattern, allSharedTokenRefs) ? 'P1' : 'P2'
      const observed: DesignClaim = {
        statement: t(
          component === 'status'
            ? items.length === 1
              ? 'statusRecipeSingleStatement'
              : 'statusRecipeStatement'
            : items.length === 1
              ? 'recipeSingleStatement'
              : 'recipeStatement',
          {
            count: items.length,
            component,
            variant,
          },
        ),
        implementation: t('recipeImplementation'),
        confidence,
        evidence: sourceIds.map((evidenceId) => ({ evidenceId, note: t('evidenceNote') })),
        tokenRefs: sharedTokenRefs,
        assertions: evidenceSample.flatMap((item): DesignClaimAssertion[] => [
          {
            kind: 'component',
            target: component,
            predicate: 'present',
            scope: 'instance',
            evidenceIds: [item.id],
          },
          {
            kind: 'component',
            target: component,
            predicate: 'variant',
            scope: 'instance',
            evidenceIds: [item.id],
            value: variant,
          },
        ]),
        source: 'deterministic-catalog',
      }
      return {
        component,
        variant,
        priority,
        useWhen: useWhen(component, variant, pattern),
        observed,
        observedStyles,
        states: interactionClaims(items, evidence, language),
        // Responsive evidence currently identifies sections across viewports, not component instances. Keep those
        // facts in the responsive section instead of presenting enclosing-section changes as component behavior.
        responsive: [],
        restrictions: recipeRestrictions(component, items),
        identityConfidence: pattern.confidence,
        reuseConfidence: reuse.reuseConfidence,
        reuseScope: reuse.reuseScope,
        matchingStyleInstances: reuse.styleObservationCount,
        pageCount: reuse.pageCount,
        confidence,
        sourceInstances: items.length,
      }
    })
    .sort(
      (first, second) =>
        (first.priority === second.priority ? 0 : first.priority === 'P1' ? -1 : 1) ||
        second.sourceInstances - first.sourceInstances ||
        `${first.component}-${first.variant}`.localeCompare(`${second.component}-${second.variant}`),
    )
}

function coordinate(
  dimension: StyleCoordinate['dimension'],
  claim: DesignClaim,
  evidence: DesignEvidence,
): StyleCoordinate | null {
  if (claim.source === 'unavailable') return null
  return {
    dimension,
    priority: isReusableFoundation(dimension, claim, evidence) ? 'P0' : 'P2',
    claim: structuredClone(claim),
  }
}

export function buildDesignTransferGrammar(
  profile: DesignProfile,
  evidence: DesignEvidence,
  tokens: DesignToken,
): DesignTransferGrammar {
  const foundations = {
    color: withFoundationGuidance('color', profile.visualLanguage.color, tokens, profile.language, evidence),
    typography: withFoundationGuidance(
      'typography',
      profile.visualLanguage.typography,
      tokens,
      profile.language,
      evidence,
    ),
    shape: withFoundationGuidance('shape', profile.visualLanguage.shape, tokens, profile.language, evidence),
    surface: withFoundationGuidance('surface', profile.visualLanguage.surfaces, tokens, profile.language, evidence),
    density: withFoundationGuidance(
      'density',
      profile.composition.densityAndWhitespace,
      tokens,
      profile.language,
      evidence,
    ),
    composition: structuredClone(profile.composition.containerStrategy),
  }
  const foundationCandidates = deduplicateRules([
    rule('color', foundations.color, { dimension: 'color', evidence }),
    rule('typography', foundations.typography, { dimension: 'typography', evidence }),
    rule('shape', foundations.shape, { dimension: 'shape', evidence }),
    rule('surface', foundations.surface, { dimension: 'surface', evidence }),
    rule('density', foundations.density, { dimension: 'density', evidence }),
    rule('composition', foundations.composition, { dimension: 'composition', evidence }),
    rule('composition', profile.composition.rhythm),
    ...profile.transferRules.preserve.map((claim) => rule('composition', claim)),
  ])
  const coordinates = [
    coordinate('color', foundations.color, evidence),
    coordinate('typography', foundations.typography, evidence),
    coordinate('shape', foundations.shape, evidence),
    coordinate('surface', foundations.surface, evidence),
    coordinate('density', foundations.density, evidence),
    coordinate('composition', foundations.composition, evidence),
  ].filter((item): item is StyleCoordinate => item !== null)
  const localCandidates = selectBalancedLocalRules(
    deduplicateRules([
      ...foundationCandidates.filter((item) => item.priority === 'P2'),
      ...profile.interactionLanguage.primaryDrivers.map((claim) => rule('interaction', claim)),
      ...(profile.visualLanguage.motion ? [rule('interaction', profile.visualLanguage.motion)] : []),
      ...profile.transferRules.adapt.map((claim) => rule('responsive', claim)),
      ...(profile.visualLanguage.imagery ? [rule('composition', profile.visualLanguage.imagery)] : []),
      ...profile.sectionGrammar.flatMap((section) =>
        [...section.composition, ...section.contentRhythm, ...section.transitionToNext].map((claim) =>
          rule('composition', claim),
        ),
      ),
    ]),
    12,
  )

  return {
    schemaVersion: '1',
    coreRules: foundationCandidates.filter((item) => item.priority === 'P0').slice(0, 8),
    styleCoordinates: coordinates,
    componentRecipes: buildRecipes(evidence, profile.language),
    localRules: localCandidates.map((item) => ({ ...item, priority: 'P2' })),
  }
}
