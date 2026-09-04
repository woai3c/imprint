import { normalizeColorValue } from './color-cluster.js'
import { isFoundationForegroundPair, isPrimaryForegroundPair } from './color-pair-evidence.js'
import { normalizeCssFontFamilyList, normalizeCssFontFamilyName, primaryCssFontFamily } from './font-family.js'
import { hasValidRenderedTextPaintEvidence } from './rendered-text-evidence.js'
import { colorContrast } from './token-builder.js'
import { canonicalTokenEntriesForGroup, tokenCandidateId } from './token-catalog.js'
import { hasGenericRenderedFoundationFallback, hasValueSpecificFoundationEvidence } from './token-evidence.js'
import type { DesignToken, TokenCandidateGroup, TokenEvidence, TokenValueCandidate } from './types.js'
import { isOpaqueRouteIdentity } from './url-identity.js'

type ArrayTokenGroup = Exclude<TokenCandidateGroup, 'colors'>

const TYPOGRAPHY_GROUPS = [
  'fontFamilies',
  'fontStacks',
  'fontSizes',
  'fontWeights',
  'lineHeights',
  'letterSpacings',
] as const

const ARRAY_GROUPS = ['spacing', 'radii', 'shadows', 'borders', 'zIndices', 'transitions'] as const

const RENDERED_TEXT_OWNER_PAGE_CAP = 8

function approximatelyEqual(first: number | undefined, second: number, tolerance = 0.0015): boolean {
  return Number.isFinite(first) && Math.abs((first as number) - second) <= tolerance
}

function cssPixels(value: string | undefined): number | null {
  const match = value?.trim().match(/^(-?\d*\.?\d+)(px|rem)$/i)
  if (!match) return null
  const amount = Number.parseFloat(match[1])
  return match[2].toLowerCase() === 'rem' ? amount * 16 : amount
}

function renderedOwnerSupportsEvidence(path: string, evidence: TokenEvidence): boolean {
  const owners = evidence.renderedTextOwners || []
  const groupPath = path.replace(/\.\d+$/, '')
  const pairedBackground = normalizeColorValue(evidence.pairedSurface?.background || '')
  return owners.every((owner) => {
    if (!owner.ownerId || !hasValidRenderedTextPaintEvidence(owner.source)) return false
    if (owner.source.glyphPaintKind === 'background-clip' && owner.styles.color !== undefined) return false
    if (groupPath === 'typography.fontFamilies') {
      return (
        normalizeCssFontFamilyName(primaryCssFontFamily(owner.styles.fontFamily)) ===
        normalizeCssFontFamilyName(evidence.value)
      )
    }
    if (groupPath === 'typography.fontStacks') {
      return normalizeCssFontFamilyList(owner.styles.fontFamily) === normalizeCssFontFamilyList(evidence.value)
    }
    if (groupPath === 'typography.fontSizes') {
      const ownerPixels = cssPixels(owner.styles.fontSize)
      const valuePixels = cssPixels(evidence.value)
      return ownerPixels !== null && valuePixels !== null && Math.abs(ownerPixels - valuePixels) < 0.01
    }
    if (groupPath === 'typography.fontWeights') return owner.styles.fontWeight === evidence.value
    if (groupPath === 'typography.lineHeights') {
      const fontSize = Number.parseFloat(owner.styles.fontSize)
      const lineHeight = Number.parseFloat(owner.styles.lineHeight)
      const ratio = fontSize > 0 && lineHeight > 0 ? lineHeight / fontSize : Number.NaN
      return owner.styles.lineHeight === evidence.value || approximatelyEqual(ratio, Number.parseFloat(evidence.value))
    }
    if (groupPath === 'typography.letterSpacings') return owner.styles.letterSpacing === evidence.value
    if (groupPath.startsWith('colors.')) {
      const value = normalizeColorValue(evidence.value)
      const ownerForeground = normalizeColorValue(owner.styles.color || '')
      const sourceForeground = normalizeColorValue(owner.source.foreground || '')
      const ownerBackground = normalizeColorValue(owner.styles.backgroundColor || '')
      return (
        value !== null &&
        value === ownerForeground &&
        value === sourceForeground &&
        pairedBackground !== null &&
        pairedBackground === ownerBackground &&
        owner.source.glyphPaintKind === 'solid-color' &&
        owner.source.opacity >= 0.999 &&
        owner.source.filterOpacity >= 0.999
      )
    }
    return true
  })
}

function semanticConfidence(evidence: TokenEvidence): TokenEvidence['confidence'] {
  return evidence.semanticConfidence || evidence.confidence
}

function hasPortableEvidenceCoverage(evidence: TokenEvidence, sourcePath: string | undefined): boolean {
  const requiredCounts = [
    evidence.observationCount,
    evidence.ownerCount,
    evidence.pageCount,
    evidence.captureCount,
    evidence.eligiblePageCount,
  ]
  const optionalCounts = [evidence.foundationOwnerCount, evidence.minimumPageFoundationOwnerCount].filter(
    (value) => value !== undefined,
  )
  const aggregateCounts = [...Object.values(evidence.sourceCounts || {}), ...Object.values(evidence.roleCounts || {})]
  const declared = evidence.sources.some(
    (source) =>
      source.startsWith('css-variable:') || source === 'usage:declaredColor' || source === 'usage:brandTokenColor',
  )
  const rendered = evidence.sources.some(
    (source) =>
      source === 'rendered:text' ||
      source.startsWith('computed:') ||
      source.startsWith('element:') ||
      (source.startsWith('usage:') && !['usage:declaredColor', 'usage:brandTokenColor'].includes(source)),
  )
  const pageSupportRatio = evidence.pageCount / (evidence.eligiblePageCount || 1)
  const permitsPairedCoverage = ['colors.foreground', 'colors.muted-foreground'].includes(sourcePath || '')
  const isContentSurfaceRole = ['colors.surface', 'colors.secondary'].includes(sourcePath || '')
  const hasContentSurfaceEvidence =
    isContentSurfaceRole &&
    evidence.sources.includes('semantic:content-surface') &&
    evidence.sources.includes('element:content-surface')
  const permitsCrossPageContentSurface =
    hasContentSurfaceEvidence && evidence.pageCount >= 2 && (evidence.ownerCount || 0) >= evidence.pageCount
  const meetsFoundationCoverage =
    evidence.pairedSurface && permitsPairedCoverage
      ? hasConsistentRenderedPairOwners(evidence)
      : evidence.eligiblePageCount === 1
        ? evidence.pageCount === 1 &&
          (isContentSurfaceRole
            ? hasContentSurfaceEvidence && rendered && (evidence.ownerCount || 0) >= 2
            : (rendered && (evidence.ownerCount || 0) >= 2) ||
              (declared && rendered && (evidence.ownerCount || 0) >= 1) ||
              (evidence.sources.includes('element:page-background') && (evidence.ownerCount || 0) >= 1))
        : isContentSurfaceRole
          ? permitsCrossPageContentSurface
          : (evidence.eligiblePageCount || 0) >= 2 &&
            evidence.pageCount >= 2 &&
            pageSupportRatio >= 0.75 &&
            (evidence.ownerCount || 0) >= evidence.pageCount
  return (
    requiredCounts.every((value) => Number.isInteger(value)) &&
    optionalCounts.every((value) => Number.isInteger(value) && (value as number) >= 0) &&
    aggregateCounts.every((value) => Number.isInteger(value) && value >= 0) &&
    (!evidence.pairedSurface || permitsPairedCoverage) &&
    evidence.observationCount > 0 &&
    (evidence.ownerCount || 0) > 0 &&
    evidence.pageCount > 0 &&
    evidence.captureCount >= evidence.pageCount &&
    (evidence.eligiblePageCount || 0) >= evidence.pageCount &&
    approximatelyEqual(evidence.pageSupportRatio, pageSupportRatio) &&
    meetsFoundationCoverage
  )
}

function hasContextIndependentRenderedOwners(evidence: TokenEvidence): boolean {
  const owners = evidence.renderedTextOwners || []
  return (
    owners.length > 0 &&
    owners.every(
      (owner) =>
        isOpaqueRouteIdentity(owner.routeId) &&
        Array.isArray(owner.source.maskChain) &&
        owner.source.maskChain.length === 0 &&
        Array.isArray(owner.source.blendChain) &&
        owner.source.blendChain.length === 0,
    )
  )
}

function hasFoundationRenderedOwnerSupport(evidence: TokenEvidence): boolean {
  const owners = evidence.renderedTextOwners || []
  const ownersByRoute = new Map<string, Set<string>>()
  const pageByRoute = new Map<string, string>()
  for (const owner of owners) {
    const routeOwners = ownersByRoute.get(owner.routeId) || new Set<string>()
    if (!owner.ownerId || routeOwners.has(owner.ownerId)) return false
    const routePage = pageByRoute.get(owner.routeId)
    if (routePage !== undefined && routePage !== owner.page) return false
    routeOwners.add(owner.ownerId)
    ownersByRoute.set(owner.routeId, routeOwners)
    pageByRoute.set(owner.routeId, owner.page)
  }

  const uniqueOwnerCount = [...ownersByRoute.values()].reduce((total, routeOwners) => total + routeOwners.size, 0)
  const saturated = [...ownersByRoute.values()].some((routeOwners) => routeOwners.size >= RENDERED_TEXT_OWNER_PAGE_CAP)
  const routeIds = [...ownersByRoute.keys()].sort()
  const pages = [...pageByRoute.values()].sort()
  const declared = evidence.sources.some(
    (source) =>
      source.startsWith('css-variable:') || source === 'usage:declaredColor' || source === 'usage:brandTokenColor',
  )
  const onePageMinimum = declared ? 1 : 2
  const meetsFoundationThreshold =
    evidence.eligiblePageCount === 1
      ? evidence.pageCount === 1 && uniqueOwnerCount >= onePageMinimum
      : (evidence.pageCount || 0) >= 2 &&
        (evidence.pageSupportRatio || 0) >= 0.75 &&
        uniqueOwnerCount >= (evidence.pageCount || 0)

  return (
    routeIds.length === evidence.pageCount &&
    (evidence.pageRefs === undefined || [...evidence.pageRefs].sort().join('\u0000') === routeIds.join('\u0000')) &&
    [...evidence.pages].sort().join('\u0000') === pages.join('\u0000') &&
    Number.isFinite(evidence.ownerCount) &&
    (evidence.ownerCount || 0) >= uniqueOwnerCount &&
    (saturated || evidence.ownerCount === uniqueOwnerCount) &&
    evidence.observationCount === evidence.ownerCount &&
    meetsFoundationThreshold
  )
}

function hasAuditablePairedRoutes(evidence: TokenEvidence): boolean {
  if (!evidence.pairedSurface) return true
  const routes = evidence.pairedSurface.routeSupport || []
  const routeIds = routes.map((route) => route.routeId)
  return (
    routes.length === evidence.pairedSurface.eligiblePageCount &&
    routeIds.every(isOpaqueRouteIdentity) &&
    new Set(routeIds).size === routeIds.length
  )
}

function hasConsistentRenderedPairOwners(evidence: TokenEvidence): boolean {
  const pairedSurface = evidence.pairedSurface
  const renderedOwners = evidence.renderedTextOwners || []
  if (!pairedSurface || renderedOwners.length === 0) return false

  const sampledOwnersByRoute = new Map<string, Set<string>>()
  for (const owner of renderedOwners) {
    if (!owner.ownerId) return false
    const routeOwners = sampledOwnersByRoute.get(owner.routeId) || new Set<string>()
    if (routeOwners.has(owner.ownerId)) return false
    routeOwners.add(owner.ownerId)
    sampledOwnersByRoute.set(owner.routeId, routeOwners)
  }

  let ownerCount = 0
  let minimumPageOwnerCount = Number.POSITIVE_INFINITY
  let mainTextPageCount = 0
  let mainTextOwnerCount = 0
  let headingPageCount = 0
  let headingOwnerCount = 0
  let normalizedShare = 0
  let normalizedMainTextShare = 0
  const supportedRouteIds = new Set<string>()
  const supportedPages: string[] = []
  const textRoles = new Set<string>()
  for (const route of pairedSurface.routeSupport) {
    const ownerIds = new Set(route.ownerIds)
    const totalOwnerIds = new Set(route.totalOwnerIds)
    const mainTextOwnerIds = new Set(route.mainTextOwnerIds)
    const headingOwnerIds = new Set(route.headingOwnerIds)
    if (
      ownerIds.size !== route.ownerIds.length ||
      totalOwnerIds.size !== route.totalOwnerIds.length ||
      mainTextOwnerIds.size !== route.mainTextOwnerIds.length ||
      headingOwnerIds.size !== route.headingOwnerIds.length ||
      [...ownerIds].some((ownerId) => !ownerId || !totalOwnerIds.has(ownerId)) ||
      [...mainTextOwnerIds].some((ownerId) => !ownerIds.has(ownerId)) ||
      [...headingOwnerIds].some((ownerId) => !mainTextOwnerIds.has(ownerId)) ||
      route.supported !== ownerIds.size > 0
    ) {
      return false
    }
    const expectedShare = totalOwnerIds.size > 0 ? ownerIds.size / totalOwnerIds.size : 0
    const expectedMainTextShare = totalOwnerIds.size > 0 ? mainTextOwnerIds.size / totalOwnerIds.size : 0
    if (
      !approximatelyEqual(route.normalizedShare, expectedShare) ||
      !approximatelyEqual(route.normalizedMainTextShare, expectedMainTextShare)
    ) {
      return false
    }
    for (const role of route.textRoles) textRoles.add(role)
    const sampledOwners = sampledOwnersByRoute.get(route.routeId) || new Set<string>()
    if (!route.supported) {
      if (sampledOwners.size > 0) return false
      continue
    }
    if (
      sampledOwners.size !== Math.min(RENDERED_TEXT_OWNER_PAGE_CAP, ownerIds.size) ||
      [...sampledOwners].some((ownerId) => !ownerIds.has(ownerId))
    ) {
      return false
    }
    const sampledOwnerRecords = renderedOwners.filter((owner) => owner.routeId === route.routeId)
    if (
      sampledOwnerRecords.some((owner) => {
        const mainText = owner.textRole === 'body' || owner.textRole === 'heading'
        return (
          !route.textRoles.includes(owner.textRole) ||
          mainTextOwnerIds.has(owner.ownerId) !== mainText ||
          headingOwnerIds.has(owner.ownerId) !== (owner.textRole === 'heading')
        )
      })
    ) {
      return false
    }
    supportedRouteIds.add(route.routeId)
    supportedPages.push(route.page)
    ownerCount += ownerIds.size
    minimumPageOwnerCount = Math.min(minimumPageOwnerCount, ownerIds.size)
    normalizedShare += expectedShare
    normalizedMainTextShare += expectedMainTextShare
    if (mainTextOwnerIds.size > 0) mainTextPageCount += 1
    mainTextOwnerCount += mainTextOwnerIds.size
    if (headingOwnerIds.size > 0) headingPageCount += 1
    headingOwnerCount += headingOwnerIds.size
  }

  const eligiblePageCount = pairedSurface.routeSupport.length
  const pageCount = supportedRouteIds.size
  const claimedRouteIds = [...(evidence.pageRefs || [])].sort()
  const claimedPages = [...evidence.pages].sort()
  const contrast = colorContrast(evidence.value, pairedSurface.background)
  return (
    [...sampledOwnersByRoute.keys()].every((routeId) => supportedRouteIds.has(routeId)) &&
    pairedSurface.eligiblePageCount === eligiblePageCount &&
    pairedSurface.pageCount === pageCount &&
    pairedSurface.ownerCount === ownerCount &&
    pairedSurface.minimumPageOwnerCount === (pageCount > 0 ? minimumPageOwnerCount : 0) &&
    pairedSurface.mainTextPageCount === mainTextPageCount &&
    pairedSurface.mainTextOwnerCount === mainTextOwnerCount &&
    pairedSurface.headingPageCount === headingPageCount &&
    pairedSurface.headingOwnerCount === headingOwnerCount &&
    approximatelyEqual(pairedSurface.pageSupportRatio, pageCount / Math.max(eligiblePageCount, 1)) &&
    approximatelyEqual(pairedSurface.normalizedShare, normalizedShare / Math.max(eligiblePageCount, 1)) &&
    approximatelyEqual(
      pairedSurface.normalizedMainTextShare,
      normalizedMainTextShare / Math.max(eligiblePageCount, 1),
    ) &&
    [...textRoles].sort().join('\u0000') === [...pairedSurface.textRoles].sort().join('\u0000') &&
    (evidence.pageRefs === undefined ||
      claimedRouteIds.join('\u0000') === [...supportedRouteIds].sort().join('\u0000')) &&
    claimedPages.join('\u0000') === supportedPages.sort().join('\u0000') &&
    evidence.ownerCount === pairedSurface.ownerCount &&
    evidence.observationCount === pairedSurface.ownerCount &&
    evidence.pageCount === pairedSurface.pageCount &&
    evidence.eligiblePageCount === pairedSurface.eligiblePageCount &&
    approximatelyEqual(evidence.pageSupportRatio, pairedSurface.pageSupportRatio) &&
    contrast !== null &&
    approximatelyEqual(pairedSurface.contrastRatio, contrast, 0.011)
  )
}

export function isPortableTokenEvidence(evidence: TokenEvidence | undefined, sourcePath?: string): boolean {
  return Boolean(
    evidence &&
    hasPortableEvidenceCoverage(evidence, sourcePath) &&
    Number.isFinite(evidence.semanticAgreement) &&
    (evidence.semanticAgreement || 0) >= 0 &&
    (evidence.semanticAgreement || 0) <= 1 &&
    Number.isFinite(evidence.pageSupportRatio) &&
    (evidence.pageSupportRatio || 0) >= 0 &&
    (evidence.pageSupportRatio || 0) <= 1 &&
    semanticConfidence(evidence) !== 'low' &&
    evidence.reuseScope === 'foundation' &&
    hasAuditablePairedRoutes(evidence) &&
    (!evidence.pairedSurface ||
      (evidence.sources.includes('rendered:text') && hasContextIndependentRenderedOwners(evidence))),
  )
}

export function hasRequiredRenderedOwnerEvidence(path: string, evidence: TokenEvidence): boolean {
  if (path.startsWith('typography.')) {
    return (
      evidence.sources.includes('rendered:text') &&
      hasContextIndependentRenderedOwners(evidence) &&
      hasFoundationRenderedOwnerSupport(evidence) &&
      renderedOwnerSupportsEvidence(path, evidence)
    )
  }
  if (!['colors.foreground', 'colors.muted-foreground'].includes(path)) return true
  const hasPairMarkers =
    evidence.sources.includes('rendered:text') &&
    evidence.sources.includes('observed:text-background-pair') &&
    evidence.reasons.includes('paired-surface')
  if (!hasPairMarkers || !hasContextIndependentRenderedOwners(evidence) || !hasAuditablePairedRoutes(evidence)) {
    return false
  }
  if (!hasConsistentRenderedPairOwners(evidence) || !renderedOwnerSupportsEvidence(path, evidence)) return false
  return path === 'colors.foreground'
    ? isPrimaryForegroundPair(evidence.pairedSurface)
    : isFoundationForegroundPair(evidence.pairedSurface)
}

const TOKEN_CONFIDENCE_VALUES = new Set(['high', 'medium', 'low'])
const TOKEN_REUSE_SCOPE_VALUES = new Set([
  'foundation',
  'component',
  'specialized-content',
  'local',
  'declared-only',
  'unknown',
])
const TOKEN_EVIDENCE_REASON_VALUES = new Set([
  'cross-page',
  'declared-token',
  'declared-only',
  'interactive-use',
  'rendered-use',
  'computed-style',
  'paired-surface',
])
const TOKEN_CANDIDATE_GROUP_VALUES = new Set<TokenCandidateGroup>([
  'colors',
  ...TYPOGRAPHY_GROUPS.map((group) => `typography.${group}` as const),
  ...ARRAY_GROUPS,
])
const TOKEN_CANDIDATE_REJECTION_VALUES = new Set<TokenValueCandidate['rejectionReason']>([
  'low-semantic-confidence',
  'component-scope',
  'local-scope',
  'declared-only',
  'unknown-scope',
  'unassigned-role',
  'not-in-base-catalog',
  'ungrounded-dark-override',
])
const TEXT_ROLE_VALUES = new Set(['body', 'heading', 'label', 'other'])

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isBoundedRatio(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function hasValidCountMap(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.values(value).every(isNonNegativeInteger))
  )
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0)
}

function hasCompletePairedSurfaceEnvelope(evidence: TokenEvidence): boolean {
  const pair = evidence.pairedSurface
  if (!pair) return true
  if (
    typeof pair.background !== 'string' ||
    pair.background.length === 0 ||
    !isNonNegativeInteger(pair.pageCount) ||
    !isNonNegativeInteger(pair.eligiblePageCount) ||
    !isNonNegativeInteger(pair.ownerCount) ||
    !isNonNegativeInteger(pair.minimumPageOwnerCount) ||
    !isNonNegativeInteger(pair.mainTextPageCount) ||
    !isNonNegativeInteger(pair.mainTextOwnerCount) ||
    !isNonNegativeInteger(pair.headingPageCount) ||
    !isNonNegativeInteger(pair.headingOwnerCount) ||
    !isBoundedRatio(pair.pageSupportRatio) ||
    !isBoundedRatio(pair.normalizedShare) ||
    !isBoundedRatio(pair.normalizedMainTextShare) ||
    typeof pair.contrastRatio !== 'number' ||
    !Number.isFinite(pair.contrastRatio) ||
    pair.contrastRatio < 0 ||
    !Array.isArray(pair.textRoles) ||
    !pair.textRoles.every((role) => TEXT_ROLE_VALUES.has(role)) ||
    !Array.isArray(pair.routeSupport) ||
    pair.routeSupport.length !== pair.eligiblePageCount
  ) {
    return false
  }
  return pair.routeSupport.every(
    (route) =>
      route &&
      typeof route.page === 'string' &&
      route.page.length > 0 &&
      typeof route.routeId === 'string' &&
      route.routeId.length > 0 &&
      typeof route.supported === 'boolean' &&
      isStringList(route.ownerIds) &&
      isStringList(route.totalOwnerIds) &&
      isStringList(route.mainTextOwnerIds) &&
      isStringList(route.headingOwnerIds) &&
      Array.isArray(route.textRoles) &&
      route.textRoles.every((role) => TEXT_ROLE_VALUES.has(role)) &&
      isBoundedRatio(route.normalizedShare) &&
      isBoundedRatio(route.normalizedMainTextShare),
  )
}

function hasCompleteRenderedOwnerEnvelope(evidence: TokenEvidence): boolean {
  if (evidence.renderedTextOwners === undefined) return true
  if (!Array.isArray(evidence.renderedTextOwners)) return false
  return evidence.renderedTextOwners.every(
    (owner) =>
      owner &&
      typeof owner.ownerId === 'string' &&
      owner.ownerId.length > 0 &&
      typeof owner.page === 'string' &&
      owner.page.length > 0 &&
      typeof owner.routeId === 'string' &&
      owner.routeId.length > 0 &&
      typeof owner.viewport === 'string' &&
      owner.viewport.length > 0 &&
      TEXT_ROLE_VALUES.has(owner.textRole) &&
      owner.styles &&
      typeof owner.styles.fontFamily === 'string' &&
      typeof owner.styles.fontSize === 'string' &&
      typeof owner.styles.fontWeight === 'string' &&
      typeof owner.styles.lineHeight === 'string' &&
      typeof owner.styles.letterSpacing === 'string' &&
      hasValidRenderedTextPaintEvidence(owner.source),
  )
}

function hasCompleteEvidenceEnvelope(
  evidence: TokenEvidence | undefined,
  expectedValue: string,
  group: TokenCandidateGroup,
  sourcePath?: string,
  requirePortableSemantics = true,
): boolean {
  if (!evidence || evidence.value !== expectedValue) return false
  if (
    !TOKEN_CONFIDENCE_VALUES.has(evidence.confidence) ||
    !TOKEN_CONFIDENCE_VALUES.has(evidence.measurementConfidence || '') ||
    !TOKEN_CONFIDENCE_VALUES.has(evidence.semanticConfidence || '') ||
    !TOKEN_REUSE_SCOPE_VALUES.has(evidence.reuseScope || '') ||
    !isNonNegativeInteger(evidence.observationCount) ||
    !isNonNegativeInteger(evidence.ownerCount) ||
    !isNonNegativeInteger(evidence.pageCount) ||
    !isNonNegativeInteger(evidence.captureCount) ||
    !isNonNegativeInteger(evidence.eligiblePageCount) ||
    !isBoundedRatio(evidence.semanticAgreement) ||
    !isBoundedRatio(evidence.pageSupportRatio) ||
    evidence.pageCount > evidence.eligiblePageCount ||
    evidence.captureCount < evidence.pageCount ||
    !approximatelyEqual(evidence.pageSupportRatio, evidence.pageCount / Math.max(1, evidence.eligiblePageCount)) ||
    !isStringList(evidence.pages) ||
    evidence.pages.length !== evidence.pageCount ||
    !isStringList(evidence.sources) ||
    !Array.isArray(evidence.reasons) ||
    !evidence.reasons.every((reason) => TOKEN_EVIDENCE_REASON_VALUES.has(reason)) ||
    !hasValidCountMap(evidence.sourceCounts) ||
    !hasValidCountMap(evidence.roleCounts)
  ) {
    return false
  }
  const hasRenderedClaim = evidence.sources.includes('rendered:text')
  const hasRenderedOwners = (evidence.renderedTextOwners?.length || 0) > 0
  const hasPairClaim =
    evidence.sources.includes('observed:text-background-pair') || evidence.reasons.includes('paired-surface')
  const hasPairPayload = Boolean(evidence.pairedSurface)
  const requiresRenderedOwners =
    Boolean(sourcePath?.startsWith('typography.')) ||
    ['colors.foreground', 'colors.muted-foreground'].includes(sourcePath || '')
  const requiresPairedSurface = ['colors.foreground', 'colors.muted-foreground'].includes(sourcePath || '')
  const sourceCounts = new Map(Object.entries(evidence.sourceCounts || {}))
  const supportsFoundationScope =
    (evidence.foundationOwnerCount || 0) >= evidence.pageCount ||
    hasGenericRenderedFoundationFallback(sourceCounts, evidence.pageCount)
  if (
    (group !== 'colors' &&
      (!isNonNegativeInteger(evidence.foundationOwnerCount) ||
        !isNonNegativeInteger(evidence.minimumPageFoundationOwnerCount) ||
        evidence.foundationOwnerCount > evidence.ownerCount ||
        evidence.minimumPageFoundationOwnerCount > evidence.foundationOwnerCount ||
        (requirePortableSemantics && evidence.reuseScope === 'foundation' && !supportsFoundationScope))) ||
    (group === 'colors' &&
      ((evidence.foundationOwnerCount !== undefined && !isNonNegativeInteger(evidence.foundationOwnerCount)) ||
        (evidence.minimumPageFoundationOwnerCount !== undefined &&
          !isNonNegativeInteger(evidence.minimumPageFoundationOwnerCount)))) ||
    (evidence.pageRefs !== undefined &&
      (!Array.isArray(evidence.pageRefs) ||
        evidence.pageRefs.length !== evidence.pageCount ||
        !evidence.pageRefs.every((ref) => typeof ref === 'string' && ref.length > 0))) ||
    evidence.observationCount !== evidence.ownerCount ||
    (requirePortableSemantics && requiresRenderedOwners && hasRenderedClaim !== hasRenderedOwners) ||
    (requirePortableSemantics && requiresPairedSurface && hasPairClaim !== hasPairPayload) ||
    (requirePortableSemantics && hasPairPayload && (!hasRenderedClaim || !hasConsistentRenderedPairOwners(evidence))) ||
    !hasCompleteRenderedOwnerEnvelope(evidence) ||
    !hasCompletePairedSurfaceEnvelope(evidence)
  ) {
    return false
  }
  if (
    requirePortableSemantics &&
    sourcePath &&
    evidence.reuseScope === 'foundation' &&
    (!isPortableTokenEvidence(evidence, sourcePath) ||
      !hasRequiredRenderedOwnerEvidence(sourcePath, evidence) ||
      !hasValueSpecificFoundationEvidence(group, expectedValue, {
        pageCount: evidence.pageCount,
        foundationPageCount: evidence.pageCount,
        foundationOwnerCount: evidence.foundationOwnerCount || 0,
        minimumPageFoundationOwnerCount: evidence.minimumPageFoundationOwnerCount || 0,
        sourceCounts,
      }))
  ) {
    return false
  }
  return true
}

function hasCompleteCandidateEnvelope(candidate: TokenValueCandidate): boolean {
  return (
    TOKEN_CANDIDATE_GROUP_VALUES.has(candidate.group) &&
    typeof candidate.value === 'string' &&
    candidate.value.length > 0 &&
    TOKEN_CANDIDATE_REJECTION_VALUES.has(candidate.rejectionReason) &&
    (candidate.id === undefined || (typeof candidate.id === 'string' && candidate.id.length > 0)) &&
    (candidate.role === undefined || typeof candidate.role === 'string') &&
    (candidate.sourcePath === undefined || typeof candidate.sourcePath === 'string') &&
    hasCompleteEvidenceEnvelope(candidate.evidence, candidate.value, candidate.group, undefined, false)
  )
}

export function hasCompleteTokenPromotionEvidence(tokens: DesignToken): boolean {
  const entries = [
    ...Object.entries(tokens.colors).map(([role, value]) => ({
      path: `colors.${role}`,
      value,
      group: 'colors' as const,
    })),
    ...TYPOGRAPHY_GROUPS.flatMap((group) =>
      tokens.typography[group].map((value, index) => ({
        path: `typography.${group}.${index}`,
        value,
        group: `typography.${group}` as TokenCandidateGroup,
      })),
    ),
    ...ARRAY_GROUPS.flatMap((group) =>
      tokens[group].map((value, index) => ({ path: `${group}.${index}`, value, group })),
    ),
  ]
  const candidates = tokens.candidates?.values || []
  return (
    entries.length + candidates.length > 0 &&
    entries.every(({ path, value, group }) =>
      hasCompleteEvidenceEnvelope(tokens.evidence?.[path], value, group, path),
    ) &&
    candidates.every(hasCompleteCandidateEnvelope)
  )
}

function rejectionReason(evidence: TokenEvidence): TokenValueCandidate['rejectionReason'] {
  if (semanticConfidence(evidence) === 'low') return 'low-semantic-confidence'
  if (evidence.reuseScope === 'component') return 'component-scope'
  if (['specialized-content', 'local'].includes(evidence.reuseScope || '')) return 'local-scope'
  if (evidence.reuseScope === 'declared-only') return 'declared-only'
  return 'unknown-scope'
}

function cloneEvidence(evidence: TokenEvidence): TokenEvidence {
  return {
    ...evidence,
    pages: [...evidence.pages],
    ...(evidence.pageRefs ? { pageRefs: [...evidence.pageRefs] } : {}),
    sources: [...evidence.sources],
    ...(evidence.sourceCounts ? { sourceCounts: { ...evidence.sourceCounts } } : {}),
    ...(evidence.roleCounts ? { roleCounts: { ...evidence.roleCounts } } : {}),
    ...(evidence.pairedSurface
      ? {
          pairedSurface: {
            ...evidence.pairedSurface,
            textRoles: [...evidence.pairedSurface.textRoles],
            routeSupport: (evidence.pairedSurface.routeSupport || []).map((route) => ({
              ...route,
              ownerIds: [...route.ownerIds],
              totalOwnerIds: [...route.totalOwnerIds],
              mainTextOwnerIds: [...route.mainTextOwnerIds],
              headingOwnerIds: [...route.headingOwnerIds],
              textRoles: [...route.textRoles],
            })),
          },
        }
      : {}),
    ...(evidence.renderedTextOwners
      ? {
          renderedTextOwners: evidence.renderedTextOwners.map((owner) => ({
            ...owner,
            styles: { ...owner.styles },
            source: {
              ...owner.source,
              visibleBounds: { ...owner.source.visibleBounds },
              visibleGlyphRects: owner.source.visibleGlyphRects.map((rect) => ({ ...rect })),
              clipPathChain: owner.source.clipPathChain.map((clip) => ({ ...clip })),
              filterChain: owner.source.filterChain.map((filter) => ({ ...filter })),
              maskChain: (owner.source.maskChain || []).map((mask) => ({ ...mask })),
              blendChain: (owner.source.blendChain || []).map((blend) => ({ ...blend })),
            },
          })),
        }
      : {}),
    reasons: [...evidence.reasons],
  }
}

function candidateKey(candidate: TokenValueCandidate): string {
  return (
    candidate.id ||
    tokenCandidateId(
      candidate.group,
      candidate.value,
      candidate.role,
      candidate.provenance || candidate.rejectionReason,
    )
  )
}

function normalizedCandidate(candidate: TokenValueCandidate): TokenValueCandidate {
  if (candidate.id) return candidate
  return {
    ...candidate,
    id: tokenCandidateId(
      candidate.group,
      candidate.value,
      candidate.role,
      candidate.provenance || candidate.rejectionReason,
    ),
  }
}

function requiredEvidence(tokens: DesignToken, sourcePath: string): TokenEvidence {
  const evidence = tokens.evidence?.[sourcePath]
  if (!evidence) throw new Error(`Portable token promotion requires evidence for ${sourcePath}`)
  return evidence
}

function appendCandidate(
  candidates: Map<string, TokenValueCandidate>,
  group: TokenCandidateGroup,
  value: string,
  sourcePath: string,
  evidence: TokenEvidence,
  role?: string,
): void {
  const candidate: TokenValueCandidate = {
    id: tokenCandidateId(group, value, role, 'built-token'),
    group,
    ...(role ? { role } : {}),
    value,
    sourcePath,
    provenance: 'built-token',
    rejectionReason: rejectionReason(evidence),
    evidence: cloneEvidence(evidence),
  }
  candidates.set(candidateKey(candidate), candidate)
}

function semanticCandidateRolesForColorRole(role: string): string[] {
  if (['background', 'surface', 'secondary'].includes(role)) return ['background']
  if (['foreground', 'muted-foreground'].includes(role)) return ['foreground']
  if (role.startsWith('border')) return ['border']
  if (role === 'primary') return ['action-background']
  if (role === 'danger') return ['status']
  if (role === 'accent') return ['action-background', 'accent']
  if (['editorial-accent', 'decorative-accent'].includes(role)) return ['accent']
  return []
}

function hasObservedSemanticColorCandidate(
  candidates: ReadonlyMap<string, TokenValueCandidate>,
  role: string,
  value: string,
): boolean {
  const normalized = normalizeColorValue(value)
  if (!normalized) return false
  const semanticRoles = new Set(semanticCandidateRolesForColorRole(role))
  if (semanticRoles.size === 0) return false
  return [...candidates.values()].some(
    (candidate) =>
      candidate.group === 'colors' &&
      candidate.provenance === 'observed-color' &&
      Boolean(candidate.role && semanticRoles.has(candidate.role)) &&
      normalizeColorValue(candidate.value) === normalized,
  )
}

function readableAgainstPortableBackground(role: string, value: string, background: string | undefined): boolean {
  if (!['foreground', 'muted-foreground'].includes(role) || !background) return true
  const contrast = colorContrast(value, background)
  return contrast !== null && contrast >= 4.5
}

function filterArrayGroup(
  tokens: DesignToken,
  group: ArrayTokenGroup,
  values: readonly string[],
  candidates: Map<string, TokenValueCandidate>,
  retainedEvidence: Record<string, TokenEvidence>,
): string[] {
  let retainedIndex = 0
  return values.filter((value, index) => {
    const sourcePath = `${group}.${index}`
    const evidence = requiredEvidence(tokens, sourcePath)
    if (isPortableTokenEvidence(evidence, sourcePath) && hasRequiredRenderedOwnerEvidence(sourcePath, evidence)) {
      retainedEvidence[`${group}.${retainedIndex}`] = cloneEvidence(evidence)
      retainedIndex += 1
      return true
    }
    appendCandidate(candidates, group, value, sourcePath, evidence)
    return false
  })
}

/**
 * Applies the single portability decision used by every export surface.
 *
 * The token builder intentionally remains a broad candidate generator. This
 * stage runs only after browser evidence is available and keeps non-portable
 * values in structured candidates instead of presenting them as foundations.
 * Existing evidence is reindexed immediately; callers that still own browser captures may rebuild it afterwards.
 */
export function promotePortableDesignTokens(tokens: DesignToken): void {
  const candidates = new Map<string, TokenValueCandidate>()
  const retainedEvidence: Record<string, TokenEvidence> = {}
  for (const rawCandidate of tokens.candidates?.values || []) {
    const candidate = normalizedCandidate(rawCandidate)
    candidates.set(candidateKey(candidate), { ...candidate, evidence: cloneEvidence(candidate.evidence) })
  }

  const backgroundEvidence = tokens.colors.background ? requiredEvidence(tokens, 'colors.background') : undefined
  const portableBackground =
    tokens.colors.background &&
    backgroundEvidence &&
    isPortableTokenEvidence(backgroundEvidence, 'colors.background') &&
    hasRequiredRenderedOwnerEvidence('colors.background', backgroundEvidence)
      ? tokens.colors.background
      : undefined

  tokens.colors = Object.fromEntries(
    Object.entries(tokens.colors).filter(([role, value]) => {
      const sourcePath = `colors.${role}`
      const evidence = requiredEvidence(tokens, sourcePath)
      if (
        isPortableTokenEvidence(evidence, sourcePath) &&
        hasRequiredRenderedOwnerEvidence(sourcePath, evidence) &&
        readableAgainstPortableBackground(role, value, portableBackground)
      ) {
        retainedEvidence[sourcePath] = cloneEvidence(evidence)
        return true
      }
      if (!hasObservedSemanticColorCandidate(candidates, role, value)) {
        appendCandidate(candidates, 'colors', value, sourcePath, evidence, role)
      }
      return false
    }),
  )

  for (const group of TYPOGRAPHY_GROUPS) {
    tokens.typography[group] = filterArrayGroup(
      tokens,
      `typography.${group}`,
      tokens.typography[group],
      candidates,
      retainedEvidence,
    )
  }
  for (const group of ARRAY_GROUPS) {
    tokens[group] = filterArrayGroup(tokens, group, tokens[group], candidates, retainedEvidence)
  }

  const values = [...candidates.values()].sort(
    (first, second) =>
      first.group.localeCompare(second.group) ||
      (first.role || '').localeCompare(second.role || '') ||
      first.value.localeCompare(second.value),
  )
  const legacyColors = tokens.candidates?.colors
  if (values.length > 0 || (legacyColors?.length || 0) > 0) {
    tokens.candidates = {
      ...(legacyColors?.length ? { colors: legacyColors } : {}),
      ...(values.length > 0 ? { values } : {}),
    }
  } else {
    delete tokens.candidates
  }
  tokens.evidence = retainedEvidence
}

function appendBaseCatalogCandidate(
  candidates: Map<string, TokenValueCandidate>,
  group: TokenCandidateGroup,
  value: string,
  sourcePath: string,
  evidence: TokenEvidence,
  role?: string,
  rejectionReason: TokenValueCandidate['rejectionReason'] = 'not-in-base-catalog',
): void {
  const candidate: TokenValueCandidate = {
    id: tokenCandidateId(group, value, role, 'dark-mode'),
    group,
    ...(role ? { role } : {}),
    value,
    sourcePath,
    provenance: 'dark-mode',
    rejectionReason,
    evidence: cloneEvidence(evidence),
  }
  candidates.set(candidateKey(candidate), candidate)
}

function baseCatalogContainsCandidate(baseTokens: DesignToken, candidate: TokenValueCandidate): boolean {
  if (candidate.group === 'colors') {
    return candidate.role
      ? baseTokens.colors[candidate.role] !== undefined
      : Object.values(baseTokens.colors).includes(candidate.value)
  }
  return canonicalTokenEntriesForGroup(baseTokens, candidate.group).some((entry) => entry.value === candidate.value)
}

function darkCandidateForBaseCatalog(baseTokens: DesignToken, rawCandidate: TokenValueCandidate): TokenValueCandidate {
  const candidate = normalizedCandidate(rawCandidate)
  if (baseCatalogContainsCandidate(baseTokens, candidate)) return candidate
  return {
    ...candidate,
    id: tokenCandidateId(candidate.group, candidate.value, candidate.role, 'dark-mode'),
    provenance: 'dark-mode',
    rejectionReason: 'not-in-base-catalog',
  }
}

function unknownEvidence(value: string): TokenEvidence {
  return {
    value,
    confidence: 'low',
    measurementConfidence: 'low',
    semanticConfidence: 'low',
    reuseScope: 'unknown',
    observationCount: 0,
    ownerCount: 0,
    semanticAgreement: 0,
    pageCount: 0,
    captureCount: 0,
    eligiblePageCount: 0,
    pageSupportRatio: 0,
    pages: [],
    sources: ['restored:unmapped-dark-token'],
    reasons: [],
  }
}

function evidenceOrUnknown(tokens: DesignToken, sourcePath: string, value: string): TokenEvidence {
  const evidence = tokens.evidence?.[sourcePath]
  if (!evidence) return unknownEvidence(value)
  const matches = sourcePath.startsWith('colors.')
    ? normalizeColorValue(evidence.value) !== null && normalizeColorValue(evidence.value) === normalizeColorValue(value)
    : evidence.value.trim().replace(/\s+/g, ' ').toLowerCase() === value.trim().replace(/\s+/g, ' ').toLowerCase()
  return matches ? evidence : unknownEvidence(value)
}

function alignDarkArrayGroup(
  tokens: DesignToken,
  baseTokens: DesignToken,
  group: ArrayTokenGroup,
  values: readonly string[],
  baseValues: readonly string[],
  candidates: Map<string, TokenValueCandidate>,
  retainedEvidence: Record<string, TokenEvidence>,
  overrides: Record<string, string>,
): string[] {
  const aligned = [...baseValues]
  const baseEntries = canonicalTokenEntriesForGroup(baseTokens, group)
  const mappedDarkIndexes = new Set<number>()

  // A one-slot group has an unambiguous identity even when its value changes between modes.
  if (baseValues.length === 1 && values.length === 1) {
    const sourcePath = `${group}.0`
    const darkEvidence = evidenceOrUnknown(tokens, sourcePath, values[0])
    const changed = values[0] !== baseValues[0]
    const grounded =
      isPortableTokenEvidence(darkEvidence, sourcePath) && hasRequiredRenderedOwnerEvidence(sourcePath, darkEvidence)
    if (!changed || grounded) {
      aligned[0] = values[0]
      if (grounded) retainedEvidence[sourcePath] = cloneEvidence(darkEvidence)
      if (changed && baseEntries[0]) overrides[baseEntries[0].id] = values[0]
    } else {
      appendBaseCatalogCandidate(
        candidates,
        group,
        values[0],
        sourcePath,
        darkEvidence,
        undefined,
        'ungrounded-dark-override',
      )
    }
    mappedDarkIndexes.add(0)
  } else {
    const availableBaseIndexes = new Map<string, number[]>()
    baseValues.forEach((value, index) => {
      const indexes = availableBaseIndexes.get(value) || []
      indexes.push(index)
      availableBaseIndexes.set(value, indexes)
    })
    values.forEach((value, darkIndex) => {
      const baseIndex = availableBaseIndexes.get(value)?.shift()
      if (baseIndex === undefined) return
      const sourcePath = `${group}.${darkIndex}`
      const darkEvidence = evidenceOrUnknown(tokens, sourcePath, value)
      if (
        isPortableTokenEvidence(darkEvidence, sourcePath) &&
        hasRequiredRenderedOwnerEvidence(sourcePath, darkEvidence)
      ) {
        retainedEvidence[`${group}.${baseIndex}`] = cloneEvidence(darkEvidence)
      }
      mappedDarkIndexes.add(darkIndex)
    })
  }

  values.forEach((value, index) => {
    if (mappedDarkIndexes.has(index)) return
    const sourcePath = `${group}.${index}`
    appendBaseCatalogCandidate(candidates, group, value, sourcePath, evidenceOrUnknown(tokens, sourcePath, value))
  })
  return aligned
}

/**
 * Aligns a mode-specific snapshot to explicit base token identities.
 *
 * Exact shared values retain their base slot. A changed non-color value is accepted only for a one-slot group; larger
 * scales are ambiguous without paired element evidence and are retained as candidates instead of guessed by index.
 */
export function restrictDesignTokensToBaseCatalog(
  tokens: DesignToken,
  baseTokens: DesignToken,
): Record<string, string> {
  const candidates = new Map<string, TokenValueCandidate>()
  const retainedEvidence: Record<string, TokenEvidence> = {}
  const overrides: Record<string, string> = {}
  for (const rawCandidate of tokens.candidates?.values || []) {
    const candidate = darkCandidateForBaseCatalog(baseTokens, rawCandidate)
    candidates.set(candidateKey(candidate), candidate)
  }

  tokens.colors = Object.fromEntries(
    Object.entries(tokens.colors).filter(([role, value]) => {
      const sourcePath = `colors.${role}`
      if (baseTokens.colors[role] !== undefined) {
        const darkEvidence = evidenceOrUnknown(tokens, sourcePath, value)
        const changed = baseTokens.colors[role] !== value
        const grounded =
          isPortableTokenEvidence(darkEvidence, sourcePath) &&
          hasRequiredRenderedOwnerEvidence(sourcePath, darkEvidence)
        if (changed && /^palette-\d+$/.test(role)) {
          appendBaseCatalogCandidate(candidates, 'colors', value, sourcePath, darkEvidence, role, 'not-in-base-catalog')
          return false
        }
        if (!changed || grounded) {
          if (grounded) retainedEvidence[sourcePath] = cloneEvidence(darkEvidence)
          if (changed) overrides[`color.${role}`] = value
          return true
        }
        appendBaseCatalogCandidate(
          candidates,
          'colors',
          value,
          sourcePath,
          darkEvidence,
          role,
          'ungrounded-dark-override',
        )
        return false
      }
      appendBaseCatalogCandidate(
        candidates,
        'colors',
        value,
        sourcePath,
        evidenceOrUnknown(tokens, sourcePath, value),
        role,
      )
      return false
    }),
  )
  for (const group of TYPOGRAPHY_GROUPS) {
    const candidateGroup = `typography.${group}` as const
    tokens.typography[group] = alignDarkArrayGroup(
      tokens,
      baseTokens,
      candidateGroup,
      tokens.typography[group],
      baseTokens.typography[group],
      candidates,
      retainedEvidence,
      overrides,
    )
  }
  for (const group of ARRAY_GROUPS) {
    tokens[group] = alignDarkArrayGroup(
      tokens,
      baseTokens,
      group,
      tokens[group],
      baseTokens[group],
      candidates,
      retainedEvidence,
      overrides,
    )
  }

  const values = [...candidates.values()].sort(
    (first, second) =>
      first.group.localeCompare(second.group) ||
      (first.role || '').localeCompare(second.role || '') ||
      first.value.localeCompare(second.value),
  )
  const legacyColors = tokens.candidates?.colors
  if (values.length > 0 || (legacyColors?.length || 0) > 0) {
    tokens.candidates = {
      ...(legacyColors?.length ? { colors: legacyColors } : {}),
      ...(values.length > 0 ? { values } : {}),
    }
  } else {
    delete tokens.candidates
  }
  tokens.evidence = retainedEvidence
  return Object.fromEntries(Object.entries(overrides).sort(([first], [second]) => first.localeCompare(second)))
}
