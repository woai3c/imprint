import type { DesignToken } from '../analyzer/types.js'
import { evidencePageRouteIdentity } from '../analyzer/url-identity.js'
import { sanitizeUrlForPersistence } from '../analyzer/url-privacy.js'
import { hasSevereHorizontalOverflow } from '../design-evidence/reliability.js'
import {
  displayedResponsiveChangeType,
  hasConsistentResponsiveSectionIdentity,
  usefulResponsiveChanges,
} from '../design-evidence/responsive-reliability.js'
import { resolveDesignTokenRef } from '../design-evidence/token-reference.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { coreTranslator } from '../i18n/index.js'
import { selectBalancedComponentDetails } from './component-catalog.js'
import { formatRecipeVariant } from './component-recipe-label.js'
import type { DesignClaim, DesignProfile } from './types.js'
import type { ComponentRecipe, ComponentRecipeRestriction, PrioritizedDesignRule, StyleCoordinate } from './types.js'

export function generateDesignProfileJson(profile: DesignProfile): string {
  return JSON.stringify(profile, null, 2)
}

/** Agent-facing briefs share the same useful, scoped facts as the DESIGN.md evidence projection. */
export function generateScopedResponsiveGuidance(evidence: DesignEvidence, language: 'en' | 'zh-CN'): string[] {
  const t = coreTranslator(language, 'profileExport')
  const sections = new Map(evidence.sections.map((section) => [section.id, section]))
  const pages = new Map(evidence.pages.map((page) => [page.id, page]))
  const facts = new Map<string, string>()
  for (const observation of evidence.responsiveObservations) {
    if (!hasConsistentResponsiveSectionIdentity(observation, evidence)) continue
    const section = sections.get(observation.sectionId)
    const page = section && pages.get(section.pageId)
    if (
      !page ||
      observation.evidenceRefs.some((id) => {
        const owner = sections.get(id)
        const capture = owner && pages.get(owner.pageId)
        return capture && (capture.health?.evidenceEligible === false || hasSevereHorizontalOverflow(capture))
      })
    )
      continue
    const changes = usefulResponsiveChanges(observation, section?.role).sort(([a], [b]) => a.localeCompare(b))
    if (!changes.length) continue
    const change = displayedResponsiveChangeType(
      observation.changeType,
      changes.map(([property]) => property),
    )
    const key = JSON.stringify([
      evidencePageRouteIdentity(page),
      observation.fromViewport,
      observation.toViewport,
      section?.role,
      change,
      changes,
    ])
    facts.set(
      key,
      t('transfer.responsiveFact', {
        scope: `${sanitizeUrlForPersistence(page.url)} · ${page.routeId || page.id}`,
        role: translatedTerm(section?.role || 'content', t),
        from: translatedTerm(observation.fromViewport, t),
        to: translatedTerm(observation.toViewport, t),
        change: translatedTerm(change, t),
        properties: changes
          .map(([property, value]) =>
            property === 'sequenceIndex'
              ? coreTranslator(language, 'designEvidence.responsive')('relativeOrderChanged')
              : `${translatedTerm(property, t)}: ${value.from ?? ''} → ${value.to ?? ''}`,
          )
          .join('; '),
      }),
    )
  }
  return [...facts].sort(([a], [b]) => a.localeCompare(b)).map(([, line]) => line)
}

function uniqueUncertainties(profile: DesignProfile): DesignProfile['uncertainties'] {
  const seen = new Set<string>()
  let hasOverflowUncertainty = false
  return profile.uncertainties.filter((item) => {
    const text = `${item.topic} ${item.reason}`
    if (/^(?:确定性矛盾检查|Deterministic contradiction check)$/i.test(item.topic.trim())) return false
    if (/tokenFacts|tokenRefs/i.test(text)) return false
    const isOverflowUncertainty = /horizontal[- ]overflow|横向溢出|水平溢出/i.test(text)
    if (isOverflowUncertainty && hasOverflowUncertainty) return false
    if (isOverflowUncertainty) hasOverflowUncertainty = true
    const key = `${item.topic.trim()}|${item.reason.replace(/\s+/g, ' ').trim()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function claimEvidenceIds(claim: DesignClaim): string[] {
  return [
    ...new Set([
      ...claim.evidence.map((reference) => reference.evidenceId),
      ...(claim.assertions?.flatMap((assertion) => assertion.evidenceIds) || []),
    ]),
  ]
}

function claimEvidenceCount(claim: DesignClaim): number {
  return claimEvidenceIds(claim).length
}

function scopeUrl(url: string): string {
  const sanitized = sanitizeUrlForPersistence(url)
  try {
    const parsed = new URL(sanitized)
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/'
    return `${parsed.host}${pathname}`
  } catch {
    return sanitized
  }
}

function buildClaimScopeFormatter(
  evidence: DesignEvidence | undefined,
  t: ReturnType<typeof coreTranslator>,
  maximumVisibleScopes = 2,
): (claim: DesignClaim) => string | null {
  if (!evidence) return () => null

  const pages = new Map(evidence.pages.map((page) => [page.id, page]))
  const routesByPublicUrl = new Map<string, Set<string>>()
  for (const page of evidence.pages) {
    const publicUrl = scopeUrl(page.url)
    const routes = routesByPublicUrl.get(publicUrl) || new Set<string>()
    routes.add(evidencePageRouteIdentity(page))
    routesByPublicUrl.set(publicUrl, routes)
  }
  const pageIds = new Map<string, string>()
  const add = (evidenceId: string, pageId: string): void => {
    pageIds.set(evidenceId, pageId)
  }
  for (const page of evidence.pages) {
    add(page.id, page.id)
    page.images.forEach((image) => add(image.id, page.id))
  }
  evidence.sections.forEach((section) => add(section.id, section.pageId))
  evidence.components.forEach((component) => add(component.id, component.pageId))
  evidence.layoutNodes.forEach((node) => add(node.id, node.pageId))
  evidence.pseudoElements?.forEach((pseudo) => add(pseudo.id, pseudo.pageId))
  evidence.interactionObservations.forEach((observation) => add(observation.id, observation.pageId))
  evidence.mediaLayers.forEach((layer) => add(layer.id, layer.pageId))
  evidence.topology.globalLayers.forEach((layer) => add(layer.id, layer.pageId))
  const sectionPageIds = new Map(evidence.sections.map((section) => [section.id, section.pageId]))
  evidence.responsiveObservations.forEach((observation) => {
    const pageId = sectionPageIds.get(observation.sectionId)
    if (pageId) add(observation.id, pageId)
  })

  return (claim) => {
    const scopesByRoute = new Map<string, { label: string; viewports: Set<string> }>()
    for (const evidenceId of claimEvidenceIds(claim)) {
      const page = pages.get(pageIds.get(evidenceId) || '')
      if (!page) continue
      const routeIdentity = evidencePageRouteIdentity(page)
      const publicUrl = scopeUrl(page.url)
      const label =
        (routesByPublicUrl.get(publicUrl)?.size || 0) > 1 && page.routeId ? `${publicUrl} · ${page.routeId}` : publicUrl
      const scope = scopesByRoute.get(routeIdentity) || { label, viewports: new Set<string>() }
      scope.viewports.add(page.viewport)
      scopesByRoute.set(routeIdentity, scope)
    }
    const scopes = [...scopesByRoute.values()]
      .sort((first, second) => first.label.localeCompare(second.label))
      .map(
        ({ label, viewports }) =>
          `${label} · ${[...viewports]
            .sort()
            .map((viewport) => translatedTerm(viewport, t))
            .join('/')}`,
      )
    if (scopes.length === 0) return null
    const visible = scopes.slice(0, maximumVisibleScopes)
    if (scopes.length > visible.length) {
      visible.push(t('scopeMore', { count: scopes.length - visible.length }))
    }
    return visible.join(t('scopeSeparator'))
  }
}

function isSectionLayoutClaim(claim: DesignClaim): boolean {
  return Boolean(
    claim.assertions?.some((assertion) => assertion.kind === 'section' && assertion.predicate === 'layout-mode'),
  )
}

function sectionLayoutModes(claim: DesignClaim): string[] {
  return [
    ...new Set(
      claim.assertions
        ?.filter((assertion) => assertion.kind === 'section' && assertion.predicate === 'layout-mode')
        .flatMap((assertion) => {
          const values = Array.isArray(assertion.value) ? assertion.value : [assertion.value]
          return values.filter((value): value is string => typeof value === 'string' && value.length > 0)
        }) || [],
    ),
  ].sort()
}

function isExecutedInteractionClaim(claim: DesignClaim): boolean {
  return Boolean(
    claim.assertions?.some((assertion) => assertion.kind === 'interaction' && assertion.predicate === 'executed'),
  )
}

function hasClassifiedImagery(claim: DesignClaim): boolean {
  const roles =
    claim.assertions
      ?.filter((assertion) => assertion.target === 'imagery')
      .flatMap((assertion) => (Array.isArray(assertion.value) ? [assertion.value[1]] : [])) || []
  return roles.length === 0 || roles.some((role) => role !== 'unknown')
}

function translatedTerm(value: string, t: ReturnType<typeof coreTranslator>): string {
  const aliases: Record<string, string> = {
    'node.heading.fontSize': 'headingFontSize',
    'rect.height': 'height',
    'rect.width': 'width',
    'rect.x': 'horizontalPosition',
    'rect.y': 'verticalPosition',
  }
  return t(`terms.${aliases[value] || value}`, { defaultValue: value })
}

function formatClaimText(
  text: string,
  aliasRefs: ReadonlyMap<string, string>,
  t: ReturnType<typeof coreTranslator>,
): string {
  const protectedTranslations: string[] = []
  const protectTranslation = (value: string): string => {
    const marker = `\uE000${protectedTranslations.length}\uE001`
    protectedTranslations.push(value)
    return marker
  }
  let formatted = [...aliasRefs.entries()].reduce((value, [source, target]) => {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return value.replace(new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'g'), target)
  }, text)
  formatted = formatted.replace(
    /\bnode\.([a-z-]+)\.([a-zA-Z-]+)\b/g,
    (match: string, owner: string, property: string) => {
      const combined = translatedTerm(match, t)
      return protectTranslation(
        combined !== match
          ? combined
          : t('ownedProperty', {
              owner: translatedTerm(owner, t),
              property: translatedTerm(property, t),
            }),
      )
    },
  )
  formatted = formatted.replace(
    /\b(reflow|reorder|visibility|interaction|mixed|scale)(?=\s*(?:;|:|：|affecting\b|；|，))/g,
    (change) => protectTranslation(translatedTerm(change, t)),
  )
  const terms = [
    'rect.height',
    'rect.width',
    'rect.x',
    'rect.y',
    'childGridTemplateColumns',
    'gridTemplateColumns',
    'controlledVisibility',
    'controlledOpacity',
    'controlledDisplay',
    'controlledHidden',
    'backgroundColor',
    'backgroundImage',
    'textColor',
    'borderColor',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomRightRadius',
    'borderBottomLeftRadius',
    'topOffset',
    'maxWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'gap',
    'borderTop',
    'borderRight',
    'borderBottom',
    'borderLeft',
    'boxShadow',
    'overflowX',
    'overflowY',
    'scrollSnapType',
    'scrollSnapAlign',
    'horizontalPosition',
    'verticalPosition',
    'sequenceIndex',
    'ariaExpanded',
    'ariaSelected',
    'node.heading.fontSize',
    'layoutMode',
    'lineHeight',
    'fontSize',
    'heading',
    'body',
    'label',
    'metadata',
    'section',
    'card-group',
    'unknown',
    'primary-action',
    'feature-group',
    'safe-active',
    'decorative',
    'navigation',
    'combobox',
    'secondary',
    'rounded',
    'primary',
    'button',
    'desktop',
    'mobile',
    'header',
    'content',
    'footer',
    'table',
    'input',
    'action',
    'aside',
    'media',
    'hero',
    'sharp',
    'pill',
    'flow',
    'right',
    'full',
    'grid',
    'list',
    'card',
    'text',
    'icon',
    'image',
    'click',
    'tab',
    'modal',
    'status',
    'alert',
    'status-positive',
    'status-warning',
    'status-negative',
    'status-neutral',
    'delta-positive',
    'delta-warning',
    'delta-negative',
    'delta-neutral',
    'default',
    'outlined',
    'elevated',
    'flat',
    'search',
    'visibility',
    'interactionModel',
    'height',
    'width',
    'position',
    'order',
    'display',
  ]
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    formatted = formatted.replace(new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'g'), translatedTerm(term, t))
  }
  formatted = formatted.replace(/\uE000(\d+)\uE001/g, (marker, index: string) => {
    return protectedTranslations[Number(index)] ?? marker
  })
  formatted = formatted.replaceAll(', ', t('listSeparator')).replaceAll(' -> ', t('sequenceArrow'))
  formatted = formatted.replace(
    /\b(size change|visibility change|interaction change|order change)\s+changes?\b/gi,
    '$1',
  )
  let compact = formatted
  do {
    formatted = compact
    compact = formatted.replace(/([\p{Script=Han}])\s+([\p{Script=Han}])/gu, '$1$2')
  } while (compact !== formatted)
  return compact
}

type LabeledClaim = DesignClaim & { label?: string }

function mergeClaims(first: LabeledClaim, second: LabeledClaim): LabeledClaim {
  const evidence = [
    ...new Map([...first.evidence, ...second.evidence].map((reference) => [reference.evidenceId, reference])).values(),
  ]
  const assertions = [...(first.assertions || []), ...(second.assertions || [])]
  const uniqueAssertions = [...new Map(assertions.map((assertion) => [JSON.stringify(assertion), assertion])).values()]
  const confidenceRank: Record<DesignClaim['confidence'], number> = { low: 0, medium: 1, high: 2 }
  return {
    ...first,
    confidence:
      confidenceRank[first.confidence] <= confidenceRank[second.confidence] ? first.confidence : second.confidence,
    evidence,
    ...(first.tokenRefs || second.tokenRefs
      ? { tokenRefs: [...new Set([...(first.tokenRefs || []), ...(second.tokenRefs || [])])] }
      : {}),
    ...(uniqueAssertions.length > 0 ? { assertions: uniqueAssertions } : {}),
  }
}

function claimLines(
  title: string,
  claims: LabeledClaim[],
  t: ReturnType<typeof coreTranslator>,
  options: {
    formatText: (text: string) => string
    formatTokenRefs: (claim: DesignClaim) => string | null
    renderedClaimKeys: Set<string>
    scopeForClaim: (claim: DesignClaim) => string | null
  },
): string[] {
  const uniqueClaims = new Map<string, LabeledClaim>()
  for (const claim of claims) {
    if (claim.confidence === 'low') continue
    const key = claim.catalogId ? `catalog:${claim.catalogId}` : `statement:${claim.statement}`
    if (options.renderedClaimKeys.has(key)) continue
    const existing = uniqueClaims.get(key)
    uniqueClaims.set(key, existing ? mergeClaims(existing, claim) : claim)
  }
  uniqueClaims.forEach((_claim, key) => options.renderedClaimKeys.add(key))

  const visibleByPresentation = new Map<string, LabeledClaim>()
  for (const claim of uniqueClaims.values()) {
    const key = JSON.stringify([
      claim.label || '',
      options.formatText(claim.statement),
      options.scopeForClaim(claim) || '',
    ])
    const existing = visibleByPresentation.get(key)
    visibleByPresentation.set(key, existing ? mergeClaims(existing, claim) : claim)
  }
  const visible = [...visibleByPresentation.values()]
  if (visible.length === 0) return []

  return [
    `### ${title}`,
    '',
    ...visible.map((claim) => {
      const confidence = t(`confidence.${claim.confidence}`)
      const scope = options.scopeForClaim(claim)
      const metadata = scope
        ? t('factMetadataWithScope', { confidence, count: claimEvidenceCount(claim), scope })
        : t('factMetadata', { confidence, count: claimEvidenceCount(claim) })
      const statement = options.formatText(claim.statement)
      const tokenRefs = options.formatTokenRefs(claim)
      return [
        `- ${claim.label ? `**${claim.label}${t('labelSeparator')}** ` : ''}${statement} _(${metadata})_`,
        ...(tokenRefs ? [`  - ${t('relatedTokens')}${t('labelValueSeparator')}${tokenRefs}`] : []),
      ].join('\n')
    }),
    '',
  ]
}

interface ClaimExportContext {
  t: ReturnType<typeof coreTranslator>
  formatText: (text: string) => string
  formatTokenNames: (claim: DesignClaim) => string | null
  formatTokenRefs: (claim: DesignClaim) => string | null
  scopeForClaim: (claim: DesignClaim) => string | null
}

interface TransferExportContext extends ClaimExportContext {
  boundedImplementation: string
}

function createClaimExportContext(
  profile: DesignProfile,
  tokens?: DesignToken,
  publicColorNames: ReadonlyMap<string, string> = new Map(),
  evidence?: DesignEvidence,
): ClaimExportContext {
  const t = coreTranslator(profile.language, 'profileExport')
  const referenceTokens = evidence?.tokens || tokens
  const aliasRefs = new Map<string, string>()
  for (const [sourceName, publicName] of publicColorNames) {
    aliasRefs.set(`color.${sourceName}`, `color.${publicName}`)
  }
  const formatText = (text: string): string => formatClaimText(text, aliasRefs, t)
  const formatTokenRef = (ref: string): string | null => {
    const mapped = aliasRefs.get(ref) ?? ref
    if (!referenceTokens) return `\`${mapped}\``
    const directlyResolved = resolveDesignTokenRef(referenceTokens, ref)
    const sourceRef = [...aliasRefs.entries()].find(
      ([candidate, publicRef]) =>
        publicRef === mapped && referenceTokens.colors[candidate.slice('color.'.length)] !== undefined,
    )?.[0]
    const value = directlyResolved || (sourceRef ? resolveDesignTokenRef(referenceTokens, sourceRef) : null)
    return value ? `\`${mapped}\` (${value})` : null
  }
  const formatTokenRefs = (claim: DesignClaim): string | null => {
    const refs = claim.tokenRefs?.flatMap((ref) => {
      const formatted = formatTokenRef(ref)
      return formatted ? [formatted] : []
    })
    return refs?.length ? refs.join(t('listSeparator')) : null
  }
  const formatTokenNames = (claim: DesignClaim): string | null => {
    const refs = claim.tokenRefs?.flatMap((ref) => {
      const mapped = aliasRefs.get(ref) ?? ref
      return !referenceTokens || resolveDesignTokenRef(referenceTokens, ref) ? [`\`${mapped}\``] : []
    })
    return refs?.length ? refs.join(t('listSeparator')) : null
  }
  return {
    t,
    formatText,
    formatTokenNames,
    formatTokenRefs,
    scopeForClaim: buildClaimScopeFormatter(evidence, t),
  }
}

function createTransferExportContext(
  profile: DesignProfile,
  tokens?: DesignToken,
  publicColorNames: ReadonlyMap<string, string> = new Map(),
  evidence?: DesignEvidence,
): TransferExportContext {
  return {
    ...createClaimExportContext(profile, tokens, publicColorNames, evidence),
    boundedImplementation: coreTranslator(profile.language, 'designContext.catalog')('boundedImplementation'),
  }
}

function transferRuleLines(
  rule: PrioritizedDesignRule,
  context: TransferExportContext,
  options: { omitImplementation?: boolean } = {},
): string[] {
  const category = context.t(`transfer.categories.${rule.category}`)
  const scope = context.scopeForClaim(rule.claim)
  const confidence = context.t(`confidence.${rule.claim.confidence}`)
  const metadata = scope
    ? context.t('factMetadataWithScope', { confidence, count: claimEvidenceCount(rule.claim), scope })
    : context.t('factMetadata', { confidence, count: claimEvidenceCount(rule.claim) })
  const tokens = context.formatTokenRefs(rule.claim)
  return [
    `- **${category}${context.t('labelSeparator')}** ${context.formatText(rule.claim.statement)} _(${metadata})_`,
    ...(options.omitImplementation
      ? []
      : [
          `  - **${context.t('transfer.implementation')}${context.t('labelSeparator')}** ${context.formatText(rule.claim.implementation)}`,
        ]),
    ...(tokens ? [`  - **${context.t('relatedTokens')}${context.t('labelSeparator')}** ${tokens}`] : []),
  ]
}

function coordinateLine(coordinate: StyleCoordinate, context: TransferExportContext): string {
  return context.t('transfer.coordinateLine', {
    dimension: context.t(`transfer.categories.${coordinate.dimension}`),
    priority: context.t(`transfer.priorityLabels.${coordinate.priority}`),
  })
}

function recipeLabel(recipe: ComponentRecipe, context: TransferExportContext): string {
  const values = {
    component: translatedTerm(recipe.component, context.t),
    variant: formatRecipeVariant(recipe, {
      translateKnown: (term) => context.t(`terms.${term}`, { defaultValue: '' }) || null,
      translateFallback: (term) => translatedTerm(term, context.t),
      formatRadius: (value) => context.t('transfer.radiusVariant', { value }),
      separator: context.t('transfer.variantSeparator'),
    }),
    semanticIdentity: recipe.semanticIdentity
      ? context.t(`transfer.semanticIdentityValues.${recipe.semanticIdentity}`)
      : '',
    visualTreatment: recipe.visualTreatment
      ? context.t(`transfer.visualTreatmentValues.${recipe.visualTreatment}`)
      : '',
  }
  return recipe.semanticIdentity &&
    (recipe.semanticIdentity !== recipe.component || recipe.visualTreatment === 'button-like')
    ? context.t('transfer.semanticComponentTitle', values)
    : context.t('transfer.componentTitle', values)
}

const COMMON_RECIPE_RESTRICTIONS = new Set<ComponentRecipeRestriction>([
  'keep-variant-scope',
  'do-not-invent-unobserved-state',
])

function recipeLines(recipe: ComponentRecipe, context: TransferExportContext): string[] {
  const tokens = context.formatTokenNames(recipe.observed)
  const observedStyles = Object.entries(recipe.observedStyles || {})
    .map(
      ([property, value]) =>
        `\`${property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}: ${value}\``,
    )
    .join(context.t('listSeparator'))
  const specificRestrictions = recipe.restrictions.filter((restriction) => !COMMON_RECIPE_RESTRICTIONS.has(restriction))
  const semanticContract = [
    recipe.semanticIdentity
      ? context.t('transfer.semanticIdentity', {
          value: context.t(`transfer.semanticIdentityValues.${recipe.semanticIdentity}`),
        })
      : '',
    recipe.visualTreatment
      ? context.t('transfer.visualTreatment', {
          value: context.t(`transfer.visualTreatmentValues.${recipe.visualTreatment}`),
        })
      : '',
    recipe.usageContext
      ? context.t('transfer.usageContext', {
          value: context.t(`transfer.usageContextValues.${recipe.usageContext}`),
        })
      : '',
  ]
    .filter(Boolean)
    .join(context.t('listSeparator'))
  const semanticGuidance = recipe.semanticIdentity
    ? context.t(`transfer.semanticGuidanceValues.${recipe.semanticIdentity}`, { defaultValue: '' })
    : ''
  const result = [
    `#### ${recipeLabel(recipe, context)}`,
    '',
    `_${context.t('transfer.recipeEvidence', {
      count: recipe.matchingStyleInstances ?? recipe.sourceInstances,
      pages: recipe.pageCount ?? 1,
      identity: recipe.identityConfidence?.toFixed(2) ?? context.t(`confidence.${recipe.confidence}`),
      reuse: recipe.reuseConfidence?.toFixed(2) ?? context.t(`confidence.${recipe.confidence}`),
      scope: context.t(`transfer.reuseScopes.${recipe.reuseScope || 'isolated'}`),
    })}_`,
    '',
    `- **${context.t('transfer.useWhen')}${context.t('labelSeparator')}** ${context.t(`transfer.useWhenValues.${recipe.useWhen}`)}`,
    ...(semanticContract
      ? [
          `- **${context.t('transfer.semanticContract')}${context.t('labelSeparator')}** ${semanticContract}`,
          ...(semanticGuidance ? [`  - ${semanticGuidance}`] : []),
        ]
      : []),
    `- **${context.t('transfer.observedRecipe')}${context.t('labelSeparator')}** ${context.formatText(recipe.observed.statement)}`,
    ...(tokens ? [`  - **${context.t('relatedTokens')}${context.t('labelSeparator')}** ${tokens}`] : []),
    ...(observedStyles
      ? [`  - **${context.t('transfer.observedStyles')}${context.t('labelSeparator')}** ${observedStyles}`]
      : []),
  ]
  if (recipe.states.length > 0) {
    result.push(
      `- **${context.t('transfer.states')}${context.t('labelSeparator')}**`,
      ...recipe.states.map((claim) => `  - ${context.formatText(claim.statement)}`),
    )
  }
  if (recipe.responsive.length > 0) {
    result.push(
      `- **${context.t('transfer.responsive')}${context.t('labelSeparator')}**`,
      ...recipe.responsive.map((claim) => `  - ${context.formatText(claim.statement)}`),
    )
  }
  if (specificRestrictions.length > 0) {
    result.push(
      `- **${context.t('transfer.restrictions')}${context.t('labelSeparator')}**`,
      ...specificRestrictions.map((restriction) => `  - ${context.t(`transfer.restrictionValues.${restriction}`)}`),
    )
  }
  result.push('')
  return result
}

/** Interpret the existing grammar; never infer another set of rules from token presence or frequency. */
export function generateTransferUsageMarkdown(profile: DesignProfile): string {
  if (!profile.transferGrammar) return ''
  const t = coreTranslator(profile.language, 'profileExport.transfer')
  return [
    "## Do's and Don'ts",
    '',
    ...(['defaults', 'exceptions', 'unknown', 'attribution'] as const).map((key) => `- ${t(`usage.${key}`)}`),
    '',
  ].join('\n')
}

export function generateTransferOverviewMarkdown(
  profile: DesignProfile,
  tokens?: DesignToken,
  publicColorNames: ReadonlyMap<string, string> = new Map(),
  evidence?: DesignEvidence,
): string {
  const grammar = profile.transferGrammar
  if (!grammar) return ''
  const context = createTransferExportContext(profile, tokens, publicColorNames, evidence)
  const lines = [
    context.t('transfer.overviewHeading'),
    '',
    context.t('transfer.intro'),
    '',
    ...(['p0', 'p1', 'p2', 'brand', 'accessibility'] as const).map(
      (key) => `- ${context.t(`transfer.instructions.${key}`)}`,
    ),
    '',
    context.t('transfer.p0Heading'),
    '',
  ]
  if (grammar.coreRules.length === 0) lines.push(context.t('transfer.p0Empty'))
  else grammar.coreRules.forEach((item) => lines.push(...transferRuleLines(item, context)))
  lines.push(
    '',
    context.t('transfer.coordinateHeading'),
    '',
    context.t('transfer.coordinateIntro'),
    '',
    ...grammar.styleCoordinates.map((item) => coordinateLine(item, context)),
  )
  return lines.join('\n')
}

export function generateTransferComponentsMarkdown(
  profile: DesignProfile,
  tokens?: DesignToken,
  publicColorNames: ReadonlyMap<string, string> = new Map(),
  evidence?: DesignEvidence,
): string {
  const grammar = profile.transferGrammar
  if (!grammar) return ''
  const context = createTransferExportContext(profile, tokens, publicColorNames, evidence)
  const allRecipes = grammar.componentRecipes.filter((recipe) => recipe.priority === 'P1')
  const recipes = selectBalancedComponentDetails(allRecipes)
  const omittedRecipes = allRecipes.filter((recipe) => !recipes.includes(recipe))
  const omittedByType = new Map<string, number>()
  for (const recipe of omittedRecipes) {
    omittedByType.set(recipe.component, (omittedByType.get(recipe.component) || 0) + 1)
  }
  const omittedSummary = [...omittedByType.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([component, count]) =>
      context.t('transfer.omittedP1RecipeType', { component: translatedTerm(component, context.t), count }),
    )
    .join(context.t('listSeparator'))
  return [
    context.t('transfer.componentsHeading'),
    '',
    context.t('transfer.componentsIntro'),
    '',
    ...(omittedRecipes.length > 0
      ? [`> ${context.t('transfer.omittedP1Recipes', { count: omittedRecipes.length, summary: omittedSummary })}`, '']
      : []),
    ...(recipes.length > 0
      ? recipes.flatMap((recipe) => recipeLines(recipe, context))
      : [context.t('transfer.noP1Recipes')]),
  ].join('\n')
}

export function generateTransferBoundariesMarkdown(
  profile: DesignProfile,
  tokens?: DesignToken,
  publicColorNames: ReadonlyMap<string, string> = new Map(),
  evidence?: DesignEvidence,
): string {
  const grammar = profile.transferGrammar
  if (!grammar) return ''
  const context = createTransferExportContext(profile, tokens, publicColorNames, evidence)
  const p2Recipes = grammar.componentRecipes.filter((recipe) => recipe.priority === 'P2')
  const lines = [context.t('transfer.p2Heading'), '', context.t('transfer.p2Intro'), '']
  lines.push(`#### ${context.t('transfer.localFacts')}`, '')
  if (grammar.localRules.length === 0) lines.push(`- ${context.t('transfer.none')}`)
  else {
    const hasRepeatedScopeGuidance = grammar.localRules.some(
      (item) => item.claim.implementation === context.boundedImplementation,
    )
    if (hasRepeatedScopeGuidance) lines.push(`> ${context.t('transfer.localFactsScopeNotice')}`, '')
    grammar.localRules.forEach((item) =>
      lines.push(
        ...transferRuleLines(item, context, {
          omitImplementation: item.claim.implementation === context.boundedImplementation,
        }),
      ),
    )
  }
  lines.push('', `#### ${context.t('transfer.localRecipes')}`, '')
  if (p2Recipes.length === 0) lines.push(`- ${context.t('transfer.none')}`)
  else {
    const groups = new Map<string, { patterns: number; instances: number }>()
    for (const recipe of p2Recipes) {
      const group = groups.get(recipe.component) || { patterns: 0, instances: 0 }
      group.patterns += 1
      group.instances += recipe.sourceInstances
      groups.set(recipe.component, group)
    }
    for (const [component, summary] of [...groups].sort(([first], [second]) => first.localeCompare(second))) {
      lines.push(
        `- ${context.t('transfer.localRecipeSummary', {
          component: translatedTerm(component, context.t),
          patterns: summary.patterns,
          instances: summary.instances,
        })}`,
      )
    }
  }
  lines.push('', context.t('transfer.unknownsHeading'), '')
  if (profile.uncertainties.length === 0) lines.push(`- ${context.t('transfer.none')}`)
  else {
    for (const item of uniqueUncertainties(profile)) {
      lines.push(
        `- **${context.formatText(item.topic)}${context.t('labelSeparator')}** ${context.formatText(item.reason)}`,
      )
      if (item.neededEvidence) {
        lines.push(
          `  - **${context.t('transfer.neededEvidence')}${context.t('labelSeparator')}** ${context.formatText(item.neededEvidence)}`,
        )
      }
    }
  }
  return lines.join('\n')
}

export function generateDesignProfileMarkdown(
  profile: DesignProfile,
  tokens?: DesignToken,
  publicColorNames: ReadonlyMap<string, string> = new Map(),
  evidence?: DesignEvidence,
): string {
  const { t, formatText, formatTokenRefs, scopeForClaim } = createClaimExportContext(
    profile,
    tokens,
    publicColorNames,
    evidence,
  )
  const claimOptions = {
    formatText,
    formatTokenRefs,
    renderedClaimKeys: new Set<string>(),
    scopeForClaim,
  }
  const exactScopeForClaim = buildClaimScopeFormatter(evidence, t, Number.MAX_SAFE_INTEGER)
  const compositionClaims = Object.entries(profile.composition).map(([label, claim]) => ({
    ...claim,
    label: t(`claimLabels.${label}`),
  }))
  const componentClaims = profile.componentGrammar.flatMap((grammar) =>
    grammar.rules.map((claim) => ({
      ...claim,
      label: [translatedTerm(grammar.component, t), translatedTerm(grammar.role, t)]
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(' · '),
    })),
  )
  const attentionClaims = [
    { ...profile.attention.entryPoint, label: t('claimLabels.entryPoint') },
    ...profile.attention.visualSequence.map((claim) => ({ ...claim, label: t('claimLabels.visualSequence') })),
    { ...profile.attention.actionHierarchy, label: t('claimLabels.actionHierarchy') },
    { ...profile.attention.contrastStrategy, label: t('claimLabels.contrastStrategy') },
  ]
  const scopedSectionLayouts = new Map<string, Array<{ role: string; layouts: string[]; claim: DesignClaim }>>()
  const standaloneSectionLayouts: LabeledClaim[] = []
  for (const grammar of profile.sectionGrammar) {
    for (const claim of grammar.composition) {
      const layouts = sectionLayoutModes(claim)
      const scope = exactScopeForClaim(claim)
      if (layouts.length === 0 || !scope) {
        standaloneSectionLayouts.push({ ...claim, label: translatedTerm(grammar.role, t) })
        continue
      }
      const key = JSON.stringify([layouts, scope])
      const group = scopedSectionLayouts.get(key) || []
      group.push({ role: grammar.role, layouts, claim })
      scopedSectionLayouts.set(key, group)
    }
  }
  const groupedSectionLayouts = [...scopedSectionLayouts.values()].flatMap((group): LabeledClaim[] => {
    const roles = [...new Set(group.map((item) => item.role))].sort()
    if (roles.length < 2) {
      return group.map(({ role, claim }) => ({ ...claim, label: translatedTerm(role, t) }))
    }
    const merged = group.slice(1).reduce((result, item) => mergeClaims(result, item.claim), group[0].claim)
    return [
      {
        ...merged,
        label: t('claimLabels.layout'),
        statement: t('sectionLayoutSummary', {
          roles: roles.join(', '),
          layouts: group[0].layouts.join(', '),
        }),
      },
    ]
  })
  const sectionClaims = [
    ...standaloneSectionLayouts,
    ...groupedSectionLayouts,
    ...profile.sectionGrammar.flatMap((grammar) =>
      [...grammar.contentRhythm, ...grammar.transitionToNext].map((claim) => ({
        ...claim,
        label: translatedTerm(grammar.role, t),
      })),
    ),
  ]
  const executedInteractionClaims = profile.interactionLanguage.primaryDrivers.filter(isExecutedInteractionClaim)
  const additionalPatternClaims = [
    { ...profile.visualLanguage.surfaces, label: t('claimLabels.surfaces') },
    ...(profile.visualLanguage.imagery && hasClassifiedImagery(profile.visualLanguage.imagery)
      ? [{ ...profile.visualLanguage.imagery, label: t('claimLabels.imagery') }]
      : []),
    ...(profile.visualLanguage.motion ? [{ ...profile.visualLanguage.motion, label: t('claimLabels.motion') }] : []),
  ]
  const uncertainties = uniqueUncertainties(profile)
  const patternClaims = (profile.patterns || []).flatMap((pattern) =>
    [...pattern.structureRules, ...pattern.visualRules, ...pattern.interactionRules, ...pattern.responsiveRules].map(
      (claim) => ({ ...claim, label: pattern.name }),
    ),
  )
  const transferClaims = [
    ...profile.transferRules.preserve.map((claim) => ({ ...claim, label: t('claimLabels.preserve') })),
    ...profile.transferRules.adapt.map((claim) => ({ ...claim, label: t('claimLabels.adapt') })),
    ...profile.transferRules.avoid.map((claim) => ({ ...claim, label: t('claimLabels.avoid') })),
  ]
  const uncertaintyLines =
    uncertainties.length > 0
      ? [
          `### ${t('sections.uncertainties')}`,
          '',
          ...uncertainties.map(
            (item) => `- ${formatText(item.topic)}${t('labelValueSeparator')}${formatText(item.reason)}`,
          ),
          '',
        ]
      : []

  return [
    t('catalogHeading'),
    '',
    t('catalogLayerNotice'),
    '',
    ...claimLines(
      t('sections.selectedHighlights'),
      profile.signatureMoves.filter((claim) => !isSectionLayoutClaim(claim)),
      t,
      claimOptions,
    ),
    ...claimLines(t('sections.composition'), compositionClaims, t, claimOptions),
    ...claimLines(t('sections.attention'), attentionClaims, t, claimOptions),
    ...claimLines(t('sections.sectionSemantics'), sectionClaims, t, claimOptions),
    ...claimLines(t('sections.componentSemantics'), componentClaims, t, claimOptions),
    ...claimLines(t('sections.executedInteractions'), executedInteractionClaims, t, claimOptions),
    ...claimLines(t('sections.additionalPatterns'), additionalPatternClaims, t, claimOptions),
    ...claimLines(t('sections.reusablePatterns'), patternClaims, t, claimOptions),
    ...claimLines(t('sections.transferBoundaries'), transferClaims, t, claimOptions),
    ...uncertaintyLines,
  ].join('\n')
}
