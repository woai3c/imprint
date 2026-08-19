import {
  displayedResponsiveChangeType,
  topLevelGridColumnCount,
  usefulResponsiveChanges,
} from '../design-evidence/responsive-reliability.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { type CrossCaptureEntityMatchingResult, matchCrossCaptureEntities } from '../governance/entity-matcher.js'
import { isPageHealthEvidenceEligible } from './page-health.js'
import type { CaptureManifest, DesignToken } from './types.js'

export const REFERENCE_COMPARISON_SCHEMA_VERSION = '1' as const

export type ReferenceComparisonStatus = 'changed' | 'unchanged' | 'inconclusive'
export type ReferenceComparisonCategory =
  'colors' | 'typography' | 'spacing' | 'radii' | 'layout' | 'interaction-states' | 'responsive'
export type ReferenceCategoryStatus = 'changed' | 'unchanged' | 'inconclusive' | 'not-supported'
export type ReferenceCategoryCoverage = 'complete' | 'partial' | 'none'
export type ReferenceCategoryLimitation =
  | 'section-level-properties-only'
  | 'unresolved-entities-excluded'
  | 'medium-confidence-entity-matches'
  | 'observed-interaction-styles-only'
  | 'interaction-observations-unpaired'
  | 'matched-responsive-observations-only'
  | 'responsive-observations-unpaired'
  | 'single-viewport'

export type ReferenceComparabilityReason =
  | 'missing-evidence'
  | 'missing-capture-manifest'
  | 'schema-mismatch'
  | 'capture-manifest-schema-mismatch'
  | 'capture-settings-mismatch'
  | 'capture-environment-mismatch'
  | 'stabilization-mismatch'
  | 'route-mismatch'
  | 'page-set-mismatch'
  | 'access-mode-mismatch'
  | 'language-mismatch'
  | 'incomplete-coverage'
  | 'missing-page-health'
  | 'unhealthy-page'

export type ReferenceComparisonLimitation =
  | 'browser-environment-differs'
  | 'tool-version-differs'
  | 'exact-observed-values-only'
  | 'entry-and-captured-page-set-only'

export interface ReferenceComparabilityDifference {
  field: string
  reference: string | null
  target: string | null
  effect: 'inconclusive' | 'limitation'
}

export interface ReferenceCaptureInput {
  analysisId: string
  url: string
  createdAt?: string
  tokens: DesignToken
  evidence: DesignEvidence | null
  manifest: CaptureManifest | null
}

export interface ReferenceComparisonChange {
  id: string
  category: ReferenceComparisonCategory
  kind: 'added' | 'removed' | 'changed'
  tokenPath: string
  from?: string
  to?: string
  referenceEvidenceIds: string[]
  targetEvidenceIds: string[]
}

export interface ReferenceCategoryComparison {
  category: ReferenceComparisonCategory
  status: ReferenceCategoryStatus
  coverage: ReferenceCategoryCoverage
  limitations: ReferenceCategoryLimitation[]
  changes: ReferenceComparisonChange[]
}

export interface ReferenceComparisonResult {
  schemaVersion: typeof REFERENCE_COMPARISON_SCHEMA_VERSION
  reference: {
    analysisId: string
    url: string
    routeIdentity: string
    createdAt?: string
  }
  target: {
    analysisId: string
    url: string
    routeIdentity: string
    createdAt?: string
  }
  status: ReferenceComparisonStatus
  comparability: {
    status: 'limited' | 'inconclusive'
    reasons: ReferenceComparabilityReason[]
    limitations: ReferenceComparisonLimitation[]
    comparedPageKeys: string[]
    differences: ReferenceComparabilityDifference[]
  }
  categories: ReferenceCategoryComparison[]
  entityMatching: CrossCaptureEntityMatchingResult | null
  summary: {
    changedCategories: number
    changedItems: number
  }
}

export function routeIdentityFromUrl(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    return `${url.origin}${pathname}`
  } catch {
    const withoutQuery = value.split(/[?#]/, 1)[0]
    return withoutQuery.replace(/\/+$/, '') || withoutQuery
  }
}

function sourceRoute(input: ReferenceCaptureInput): string {
  return routeIdentityFromUrl(input.evidence?.source.finalUrl || input.url)
}

function pageKey(page: DesignEvidence['pages'][number]): string {
  return `${routeIdentityFromUrl(page.url)}::${page.viewport}`
}

function sortedPageKeys(evidence: DesignEvidence): string[] {
  return [...new Set(evidence.pages.map(pageKey))].sort()
}

function sameValues(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index])
}

function serialized(value: unknown): string | null {
  return JSON.stringify(value) ?? null
}

function collectManifestComparability(
  reference: CaptureManifest | null,
  target: CaptureManifest | null,
): {
  reasons: ReferenceComparabilityReason[]
  limitations: ReferenceComparisonLimitation[]
  differences: ReferenceComparabilityDifference[]
} {
  const reasons = new Set<ReferenceComparabilityReason>()
  const limitations = new Set<ReferenceComparisonLimitation>()
  const differences: ReferenceComparabilityDifference[] = []
  if (!reference || !target) {
    reasons.add('missing-capture-manifest')
    return { reasons: [...reasons], limitations: [], differences }
  }
  if (reference.schemaVersion !== target.schemaVersion) reasons.add('capture-manifest-schema-mismatch')

  const compare = (
    field: string,
    referenceValue: unknown,
    targetValue: unknown,
    effect: ReferenceComparabilityDifference['effect'],
  ) => {
    const referenceText = serialized(referenceValue)
    const targetText = serialized(targetValue)
    if (referenceText === targetText) return
    differences.push({ field, reference: referenceText, target: targetText, effect })
  }

  compare('request.schemaVersion', reference.request.schemaVersion, target.request.schemaVersion, 'inconclusive')
  compare('request.viewports', reference.request.viewports, target.request.viewports, 'inconclusive')
  compare('request.maxPages', reference.request.maxPages, target.request.maxPages, 'inconclusive')
  compare('request.pageDiscovery', reference.request.pageDiscovery, target.request.pageDiscovery, 'inconclusive')
  compare('request.depth', reference.request.depth, target.request.depth, 'inconclusive')
  compare('request.accessMode', reference.request.accessMode, target.request.accessMode, 'inconclusive')
  compare('environment.locale', reference.environment.locale, target.environment.locale, 'inconclusive')
  compare('environment.languages', reference.environment.languages, target.environment.languages, 'inconclusive')
  compare('environment.timezone', reference.environment.timezone, target.environment.timezone, 'inconclusive')
  compare('environment.colorScheme', reference.environment.colorScheme, target.environment.colorScheme, 'inconclusive')
  compare(
    'environment.reducedMotion',
    reference.environment.reducedMotion,
    target.environment.reducedMotion,
    'inconclusive',
  )
  compare(
    'environment.deviceScaleFactor',
    reference.environment.deviceScaleFactor,
    target.environment.deviceScaleFactor,
    'inconclusive',
  )
  compare(
    'environment.viewports',
    reference.environment.viewports.map(({ userAgent: _userAgent, ...viewport }) => viewport),
    target.environment.viewports.map(({ userAgent: _userAgent, ...viewport }) => viewport),
    'inconclusive',
  )
  compare(
    'stabilization.strategyVersion',
    reference.stabilization.strategyVersion,
    target.stabilization.strategyVersion,
    'inconclusive',
  )
  compare(
    'stabilization.animationFreeze',
    reference.stabilization.animationFreeze,
    target.stabilization.animationFreeze,
    'inconclusive',
  )

  compare('tool.version', reference.tool.version, target.tool.version, 'limitation')
  compare('environment.platform', reference.environment.platform, target.environment.platform, 'limitation')
  compare('environment.architecture', reference.environment.architecture, target.environment.architecture, 'limitation')
  compare(
    'environment.browser.product',
    reference.environment.browser.product,
    target.environment.browser.product,
    'limitation',
  )
  compare(
    'environment.browser.version',
    reference.environment.browser.version,
    target.environment.browser.version,
    'limitation',
  )
  compare(
    'environment.browser.headless',
    reference.environment.browser.headless,
    target.environment.browser.headless,
    'limitation',
  )

  if (differences.some((difference) => difference.effect === 'inconclusive')) {
    if (differences.some((difference) => difference.field.startsWith('request.'))) {
      reasons.add('capture-settings-mismatch')
    }
    if (differences.some((difference) => difference.field.startsWith('environment.'))) {
      reasons.add('capture-environment-mismatch')
    }
    if (differences.some((difference) => difference.field.startsWith('stabilization.'))) {
      reasons.add('stabilization-mismatch')
    }
  }
  if (
    differences.some((difference) => difference.effect === 'limitation' && difference.field.startsWith('environment.'))
  ) {
    limitations.add('browser-environment-differs')
  }
  if (differences.some((difference) => difference.field === 'tool.version')) {
    limitations.add('tool-version-differs')
  }
  return { reasons: [...reasons], limitations: [...limitations], differences }
}

function collectComparabilityReasons(
  reference: ReferenceCaptureInput,
  target: ReferenceCaptureInput,
): {
  reasons: ReferenceComparabilityReason[]
  limitations: ReferenceComparisonLimitation[]
  differences: ReferenceComparabilityDifference[]
  comparedPageKeys: string[]
} {
  const reasons = new Set<ReferenceComparabilityReason>()
  const manifestComparability = collectManifestComparability(reference.manifest, target.manifest)
  manifestComparability.reasons.forEach((reason) => reasons.add(reason))
  const referenceEvidence = reference.evidence
  const targetEvidence = target.evidence
  if (!referenceEvidence || !targetEvidence) {
    reasons.add('missing-evidence')
    return {
      reasons: [...reasons],
      limitations: manifestComparability.limitations,
      differences: manifestComparability.differences,
      comparedPageKeys: [],
    }
  }

  if (referenceEvidence.schemaVersion !== targetEvidence.schemaVersion) reasons.add('schema-mismatch')
  if (sourceRoute(reference) !== sourceRoute(target)) reasons.add('route-mismatch')
  if (referenceEvidence.source.accessMode !== targetEvidence.source.accessMode) reasons.add('access-mode-mismatch')
  if (
    referenceEvidence.source.language &&
    targetEvidence.source.language &&
    referenceEvidence.source.language !== targetEvidence.source.language
  ) {
    reasons.add('language-mismatch')
  }

  const referencePageKeys = sortedPageKeys(referenceEvidence)
  const targetPageKeys = sortedPageKeys(targetEvidence)
  if (!sameValues(referencePageKeys, targetPageKeys)) reasons.add('page-set-mismatch')

  if (
    referenceEvidence.coverage.pageCoverage !== 'complete' ||
    targetEvidence.coverage.pageCoverage !== 'complete' ||
    referenceEvidence.coverage.captureCoverage?.status === 'partial' ||
    targetEvidence.coverage.captureCoverage?.status === 'partial'
  ) {
    reasons.add('incomplete-coverage')
  }

  for (const evidence of [referenceEvidence, targetEvidence]) {
    for (const page of evidence.pages) {
      if (!page.health) {
        reasons.add('missing-page-health')
      } else if (!isPageHealthEvidenceEligible(page.health)) {
        reasons.add('unhealthy-page')
      }
    }
  }

  return {
    reasons: [...reasons].sort(),
    limitations: manifestComparability.limitations,
    differences: manifestComparability.differences,
    comparedPageKeys: reasons.has('page-set-mismatch') ? [] : referencePageKeys,
  }
}

function evidenceIdsForToken(evidence: DesignEvidence, tokenPath: string): string[] {
  const direct = [
    ...evidence.sections.filter((item) => item.tokenRefs.includes(tokenPath)).map((item) => item.id),
    ...evidence.components.filter((item) => item.tokenRefs.includes(tokenPath)).map((item) => item.id),
    ...evidence.layoutNodes.filter((item) => item.tokenRefs.includes(tokenPath)).map((item) => item.id),
  ]
  if (direct.length > 0) return [...new Set(direct)].slice(0, 8)

  const tokenEvidence = evidence.tokens.evidence?.[tokenPath]
  if (tokenEvidence?.pages.length) {
    const routes = new Set(tokenEvidence.pages.map(routeIdentityFromUrl))
    const pages = evidence.pages.filter((page) => routes.has(routeIdentityFromUrl(page.url))).map((page) => page.id)
    if (pages.length > 0) return [...new Set(pages)].slice(0, 8)
  }

  return []
}

function change(
  category: ReferenceComparisonCategory,
  kind: ReferenceComparisonChange['kind'],
  tokenPath: string,
  reference: ReferenceCaptureInput,
  target: ReferenceCaptureInput,
  from?: string,
  to?: string,
): ReferenceComparisonChange {
  return {
    id: `${category}:${kind}:${tokenPath}`,
    category,
    kind,
    tokenPath,
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    referenceEvidenceIds:
      from !== undefined && reference.evidence ? evidenceIdsForToken(reference.evidence, tokenPath) : [],
    targetEvidenceIds: to !== undefined && target.evidence ? evidenceIdsForToken(target.evidence, tokenPath) : [],
  }
}

function compareNamedColors(
  reference: ReferenceCaptureInput,
  target: ReferenceCaptureInput,
): ReferenceComparisonChange[] {
  const changes: ReferenceComparisonChange[] = []
  const names = [...new Set([...Object.keys(reference.tokens.colors), ...Object.keys(target.tokens.colors)])].sort()
  for (const name of names) {
    const from = reference.tokens.colors[name]
    const to = target.tokens.colors[name]
    const tokenPath = `colors.${name}`
    if (from === undefined) changes.push(change('colors', 'added', tokenPath, reference, target, undefined, to))
    else if (to === undefined) changes.push(change('colors', 'removed', tokenPath, reference, target, from))
    else if (from !== to) changes.push(change('colors', 'changed', tokenPath, reference, target, from, to))
  }
  return changes
}

function compareScale(
  category: Exclude<ReferenceComparisonCategory, 'colors'>,
  tokenPrefix: string,
  referenceValues: string[],
  targetValues: string[],
  reference: ReferenceCaptureInput,
  target: ReferenceCaptureInput,
): ReferenceComparisonChange[] {
  const changes: ReferenceComparisonChange[] = []
  const referenceSet = new Set(referenceValues)
  const targetSet = new Set(targetValues)
  for (const value of referenceValues) {
    if (targetSet.has(value)) continue
    changes.push(
      change(category, 'removed', `${tokenPrefix}.${referenceValues.indexOf(value)}`, reference, target, value),
    )
  }
  for (const value of targetValues) {
    if (referenceSet.has(value)) continue
    changes.push(
      change(category, 'added', `${tokenPrefix}.${targetValues.indexOf(value)}`, reference, target, undefined, value),
    )
  }
  return changes
}

function compareTypography(
  reference: ReferenceCaptureInput,
  target: ReferenceCaptureInput,
): ReferenceComparisonChange[] {
  const groups: Array<keyof DesignToken['typography']> = [
    'fontFamilies',
    'fontStacks',
    'fontSizes',
    'fontWeights',
    'lineHeights',
    'letterSpacings',
  ]
  return groups.flatMap((group) =>
    compareScale(
      'typography',
      `typography.${group}`,
      reference.tokens.typography[group],
      target.tokens.typography[group],
      reference,
      target,
    ),
  )
}

function categoryResult(
  category: ReferenceComparisonCategory,
  changes: ReferenceComparisonChange[],
  inconclusive: boolean,
): ReferenceCategoryComparison {
  return {
    category,
    status: inconclusive ? 'inconclusive' : changes.length > 0 ? 'changed' : 'unchanged',
    coverage: inconclusive ? 'none' : 'complete',
    limitations: [],
    changes: inconclusive ? [] : changes,
  }
}

function observedChange(
  category: 'layout' | 'interaction-states' | 'responsive',
  tokenPath: string,
  referenceEvidenceIds: string[],
  targetEvidenceIds: string[],
  from: string | undefined,
  to: string | undefined,
): ReferenceComparisonChange {
  const kind = from === undefined ? 'added' : to === undefined ? 'removed' : 'changed'
  return {
    id: `${category}:${kind}:${tokenPath}:${referenceEvidenceIds.join(',')}:${targetEvidenceIds.join(',')}`,
    category,
    kind,
    tokenPath,
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    referenceEvidenceIds,
    targetEvidenceIds,
  }
}

function normalizedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return value === undefined || value === null ? undefined : String(value)
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || undefined
}

function sectionLayoutValue(section: DesignEvidence['sections'][number], property: string): string | undefined {
  if (property === 'order') return String(section.order)
  if (property === 'layoutMode') return section.layoutMode
  const value = section.observedStyles?.layout?.[property]
  if (!value) return undefined
  if (property === 'gridTemplateColumns' || property === 'childGridTemplateColumns') {
    const count = topLevelGridColumnCount(value)
    return count === null ? normalizedText(value) : String(count)
  }
  return normalizedText(value)
}

const COMPARED_LAYOUT_PROPERTIES = [
  'order',
  'layoutMode',
  'display',
  'position',
  'maxWidth',
  'gridTemplateColumns',
  'childGridTemplateColumns',
] as const

function compareLayoutEvidence(
  referenceEvidence: DesignEvidence | null,
  targetEvidence: DesignEvidence | null,
  matching: CrossCaptureEntityMatchingResult | null,
  globallyInconclusive: boolean,
): ReferenceCategoryComparison {
  const baseLimitations: ReferenceCategoryLimitation[] = ['section-level-properties-only']
  if (globallyInconclusive || !referenceEvidence || !targetEvidence || !matching) {
    return { category: 'layout', status: 'inconclusive', coverage: 'none', limitations: baseLimitations, changes: [] }
  }

  const referenceSections = new Map(referenceEvidence.sections.map((section) => [section.id, section]))
  const targetSections = new Map(targetEvidence.sections.map((section) => [section.id, section]))
  const matched = matching.sections.filter(
    (match) => match.status === 'matched' && match.referenceIds.length === 1 && match.targetIds.length === 1,
  )
  const unresolved = matching.sections.some((match) => match.status !== 'matched')
  const mediumConfidence = matched.some((match) => match.confidence === 'medium')
  const limitations = [
    ...baseLimitations,
    ...(unresolved ? (['unresolved-entities-excluded'] as const) : []),
    ...(mediumConfidence ? (['medium-confidence-entity-matches'] as const) : []),
  ]
  const changes: ReferenceComparisonChange[] = []

  matched.forEach((match, matchIndex) => {
    const referenceSection = referenceSections.get(match.referenceIds[0])
    const targetSection = targetSections.get(match.targetIds[0])
    if (!referenceSection || !targetSection) return
    for (const property of COMPARED_LAYOUT_PROPERTIES) {
      const from = sectionLayoutValue(referenceSection, property)
      const to = sectionLayoutValue(targetSection, property)
      if (from === to) continue
      changes.push(
        observedChange(
          'layout',
          `layout.${referenceSection.role}.${matchIndex + 1}.${property}`,
          [referenceSection.id],
          [targetSection.id],
          from,
          to,
        ),
      )
    }
  })

  return {
    category: 'layout',
    status: changes.length > 0 ? 'changed' : matched.length > 0 ? 'unchanged' : 'inconclusive',
    coverage: matched.length > 0 ? 'partial' : 'none',
    limitations,
    changes,
  }
}

interface ObservationGroup {
  tokenPath: string
  values: Map<string, string[]>
}

function interactionGroups(evidence: DesignEvidence): Map<string, ObservationGroup> {
  const pages = new Map(evidence.pages.map((page) => [page.id, page]))
  const groups = new Map<string, ObservationGroup>()
  for (const observation of evidence.interactionObservations) {
    const page = pages.get(observation.pageId)
    if (!page) continue
    const properties = [...observation.changedProperties].sort()
    if (properties.length === 0) continue
    const key = [pageKey(page), observation.driver, observation.trigger.kind, properties.join('+')].join('|')
    const tokenPath = `interaction.${observation.driver}.${observation.trigger.kind}.${properties.join('+')}`
    const before = Object.fromEntries(properties.map((property) => [property, observation.before[property] ?? '']))
    const after = Object.fromEntries(properties.map((property) => [property, observation.after[property] ?? '']))
    const value = JSON.stringify({ before, after })
    const group = groups.get(key) || { tokenPath, values: new Map<string, string[]>() }
    const evidenceIds = group.values.get(value) || []
    evidenceIds.push(observation.id)
    group.values.set(value, evidenceIds)
    groups.set(key, group)
  }
  return groups
}

function displayedObservationValues(values: Map<string, string[]>): string {
  return [...values.keys()]
    .sort()
    .map((value) => {
      try {
        const parsed = JSON.parse(value) as { before?: Record<string, string>; after?: Record<string, string> }
        const properties = [
          ...new Set([...Object.keys(parsed.before || {}), ...Object.keys(parsed.after || {})]),
        ].sort()
        return properties
          .map((property) => `${property}: ${parsed.before?.[property] || '—'} → ${parsed.after?.[property] || '—'}`)
          .join(', ')
      } catch {
        return value
      }
    })
    .join(' | ')
}

function compareInteractionEvidence(
  referenceEvidence: DesignEvidence | null,
  targetEvidence: DesignEvidence | null,
  globallyInconclusive: boolean,
): ReferenceCategoryComparison {
  const baseLimitations: ReferenceCategoryLimitation[] = ['observed-interaction-styles-only']
  if (globallyInconclusive || !referenceEvidence || !targetEvidence) {
    return {
      category: 'interaction-states',
      status: 'inconclusive',
      coverage: 'none',
      limitations: baseLimitations,
      changes: [],
    }
  }

  const referenceGroups = interactionGroups(referenceEvidence)
  const targetGroups = interactionGroups(targetEvidence)
  const groupKeys = [...new Set([...referenceGroups.keys(), ...targetGroups.keys()])].sort()
  let unpaired = false
  let paired = 0
  const changes: ReferenceComparisonChange[] = []
  for (const key of groupKeys) {
    const referenceGroup = referenceGroups.get(key)
    const targetGroup = targetGroups.get(key)
    if (!referenceGroup || !targetGroup) {
      unpaired = true
      continue
    }
    paired += 1
    const from = displayedObservationValues(referenceGroup.values)
    const to = displayedObservationValues(targetGroup.values)
    if (from === to) continue
    changes.push(
      observedChange(
        'interaction-states',
        referenceGroup.tokenPath,
        [...new Set([...referenceGroup.values.values()].flat())],
        [...new Set([...targetGroup.values.values()].flat())],
        from,
        to,
      ),
    )
  }

  const coverageDiffers =
    JSON.stringify(referenceEvidence.coverage.interactionCoverage) !==
    JSON.stringify(targetEvidence.coverage.interactionCoverage)
  if (coverageDiffers) unpaired = true
  return {
    category: 'interaction-states',
    status: changes.length > 0 ? 'changed' : paired > 0 ? 'unchanged' : 'inconclusive',
    coverage: paired > 0 ? 'partial' : 'none',
    limitations: [...baseLimitations, ...(unpaired ? (['interaction-observations-unpaired'] as const) : [])],
    changes,
  }
}

interface ResponsiveObservationValue {
  value: string
  evidenceIds: string[]
  tokenPath: string
}

function responsiveObservationValue(
  evidence: DesignEvidence,
  observation: DesignEvidence['responsiveObservations'][number],
): ResponsiveObservationValue | null {
  const section = evidence.sections.find((candidate) => candidate.id === observation.sectionId)
  const useful = usefulResponsiveChanges(observation, section?.role)
  if (!section || useful.length === 0) return null
  const properties = useful.map(([property]) => property)
  const value = `${displayedResponsiveChangeType(observation.changeType, properties)} · ${useful
    .map(([property, values]) => `${property}: ${values.from ?? '—'} → ${values.to ?? '—'}`)
    .join(', ')}`
  return {
    value,
    evidenceIds: [
      observation.id,
      ...observation.evidenceRefs.filter((id) => evidence.sections.some((s) => s.id === id)),
    ],
    tokenPath: `responsive.${section.role}.${observation.fromViewport}-${observation.toViewport}`,
  }
}

function compareResponsiveEvidence(
  referenceEvidence: DesignEvidence | null,
  targetEvidence: DesignEvidence | null,
  matching: CrossCaptureEntityMatchingResult | null,
  globallyInconclusive: boolean,
): ReferenceCategoryComparison {
  const baseLimitations: ReferenceCategoryLimitation[] = ['matched-responsive-observations-only']
  if (globallyInconclusive || !referenceEvidence || !targetEvidence || !matching) {
    return {
      category: 'responsive',
      status: 'inconclusive',
      coverage: 'none',
      limitations: baseLimitations,
      changes: [],
    }
  }
  if (referenceEvidence.coverage.viewportCoverage.length < 2 || targetEvidence.coverage.viewportCoverage.length < 2) {
    return {
      category: 'responsive',
      status: 'inconclusive',
      coverage: 'none',
      limitations: [...baseLimitations, 'single-viewport'],
      changes: [],
    }
  }

  const sectionMap = new Map<string, string>()
  for (const match of matching.sections) {
    if (match.status === 'matched' && match.referenceIds.length === 1 && match.targetIds.length === 1) {
      sectionMap.set(match.referenceIds[0], match.targetIds[0])
    }
  }
  const targetByIdentity = new Map<string, Array<DesignEvidence['responsiveObservations'][number]>>()
  for (const observation of targetEvidence.responsiveObservations) {
    const key = `${observation.sectionId}|${observation.fromViewport}|${observation.toViewport}`
    const values = targetByIdentity.get(key) || []
    values.push(observation)
    targetByIdentity.set(key, values)
  }

  const consumedTargetIds = new Set<string>()
  let unpaired = false
  let paired = 0
  const changes: ReferenceComparisonChange[] = []
  for (const referenceObservation of referenceEvidence.responsiveObservations) {
    const referenceValue = responsiveObservationValue(referenceEvidence, referenceObservation)
    if (!referenceValue) continue
    const targetSectionId = sectionMap.get(referenceObservation.sectionId)
    const candidates = targetSectionId
      ? targetByIdentity.get(
          `${targetSectionId}|${referenceObservation.fromViewport}|${referenceObservation.toViewport}`,
        ) || []
      : []
    const targetCandidates = candidates
      .map((observation) => ({ observation, value: responsiveObservationValue(targetEvidence, observation) }))
      .filter(
        (
          item,
        ): item is {
          observation: DesignEvidence['responsiveObservations'][number]
          value: ResponsiveObservationValue
        } => Boolean(item.value),
      )
    if (targetCandidates.length !== 1) {
      unpaired = true
      continue
    }
    const targetObservation = targetCandidates[0]
    consumedTargetIds.add(targetObservation.observation.id)
    paired += 1
    if (referenceValue.value === targetObservation.value.value) continue
    changes.push(
      observedChange(
        'responsive',
        referenceValue.tokenPath,
        referenceValue.evidenceIds,
        targetObservation.value.evidenceIds,
        referenceValue.value,
        targetObservation.value.value,
      ),
    )
  }

  const usefulReferenceCount = referenceEvidence.responsiveObservations.filter((observation) =>
    responsiveObservationValue(referenceEvidence, observation),
  ).length
  const usefulTargetCount = targetEvidence.responsiveObservations.filter((observation) =>
    responsiveObservationValue(targetEvidence, observation),
  ).length
  if (consumedTargetIds.size !== usefulTargetCount) unpaired = true
  if (
    referenceEvidence.limitations.includes('responsive-section-identity-mismatch') ||
    targetEvidence.limitations.includes('responsive-section-identity-mismatch') ||
    matching.sections.some((match) => match.status !== 'matched')
  ) {
    unpaired = true
  }

  const hasComparableStructure = matching.sections.some((match) => match.status === 'matched')
  const hasComparableEvidence =
    paired > 0 || (usefulReferenceCount === 0 && usefulTargetCount === 0 && hasComparableStructure)
  return {
    category: 'responsive',
    status: changes.length > 0 ? 'changed' : hasComparableEvidence ? 'unchanged' : 'inconclusive',
    coverage: hasComparableEvidence ? 'partial' : 'none',
    limitations: [...baseLimitations, ...(unpaired ? (['responsive-observations-unpaired'] as const) : [])],
    changes,
  }
}

export function compareReferenceCaptures(
  reference: ReferenceCaptureInput,
  target: ReferenceCaptureInput,
): ReferenceComparisonResult {
  const comparability = collectComparabilityReasons(reference, target)
  const inconclusive = comparability.reasons.length > 0
  const entityMatching =
    !inconclusive && reference.evidence && target.evidence
      ? matchCrossCaptureEntities(reference.evidence, target.evidence)
      : null
  const categories = [
    categoryResult('colors', compareNamedColors(reference, target), inconclusive),
    categoryResult('typography', compareTypography(reference, target), inconclusive),
    categoryResult(
      'spacing',
      compareScale('spacing', 'spacing', reference.tokens.spacing, target.tokens.spacing, reference, target),
      inconclusive,
    ),
    categoryResult(
      'radii',
      compareScale('radii', 'radii', reference.tokens.radii, target.tokens.radii, reference, target),
      inconclusive,
    ),
    compareLayoutEvidence(reference.evidence, target.evidence, entityMatching, inconclusive),
    compareInteractionEvidence(reference.evidence, target.evidence, inconclusive),
    compareResponsiveEvidence(reference.evidence, target.evidence, entityMatching, inconclusive),
  ] satisfies ReferenceCategoryComparison[]
  const changedItems = categories.reduce((total, category) => total + category.changes.length, 0)
  const changedCategories = categories.filter((category) => category.status === 'changed').length

  return {
    schemaVersion: REFERENCE_COMPARISON_SCHEMA_VERSION,
    reference: {
      analysisId: reference.analysisId,
      url: reference.url,
      routeIdentity: sourceRoute(reference),
      ...(reference.createdAt ? { createdAt: reference.createdAt } : {}),
    },
    target: {
      analysisId: target.analysisId,
      url: target.url,
      routeIdentity: sourceRoute(target),
      ...(target.createdAt ? { createdAt: target.createdAt } : {}),
    },
    status: inconclusive ? 'inconclusive' : changedItems > 0 ? 'changed' : 'unchanged',
    comparability: {
      status: inconclusive ? 'inconclusive' : 'limited',
      reasons: comparability.reasons,
      limitations: [...comparability.limitations, 'exact-observed-values-only', 'entry-and-captured-page-set-only'],
      comparedPageKeys: comparability.comparedPageKeys,
      differences: comparability.differences,
    },
    categories,
    entityMatching,
    summary: { changedCategories, changedItems },
  }
}
