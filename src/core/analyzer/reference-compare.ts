import {
  displayedResponsiveChangeType,
  topLevelGridColumnCount,
  usefulResponsiveChanges,
} from '../design-evidence/responsive-reliability.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { type CrossCaptureEntityMatchingResult, matchCrossCaptureEntities } from '../governance/entity-matcher.js'
import { normalizeColorValue } from './color-cluster.js'
import { isPageHealthEvidenceEligible } from './page-health.js'
import type { PageHealthIssue } from './page-health.js'
import { canonicalTokenEntriesForGroup, tokenCandidateId } from './token-catalog.js'
import type { CaptureManifest, DesignToken, TokenValueCandidate } from './types.js'
import { evidencePageRouteIdentity, explicitSourceRouteIdentity, pageIdentityUrl } from './url-identity.js'

export const REFERENCE_COMPARISON_SCHEMA_VERSION = '2' as const

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
  | 'ambiguous-page-provenance'
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
  | 'no-common-eligible-pages'
  | 'unhealthy-page'

export type ReferenceComparisonLimitation =
  | 'browser-environment-differs'
  | 'tool-version-differs'
  | 'incomplete-coverage'
  | 'unhealthy-pages-excluded'
  | 'exact-observed-values-only'
  | 'entry-and-captured-page-set-only'

export interface ReferenceComparisonExcludedPage {
  pageKey: string
  url: string
  viewport: string
  issueCodes: Array<PageHealthIssue['code'] | 'unknown'>
}

export interface ReferenceComparabilityDifference {
  field: string
  reference: string | null
  target: string | null
  effect: 'inconclusive' | 'limitation'
}

export interface ReferenceCaptureInput {
  analysisId: string
  url: string
  /** Persisted entry-document identity computed before public URL sanitization. */
  routeIdentity?: string
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
    excludedPages: ReferenceComparisonExcludedPage[]
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
  if (input.routeIdentity) return input.routeIdentity
  const explicitIdentity = explicitSourceRouteIdentity(input.evidence)
  if (explicitIdentity) return explicitIdentity
  return routeIdentityFromUrl(input.evidence?.source.finalUrl || input.url)
}

function pageKey(page: DesignEvidence['pages'][number]): string {
  return `${evidencePageRouteIdentity(page)}::${page.viewport}`
}

function pagesByKey(evidence: DesignEvidence): Map<string, DesignEvidence['pages'][number]> {
  return new Map(evidence.pages.map((page) => [pageKey(page), page]))
}

function hasAmbiguousLegacyPageProvenance(evidence: DesignEvidence): boolean {
  const pagesByPublicCapture = new Map<string, DesignEvidence['pages']>()
  for (const page of evidence.pages) {
    const publicCapture = `${routeIdentityFromUrl(page.url)}::${page.viewport}`
    const pages = pagesByPublicCapture.get(publicCapture) || []
    pages.push(page)
    pagesByPublicCapture.set(publicCapture, pages)
  }
  for (const pages of pagesByPublicCapture.values()) {
    if (pages.length < 2) continue
    const explicitRouteIds = pages.map((page) => page.routeId).filter((routeId): routeId is string => Boolean(routeId))
    if (explicitRouteIds.length !== pages.length || new Set(explicitRouteIds).size !== pages.length) return true
  }

  const routeIdsByPublicUrl = new Map<string, Set<string>>()
  for (const page of evidence.pages) {
    const publicUrl = routeIdentityFromUrl(page.url)
    const routeIds = routeIdsByPublicUrl.get(publicUrl) || new Set<string>()
    routeIds.add(evidencePageRouteIdentity(page))
    routeIdsByPublicUrl.set(publicUrl, routeIds)
  }
  const ambiguousPublicUrls = new Set(
    [...routeIdsByPublicUrl].flatMap(([publicUrl, routeIds]) => (routeIds.size > 1 ? [publicUrl] : [])),
  )
  if (ambiguousPublicUrls.size === 0) return false

  const records = [
    ...Object.values(evidence.tokens.evidence || {}),
    ...(evidence.tokens.candidates?.values || []).map((candidate) => candidate.evidence),
  ]
  return records.some(
    (record) =>
      !record.pageRefs?.length &&
      record.pages.some((pageUrl) => ambiguousPublicUrls.has(routeIdentityFromUrl(pageUrl))),
  )
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
  compare('request.pageMode', reference.request.pageMode, target.request.pageMode, 'inconclusive')
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
  excludedPages: ReferenceComparisonExcludedPage[]
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
      excludedPages: [],
    }
  }

  if (referenceEvidence.schemaVersion !== targetEvidence.schemaVersion) reasons.add('schema-mismatch')
  const ambiguousPageProvenance =
    hasAmbiguousLegacyPageProvenance(referenceEvidence) || hasAmbiguousLegacyPageProvenance(targetEvidence)
  if (ambiguousPageProvenance) {
    reasons.add('ambiguous-page-provenance')
  }
  if (sourceRoute(reference) !== sourceRoute(target)) reasons.add('route-mismatch')
  if (referenceEvidence.source.accessMode !== targetEvidence.source.accessMode) reasons.add('access-mode-mismatch')
  if (
    referenceEvidence.source.language &&
    targetEvidence.source.language &&
    referenceEvidence.source.language !== targetEvidence.source.language
  ) {
    reasons.add('language-mismatch')
  }

  if (ambiguousPageProvenance) {
    return {
      reasons: [...reasons].sort(),
      limitations: [...new Set(manifestComparability.limitations)],
      differences: manifestComparability.differences,
      comparedPageKeys: [],
      excludedPages: [],
    }
  }

  const referencePages = pagesByKey(referenceEvidence)
  const targetPages = pagesByKey(targetEvidence)
  const referencePageKeys = [...referencePages.keys()].sort()
  const targetPageKeys = [...targetPages.keys()].sort()

  if (
    referenceEvidence.coverage.pageCoverage !== 'complete' ||
    targetEvidence.coverage.pageCoverage !== 'complete' ||
    referenceEvidence.coverage.captureCoverage?.status === 'partial' ||
    targetEvidence.coverage.captureCoverage?.status === 'partial'
  ) {
    manifestComparability.limitations.push('incomplete-coverage')
  }

  const hasMissingHealth = [...referenceEvidence.pages, ...targetEvidence.pages].some((page) => !page.health)
  if (hasMissingHealth) reasons.add('missing-page-health')

  const eligibleKeys = (pages: Map<string, DesignEvidence['pages'][number]>) =>
    [...pages]
      .filter(([, page]) => page.health && isPageHealthEvidenceEligible(page.health))
      .map(([key]) => key)
      .sort()
  const referenceEligiblePageKeys = eligibleKeys(referencePages)
  const targetEligiblePageKeys = eligibleKeys(targetPages)
  const targetEligiblePageKeySet = new Set(targetEligiblePageKeys)
  const commonEligiblePageKeys = referenceEligiblePageKeys.filter((key) => targetEligiblePageKeySet.has(key))
  let comparedPageKeys: string[] = []
  let excludedPages: ReferenceComparisonExcludedPage[] = []

  if (!hasMissingHealth) {
    if (commonEligiblePageKeys.length === 0) reasons.add('no-common-eligible-pages')
    if (!sameValues(referenceEligiblePageKeys, targetEligiblePageKeys)) reasons.add('page-set-mismatch')
    if (commonEligiblePageKeys.length > 0 && sameValues(referenceEligiblePageKeys, targetEligiblePageKeys)) {
      comparedPageKeys = referenceEligiblePageKeys
      const compared = new Set(comparedPageKeys)
      const excludedKeys = [...new Set([...referencePageKeys, ...targetPageKeys])]
        .filter((key) => !compared.has(key))
        .sort()
      excludedPages = excludedKeys.map((key) => {
        const referencePage = referencePages.get(key)
        const targetPage = targetPages.get(key)
        const representative = referencePage || targetPage!
        const issueCodes = [referencePage, targetPage].flatMap(
          (page) => page?.health?.issues.map((issue) => issue.code) || [],
        )
        return {
          pageKey: key,
          url: routeIdentityFromUrl(representative.url),
          viewport: representative.viewport,
          issueCodes: [...new Set(issueCodes.length > 0 ? issueCodes : ['unknown' as const])].sort(),
        }
      })
    }
  }

  if (excludedPages.length > 0) manifestComparability.limitations.push('unhealthy-pages-excluded')

  return {
    reasons: [...reasons].sort(),
    limitations: [...new Set(manifestComparability.limitations)],
    differences: manifestComparability.differences,
    comparedPageKeys,
    excludedPages,
  }
}

function evidenceForComparedPages(evidence: DesignEvidence, comparedPageKeys: string[]): DesignEvidence {
  const allowedPageKeys = new Set(comparedPageKeys)
  const pages = evidence.pages.filter((page) => allowedPageKeys.has(pageKey(page)))
  const pageIds = new Set(pages.map((page) => page.id))
  const sections = evidence.sections.filter((section) => pageIds.has(section.pageId))
  const sectionIds = new Set(sections.map((section) => section.id))
  const excludedSectionIds = new Set(
    evidence.sections.filter((section) => !pageIds.has(section.pageId)).map((section) => section.id),
  )

  return {
    ...evidence,
    pages,
    topology: {
      ...evidence.topology,
      pages: evidence.topology.pages.filter((page) => pageIds.has(page.pageId)),
      globalLayers: evidence.topology.globalLayers.filter((layer) => pageIds.has(layer.pageId)),
    },
    sections,
    components: evidence.components.filter((component) => pageIds.has(component.pageId)),
    layoutNodes: evidence.layoutNodes.filter((node) => pageIds.has(node.pageId)),
    pseudoElements: evidence.pseudoElements?.filter((item) => pageIds.has(item.pageId)),
    interactionObservations: evidence.interactionObservations.filter((observation) => pageIds.has(observation.pageId)),
    responsiveObservations: evidence.responsiveObservations.filter(
      (observation) =>
        sectionIds.has(observation.sectionId) &&
        !observation.evidenceRefs.some((evidenceRef) => excludedSectionIds.has(evidenceRef)),
    ),
    mediaLayers: evidence.mediaLayers.filter((layer) => pageIds.has(layer.pageId)),
  }
}

function captureForComparedPages(input: ReferenceCaptureInput, comparedPageKeys: string[]): ReferenceCaptureInput {
  if (!input.evidence) return input
  const evidence = evidenceForComparedPages(input.evidence, comparedPageKeys)
  return {
    ...input,
    // Design Evidence tokens are built only from page-health-eligible captures. The all-capture token snapshot remains
    // useful as a portable export, but it must not reintroduce an excluded page into a comparison.
    tokens: input.evidence.tokens,
    evidence,
  }
}

type ComparableScaleGroup = keyof DesignToken['typography'] | 'spacing' | 'radii'

interface ComparableTokenEntry {
  /** Public portable reference, or a stable candidate identity when the value was not promoted. */
  id: string
  value: string
  publicRef?: string
  evidencePath?: string
  candidateId?: string
  candidateGroup?: TokenValueCandidate['group']
  candidateRole?: string
  /** Stable serialization of the evidence that gives an observed candidate its meaning. */
  candidateEvidenceSignature?: string
}

function sortedRecord(record: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(Object.entries(record || {}).sort(([first], [second]) => first.localeCompare(second)))
}

function candidateEvidencePageRefs(
  candidate: TokenValueCandidate,
  evidence: DesignEvidence | null | undefined,
): string[] {
  if (candidate.evidence.pageRefs?.length) return [...candidate.evidence.pageRefs].sort()
  const routeRefsByIdentity = new Map<string, string>()
  evidence?.pages.forEach((page) => {
    routeRefsByIdentity.set(pageIdentityUrl(page.url), evidencePageRouteIdentity(page))
  })

  return candidate.evidence.pages
    .map((pageUrl) => routeRefsByIdentity.get(pageIdentityUrl(pageUrl)) || routeIdentityFromUrl(pageUrl))
    .sort()
}

function candidateEvidenceSignature(
  candidate: TokenValueCandidate,
  designEvidence: DesignEvidence | null | undefined,
): string {
  const evidence = candidate.evidence
  return JSON.stringify({
    confidence: evidence.confidence,
    measurementConfidence: evidence.measurementConfidence || null,
    semanticConfidence: evidence.semanticConfidence || null,
    reuseScope: evidence.reuseScope || null,
    observationCount: evidence.observationCount,
    ownerCount: evidence.ownerCount ?? null,
    semanticAgreement: evidence.semanticAgreement ?? null,
    pageCount: evidence.pageCount,
    captureCount: evidence.captureCount,
    eligiblePageCount: evidence.eligiblePageCount ?? null,
    pageSupportRatio: evidence.pageSupportRatio ?? null,
    pages: candidateEvidencePageRefs(candidate, designEvidence),
    sources: [...evidence.sources].sort(),
    sourceCounts: sortedRecord(evidence.sourceCounts),
    roleCounts: sortedRecord(evidence.roleCounts),
    reasons: [...evidence.reasons].sort(),
  })
}

function candidateGroupForScale(group: ComparableScaleGroup): string {
  return group === 'spacing' || group === 'radii' ? group : `typography.${group}`
}

function isDirectlyObservedCandidate(candidate: TokenValueCandidate): boolean {
  const sources = candidate.evidence.sources
  if (
    sources.includes('geometry:centered-inline-offset') &&
    !sources.some((source) => source !== 'geometry:centered-inline-offset' && source.startsWith('element:'))
  ) {
    return false
  }
  return (
    candidate.evidence.pageCount > 0 &&
    candidate.evidence.reasons.some((reason) => ['rendered-use', 'computed-style', 'interactive-use'].includes(reason))
  )
}

function comparableScaleEntries(tokens: DesignToken, group: ComparableScaleGroup): ComparableTokenEntry[] {
  const candidateGroup = candidateGroupForScale(group)
  const portable = canonicalTokenEntriesForGroup(tokens, candidateGroup as TokenValueCandidate['group']).map(
    (entry): ComparableTokenEntry => ({
      id: entry.id,
      value: entry.value,
      publicRef: entry.id,
      evidencePath: entry.evidencePath,
    }),
  )
  const seenValues = new Set(portable.map((entry) => entry.value))
  const observedCandidates = (tokens.candidates?.values || [])
    .filter((candidate) => candidate.group === candidateGroup && isDirectlyObservedCandidate(candidate))
    .filter((candidate) => {
      if (seenValues.has(candidate.value)) return false
      seenValues.add(candidate.value)
      return true
    })
    .map((candidate): ComparableTokenEntry => {
      const candidateId =
        candidate.id || tokenCandidateId(candidate.group, candidate.value, candidate.role, candidate.provenance)
      return {
        id: candidateId,
        value: candidate.value,
        candidateId,
        candidateGroup: candidate.group,
        candidateRole: candidate.role,
      }
    })
  return [...portable, ...observedCandidates]
}

function comparableNamedColors(tokens: DesignToken): Record<string, ComparableTokenEntry> {
  const result: Record<string, ComparableTokenEntry> = {}
  for (const candidate of tokens.candidates?.values || []) {
    if (
      candidate.group !== 'colors' ||
      !candidate.role ||
      candidate.provenance === 'observed-color' ||
      !isDirectlyObservedCandidate(candidate)
    ) {
      continue
    }
    if (result[candidate.role] !== undefined) continue
    const candidateId =
      candidate.id || tokenCandidateId(candidate.group, candidate.value, candidate.role, candidate.provenance)
    result[candidate.role] = {
      id: `color.${candidate.role}`,
      value: candidate.value,
      candidateId,
      candidateGroup: candidate.group,
      candidateRole: candidate.role,
    }
  }
  for (const entry of canonicalTokenEntriesForGroup(tokens, 'colors')) {
    result[entry.role!] = {
      id: entry.id,
      value: entry.value,
      publicRef: entry.id,
      evidencePath: entry.evidencePath,
    }
  }
  return result
}

function comparableObservedColorCandidates(
  tokens: DesignToken,
  evidence: DesignEvidence | null | undefined,
): ComparableTokenEntry[] {
  const result = new Map<string, ComparableTokenEntry>()
  for (const candidate of tokens.candidates?.values || []) {
    if (candidate.group !== 'colors' || !isDirectlyObservedCandidate(candidate)) continue
    const value = normalizeColorValue(candidate.value) || candidate.value
    const role = candidate.role || 'unassigned'
    const key = JSON.stringify([role, value])
    const candidateId =
      candidate.id || tokenCandidateId(candidate.group, candidate.value, candidate.role, candidate.provenance)
    result.set(key, {
      id: candidateId,
      value,
      candidateId,
      candidateGroup: candidate.group,
      candidateRole: candidate.role,
      candidateEvidenceSignature: candidateEvidenceSignature(candidate, evidence),
    })
  }
  return [...result.values()].sort(
    (first, second) =>
      (first.candidateRole || '').localeCompare(second.candidateRole || '') || first.value.localeCompare(second.value),
  )
}

function candidateEvidenceIdsForEntry(evidence: DesignEvidence, entry: ComparableTokenEntry): string[] {
  const candidates = (evidence.tokens.candidates?.values || []).filter((candidate) => {
    if (!isDirectlyObservedCandidate(candidate)) return false
    const candidateId =
      candidate.id || tokenCandidateId(candidate.group, candidate.value, candidate.role, candidate.provenance)
    if (entry.candidateId) return candidateId === entry.candidateId
    return (
      candidate.group === entry.candidateGroup &&
      candidate.value === entry.value &&
      candidate.role === entry.candidateRole
    )
  })
  const routeRefs = new Set(candidates.flatMap((candidate) => candidate.evidence.pageRefs || []))
  if (routeRefs.size > 0) {
    return evidence.pages
      .filter((page) => routeRefs.has(evidencePageRouteIdentity(page)))
      .map((page) => page.id)
      .slice(0, 8)
  }
  const routes = new Set(candidates.flatMap((candidate) => candidate.evidence.pages).map(routeIdentityFromUrl))
  return evidence.pages
    .filter((page) => routes.has(routeIdentityFromUrl(page.url)))
    .map((page) => page.id)
    .slice(0, 8)
}

function evidenceIdsForEntry(evidence: DesignEvidence, entry: ComparableTokenEntry): string[] {
  if (entry.publicRef) {
    const direct = [
      ...evidence.sections.filter((item) => item.tokenRefs.includes(entry.publicRef!)).map((item) => item.id),
      ...evidence.components.filter((item) => item.tokenRefs.includes(entry.publicRef!)).map((item) => item.id),
      ...evidence.layoutNodes.filter((item) => item.tokenRefs.includes(entry.publicRef!)).map((item) => item.id),
    ]
    if (direct.length > 0) return [...new Set(direct)].slice(0, 8)
  }

  const candidateIds = candidateEvidenceIdsForEntry(evidence, entry)
  if (candidateIds.length > 0) return [...new Set(candidateIds)].slice(0, 8)

  const tokenEvidence = entry.evidencePath ? evidence.tokens.evidence?.[entry.evidencePath] : undefined
  if (tokenEvidence?.pageRefs?.length) {
    const routeRefs = new Set(tokenEvidence.pageRefs)
    const pages = evidence.pages.filter((page) => routeRefs.has(evidencePageRouteIdentity(page))).map((page) => page.id)
    if (pages.length > 0) return [...new Set(pages)].slice(0, 8)
  }
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
  from?: ComparableTokenEntry,
  to?: ComparableTokenEntry,
): ReferenceComparisonChange {
  return {
    id: `${category}:${kind}:${tokenPath}`,
    category,
    kind,
    tokenPath,
    ...(from !== undefined ? { from: from.value } : {}),
    ...(to !== undefined ? { to: to.value } : {}),
    referenceEvidenceIds: from !== undefined && reference.evidence ? evidenceIdsForEntry(reference.evidence, from) : [],
    targetEvidenceIds: to !== undefined && target.evidence ? evidenceIdsForEntry(target.evidence, to) : [],
  }
}

function compareNamedColors(
  reference: ReferenceCaptureInput,
  target: ReferenceCaptureInput,
): ReferenceComparisonChange[] {
  const changes: ReferenceComparisonChange[] = []
  const isGeneratedPaletteName = (name: string) => /^(?:dark-)?palette-\d+$/.test(name)
  const referenceColors = comparableNamedColors(reference.tokens)
  const targetColors = comparableNamedColors(target.tokens)
  const names = [...new Set([...Object.keys(referenceColors), ...Object.keys(targetColors)])]
    .filter((name) => !isGeneratedPaletteName(name))
    .sort()
  for (const name of names) {
    const from = referenceColors[name]
    const to = targetColors[name]
    const tokenPath = `color.${name}`
    if (from === undefined) changes.push(change('colors', 'added', tokenPath, reference, target, undefined, to))
    else if (to === undefined) changes.push(change('colors', 'removed', tokenPath, reference, target, from))
    else if (from.value !== to.value) changes.push(change('colors', 'changed', tokenPath, reference, target, from, to))
  }

  for (const prefix of ['', 'dark-']) {
    const pattern = new RegExp(`^${prefix}palette-\\d+$`)
    const referencePalette = new Map(Object.entries(referenceColors).filter(([name]) => pattern.test(name)))
    const targetPalette = new Map(Object.entries(targetColors).filter(([name]) => pattern.test(name)))
    const targetPaletteValues = new Set([...targetPalette.values()].map((entry) => entry.value))
    const sharedValues = new Set(
      [...referencePalette.values()].map((entry) => entry.value).filter((value) => targetPaletteValues.has(value)),
    )
    const remainingReference = new Map([...referencePalette].filter(([, entry]) => !sharedValues.has(entry.value)))
    const remainingTarget = new Map([...targetPalette].filter(([, entry]) => !sharedValues.has(entry.value)))
    const stableNames = [...remainingReference.keys()].filter((name) => remainingTarget.has(name)).sort()

    for (const name of stableNames) {
      const from = remainingReference.get(name)!
      const to = remainingTarget.get(name)!
      changes.push(change('colors', 'changed', `color.${name}`, reference, target, from, to))
      remainingReference.delete(name)
      remainingTarget.delete(name)
    }
    for (const [name, value] of [...remainingReference].sort(([first], [second]) => first.localeCompare(second))) {
      changes.push(change('colors', 'removed', `color.${name}`, reference, target, value))
    }
    for (const [name, value] of [...remainingTarget].sort(([first], [second]) => first.localeCompare(second))) {
      changes.push(change('colors', 'added', `color.${name}`, reference, target, undefined, value))
    }
  }

  const referenceCandidates = comparableObservedColorCandidates(reference.tokens, reference.evidence)
  const targetCandidates = comparableObservedColorCandidates(target.tokens, target.evidence)
  const referenceKeys = new Map(
    referenceCandidates.map((entry) => [JSON.stringify([entry.candidateRole || '', entry.value]), entry]),
  )
  const targetKeys = new Map(
    targetCandidates.map((entry) => [JSON.stringify([entry.candidateRole || '', entry.value]), entry]),
  )
  for (const [key, entry] of referenceKeys) {
    const targetEntry = targetKeys.get(key)
    if (!targetEntry) {
      changes.push(change('colors', 'removed', entry.id, reference, target, entry))
      continue
    }
    if (entry.candidateEvidenceSignature !== targetEntry.candidateEvidenceSignature) {
      changes.push(
        change(
          'colors',
          'changed',
          `${entry.id}.provenance`,
          reference,
          target,
          { ...entry, value: entry.candidateEvidenceSignature || '' },
          { ...targetEntry, value: targetEntry.candidateEvidenceSignature || '' },
        ),
      )
    }
  }
  for (const [key, entry] of targetKeys) {
    if (referenceKeys.has(key)) continue
    changes.push(change('colors', 'added', entry.id, reference, target, undefined, entry))
  }
  return changes
}

function compareScale(
  category: Exclude<ReferenceComparisonCategory, 'colors'>,
  referenceEntries: ComparableTokenEntry[],
  targetEntries: ComparableTokenEntry[],
  reference: ReferenceCaptureInput,
  target: ReferenceCaptureInput,
): ReferenceComparisonChange[] {
  const changes: ReferenceComparisonChange[] = []
  const referenceSet = new Set(referenceEntries.map((entry) => entry.value))
  const targetSet = new Set(targetEntries.map((entry) => entry.value))
  for (const entry of referenceEntries) {
    if (targetSet.has(entry.value)) continue
    changes.push(change(category, 'removed', entry.id, reference, target, entry))
  }
  for (const entry of targetEntries) {
    if (referenceSet.has(entry.value)) continue
    changes.push(change(category, 'added', entry.id, reference, target, undefined, entry))
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
      comparableScaleEntries(reference.tokens, group),
      comparableScaleEntries(target.tokens, group),
      reference,
      target,
    ),
  )
}

function categoryResult(
  category: ReferenceComparisonCategory,
  changes: ReferenceComparisonChange[],
  inconclusive: boolean,
  partialCoverage = false,
): ReferenceCategoryComparison {
  return {
    category,
    status: inconclusive ? 'inconclusive' : changes.length > 0 ? 'changed' : 'unchanged',
    coverage: inconclusive ? 'none' : partialCoverage ? 'partial' : 'complete',
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
  directlyObservedValues: Map<string, string[]>
}

function normalizedTransformNumber(value: number): string {
  const normalized = Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(6))
  return String(normalized)
}

function normalizedTransformMatrix(values: number[]): string {
  return `matrix(${values.map(normalizedTransformNumber).join(', ')})`
}

function parsedNumber(value: string): number | null {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parsedPixelLength(value: string): number | null {
  const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px)?$/i)
  if (!match) return null
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed) || (!match[2] && parsed !== 0)) return null
  return parsed
}

/** Normalize only transforms whose 2D equivalence can be proven without element geometry. */
function normalizedInteractionTransform(value: string | undefined): string {
  const normalized = normalizedText(value) || 'none'
  if (normalized.toLowerCase() === 'none') return normalizedTransformMatrix([1, 0, 0, 1, 0, 0])

  const matrix = normalized.match(/^matrix\(([^)]+)\)$/i)
  if (matrix) {
    const values = matrix[1].split(',').map(parsedNumber)
    if (values.length === 6 && values.every((item): item is number => item !== null)) {
      return normalizedTransformMatrix(values)
    }
  }

  const translateX = normalized.match(/^translateX\(([^)]+)\)$/i)
  if (translateX) {
    const x = parsedPixelLength(translateX[1])
    if (x !== null) return normalizedTransformMatrix([1, 0, 0, 1, x, 0])
  }

  const translateY = normalized.match(/^translateY\(([^)]+)\)$/i)
  if (translateY) {
    const y = parsedPixelLength(translateY[1])
    if (y !== null) return normalizedTransformMatrix([1, 0, 0, 1, 0, y])
  }

  const translate = normalized.match(/^translate\(([^)]+)\)$/i)
  if (translate) {
    const values = translate[1].split(/\s*,\s*|\s+/).filter(Boolean)
    const x = parsedPixelLength(values[0] || '')
    const y = parsedPixelLength(values[1] || '0')
    if (values.length <= 2 && x !== null && y !== null) {
      return normalizedTransformMatrix([1, 0, 0, 1, x, y])
    }
  }

  return normalized
}

function normalizedInteractionValue(property: string, value: string | undefined): string {
  return property === 'transform' ? normalizedInteractionTransform(value) : normalizedText(value) || ''
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
    const before = Object.fromEntries(
      properties.map((property) => [property, normalizedInteractionValue(property, observation.before[property])]),
    )
    const after = Object.fromEntries(
      properties.map((property) => [property, normalizedInteractionValue(property, observation.after[property])]),
    )
    const value = JSON.stringify({ before, after })
    const group = groups.get(key) || {
      tokenPath,
      values: new Map<string, string[]>(),
      directlyObservedValues: new Map<string, string[]>(),
    }
    const evidenceIds = group.values.get(value) || []
    evidenceIds.push(observation.id)
    group.values.set(value, evidenceIds)
    if (properties.some((property) => Object.hasOwn(observation.before, property))) {
      const observedEvidenceIds = group.directlyObservedValues.get(value) || []
      observedEvidenceIds.push(observation.id)
      group.directlyObservedValues.set(value, observedEvidenceIds)
    }
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    if (group.directlyObservedValues.size > 0) group.values = group.directlyObservedValues
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
    .map(([property, values]) => {
      const display = (candidate: string | number | undefined): string | number => {
        if (property === 'gridTemplateColumns' || property === 'childGridTemplateColumns') {
          return topLevelGridColumnCount(candidate) ?? candidate ?? '—'
        }
        return candidate ?? '—'
      }
      return `${property}: ${display(values.from)} → ${display(values.to)}`
    })
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
  const partialCoverage =
    comparability.excludedPages.length > 0 || comparability.limitations.includes('incomplete-coverage')
  const comparedReference = inconclusive
    ? reference
    : captureForComparedPages(reference, comparability.comparedPageKeys)
  const comparedTarget = inconclusive ? target : captureForComparedPages(target, comparability.comparedPageKeys)
  const entityMatching =
    !inconclusive && comparedReference.evidence && comparedTarget.evidence
      ? matchCrossCaptureEntities(comparedReference.evidence, comparedTarget.evidence)
      : null
  const categories = inconclusive
    ? (['colors', 'typography', 'spacing', 'radii', 'layout', 'interaction-states', 'responsive'] as const).map(
        (category) => categoryResult(category, [], true),
      )
    : ([
        categoryResult('colors', compareNamedColors(comparedReference, comparedTarget), false, partialCoverage),
        categoryResult('typography', compareTypography(comparedReference, comparedTarget), false, partialCoverage),
        categoryResult(
          'spacing',
          compareScale(
            'spacing',
            comparableScaleEntries(comparedReference.tokens, 'spacing'),
            comparableScaleEntries(comparedTarget.tokens, 'spacing'),
            comparedReference,
            comparedTarget,
          ),
          false,
          partialCoverage,
        ),
        categoryResult(
          'radii',
          compareScale(
            'radii',
            comparableScaleEntries(comparedReference.tokens, 'radii'),
            comparableScaleEntries(comparedTarget.tokens, 'radii'),
            comparedReference,
            comparedTarget,
          ),
          false,
          partialCoverage,
        ),
        compareLayoutEvidence(comparedReference.evidence, comparedTarget.evidence, entityMatching, false),
        compareInteractionEvidence(comparedReference.evidence, comparedTarget.evidence, false),
        compareResponsiveEvidence(comparedReference.evidence, comparedTarget.evidence, entityMatching, false),
      ] satisfies ReferenceCategoryComparison[])
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
      excludedPages: comparability.excludedPages,
      differences: comparability.differences,
    },
    categories,
    entityMatching,
    summary: { changedCategories, changedItems },
  }
}
