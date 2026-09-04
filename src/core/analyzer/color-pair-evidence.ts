import { normalizeColorValue } from './color-cluster.js'
import { colorContrast } from './token-builder.js'
import type { ExtractedStyles, PairedSurfaceEvidence, PairedSurfaceRouteEvidence } from './types.js'
import { opaqueRouteIdentity, pageIdentityUrl } from './url-identity.js'

interface PairEvidenceCapture {
  url: string
  viewport: string
  styles: Pick<ExtractedStyles, 'textColorPairObservations'>
}

function viewportPriority(viewport: string): number {
  if (viewport === 'desktop') return 3
  if (viewport === 'tablet') return 2
  if (viewport === 'mobile') return 1
  return 0
}

/**
 * Reconstruct route-balanced text/surface support from one deterministic capture per route.
 *
 * Pair counts are normalized inside each route so a dense feed cannot outvote several ordinary pages. Only the exact
 * normalized observed background can support the selected foundation pair; nearby cards and canvases remain local.
 */
export function buildForegroundPairEvidence(
  background: string | undefined,
  foreground: string,
  captures: readonly PairEvidenceCapture[],
): PairedSurfaceEvidence | undefined {
  const normalizedBackground = background ? normalizeColorValue(background) : null
  const normalizedForeground = normalizeColorValue(foreground)
  if (!normalizedBackground || !normalizedForeground) return undefined

  const canonicalByPage = new Map<string, { capture: PairEvidenceCapture; priority: number }>()
  captures.forEach((capture, index) => {
    const page = pageIdentityUrl(capture.url)
    const priority = viewportPriority(capture.viewport) * 1_000_000 - index
    const existing = canonicalByPage.get(page)
    if (!existing || priority > existing.priority) canonicalByPage.set(page, { capture, priority })
  })

  const roles = new Set<PairedSurfaceEvidence['textRoles'][number]>()
  let pageCount = 0
  let normalizedShareTotal = 0
  let normalizedMainTextShareTotal = 0
  let ownerCount = 0
  let minimumPageOwnerCount = Number.POSITIVE_INFINITY
  let mainTextPageCount = 0
  let mainTextOwnerCount = 0
  let headingPageCount = 0
  let headingOwnerCount = 0
  const routeSupport: PairedSurfaceRouteEvidence[] = []
  for (const [page, { capture }] of canonicalByPage) {
    const relatedPairs = (capture.styles.textColorPairObservations || []).filter((observation) => {
      const observedBackground = normalizeColorValue(observation.background)
      return observedBackground === normalizedBackground
    })
    const totalOwnerIds = new Set(relatedPairs.flatMap((observation) => observation.ownerIds || []))
    const matching = relatedPairs.filter(
      (observation) => normalizeColorValue(observation.foreground) === normalizedForeground,
    )
    const matchedOwnerIds = new Set(matching.flatMap((observation) => observation.ownerIds || []))
    const pageOwnerCount = matchedOwnerIds.size
    const mainMatching = matching.filter(
      (observation) => observation.textRole === 'body' || observation.textRole === 'heading',
    )
    const mainOwnerIds = new Set(mainMatching.flatMap((observation) => observation.ownerIds || []))
    const pageMainOwnerCount = mainOwnerIds.size
    const headingMatching = matching.filter((observation) => observation.textRole === 'heading')
    const headingOwnerIds = new Set(headingMatching.flatMap((observation) => observation.ownerIds || []))
    const pageHeadingOwnerCount = headingOwnerIds.size
    const pageNormalizedShare = totalOwnerIds.size > 0 ? pageOwnerCount / totalOwnerIds.size : 0
    const pageNormalizedMainTextShare = totalOwnerIds.size > 0 ? pageMainOwnerCount / totalOwnerIds.size : 0
    routeSupport.push({
      page,
      routeId: opaqueRouteIdentity(page),
      supported: pageOwnerCount > 0,
      ownerIds: [...matchedOwnerIds].sort(),
      totalOwnerIds: [...totalOwnerIds].sort(),
      mainTextOwnerIds: [...mainOwnerIds].sort(),
      headingOwnerIds: [...headingOwnerIds].sort(),
      textRoles: [
        ...new Set(
          matching
            .filter((observation) => (observation.ownerIds || []).length > 0)
            .map((observation) => observation.textRole),
        ),
      ].sort(),
      normalizedShare: Number(pageNormalizedShare.toFixed(3)),
      normalizedMainTextShare: Number(pageNormalizedMainTextShare.toFixed(3)),
    })
    if (pageOwnerCount <= 0) continue
    pageCount += 1
    normalizedShareTotal += Math.min(1, pageNormalizedShare)
    normalizedMainTextShareTotal += Math.min(1, pageNormalizedMainTextShare)
    ownerCount += pageOwnerCount
    minimumPageOwnerCount = Math.min(minimumPageOwnerCount, pageOwnerCount)
    if (pageMainOwnerCount > 0) mainTextPageCount += 1
    mainTextOwnerCount += pageMainOwnerCount
    if (pageHeadingOwnerCount > 0) headingPageCount += 1
    headingOwnerCount += pageHeadingOwnerCount
    matching.forEach((observation) => roles.add(observation.textRole))
  }

  const eligiblePageCount = canonicalByPage.size
  const contrastRatio = colorContrast(normalizedForeground, normalizedBackground)
  if (pageCount === 0 || eligiblePageCount === 0 || contrastRatio === null) return undefined
  return {
    background: normalizedBackground,
    pageCount,
    eligiblePageCount,
    pageSupportRatio: Number((pageCount / eligiblePageCount).toFixed(3)),
    normalizedShare: Number((normalizedShareTotal / eligiblePageCount).toFixed(3)),
    normalizedMainTextShare: Number((normalizedMainTextShareTotal / eligiblePageCount).toFixed(3)),
    ownerCount,
    minimumPageOwnerCount: Number.isFinite(minimumPageOwnerCount) ? minimumPageOwnerCount : 0,
    mainTextPageCount,
    mainTextOwnerCount,
    headingPageCount,
    headingOwnerCount,
    contrastRatio: Number(contrastRatio.toFixed(2)),
    textRoles: [...roles].sort(),
    routeSupport: routeSupport.sort((first, second) => first.page.localeCompare(second.page)),
  }
}

/** Select the strongest exact pair from the promoted foundation surfaces without merging nearby colors. */
export function buildFoundationForegroundPairEvidence(
  surfaces: readonly (string | undefined)[],
  foreground: string,
  captures: readonly PairEvidenceCapture[],
): PairedSurfaceEvidence | undefined {
  const seen = new Set<string>()
  return surfaces
    .flatMap((surface) => {
      const normalized = surface ? normalizeColorValue(surface) : null
      if (!normalized || seen.has(normalized)) return []
      seen.add(normalized)
      const evidence = buildForegroundPairEvidence(normalized, foreground, captures)
      return evidence ? [evidence] : []
    })
    .sort(
      (first, second) => compareForegroundPairs(first, second) || first.background.localeCompare(second.background),
    )[0]
}

export function isFoundationForegroundPair(evidence: PairedSurfaceEvidence | undefined): boolean {
  if (!evidence || evidence.contrastRatio < 4.5) return false
  if (evidence.eligiblePageCount <= 1) {
    return evidence.pageCount === 1 && evidence.normalizedShare > 0 && evidence.ownerCount >= 2
  }
  return (
    evidence.pageCount >= 2 &&
    evidence.pageSupportRatio >= 0.5 &&
    evidence.ownerCount >= evidence.pageCount &&
    evidence.minimumPageOwnerCount >= 1
  )
}

/** The primary foreground must be observed on prose or headings, not only on controls, labels, or incidental text. */
export function isPrimaryForegroundPair(evidence: PairedSurfaceEvidence | undefined): boolean {
  if (!isFoundationForegroundPair(evidence) || !evidence) return false
  const hasMainText = evidence.textRoles.some((role) => role === 'body' || role === 'heading')
  const mainTextPageCount = Number.isFinite(evidence.mainTextPageCount)
    ? evidence.mainTextPageCount
    : hasMainText
      ? evidence.pageCount
      : 0
  const mainTextOwnerCount = Number.isFinite(evidence.mainTextOwnerCount)
    ? evidence.mainTextOwnerCount
    : hasMainText
      ? evidence.ownerCount
      : 0
  if (evidence.eligiblePageCount <= 1) return mainTextPageCount === 1 && mainTextOwnerCount >= 2
  return mainTextPageCount >= 2 && mainTextPageCount / evidence.eligiblePageCount >= 0.5
}

function colorChannelChroma(value: string): number | null {
  const normalized = normalizeColorValue(value)
  const match = normalized?.match(/^#([\da-f]{6})$/i)
  if (!match) return null
  const channels = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16))
  return Math.max(...channels) - Math.min(...channels)
}

/** Foundation muted copy may be tinted, but a strongly chromatic heading or link remains an accent, not muted text. */
function isFoundationMutedTone(foreground: string, candidate: string): boolean {
  const foregroundChroma = colorChannelChroma(foreground)
  const candidateChroma = colorChannelChroma(candidate)
  if (foregroundChroma === null || candidateChroma === null) return false
  return candidateChroma <= Math.max(48, foregroundChroma + 24)
}

/** A muted text token must remain readable while being visibly less emphatic than the paired foundation foreground. */
export function isMutedForegroundPair(
  background: string | undefined,
  foreground: string | undefined,
  candidate: string,
  evidence: PairedSurfaceEvidence | undefined,
): boolean {
  if (!background || !foreground || !isFoundationForegroundPair(evidence)) return false
  const foregroundContrast = colorContrast(foreground, background)
  const candidateContrast = colorContrast(candidate, background)
  return Boolean(
    foregroundContrast !== null &&
    candidateContrast !== null &&
    candidateContrast >= 4.5 &&
    candidateContrast <= foregroundContrast - 0.5 &&
    isFoundationMutedTone(foreground, candidate),
  )
}

export function compareForegroundPairs(first: PairedSurfaceEvidence, second: PairedSurfaceEvidence): number {
  const firstMainRoleBreadth = Number(first.textRoles.includes('body')) + Number(first.textRoles.includes('heading'))
  const secondMainRoleBreadth = Number(second.textRoles.includes('body')) + Number(second.textRoles.includes('heading'))
  const firstMainPageCount = Number.isFinite(first.mainTextPageCount)
    ? first.mainTextPageCount
    : firstMainRoleBreadth > 0
      ? first.pageCount
      : 0
  const secondMainPageCount = Number.isFinite(second.mainTextPageCount)
    ? second.mainTextPageCount
    : secondMainRoleBreadth > 0
      ? second.pageCount
      : 0
  const firstMainShare = Number.isFinite(first.normalizedMainTextShare)
    ? first.normalizedMainTextShare
    : firstMainRoleBreadth > 0
      ? first.normalizedShare
      : 0
  const secondMainShare = Number.isFinite(second.normalizedMainTextShare)
    ? second.normalizedMainTextShare
    : secondMainRoleBreadth > 0
      ? second.normalizedShare
      : 0
  const firstHeadingPageCount = Number.isFinite(first.headingPageCount)
    ? first.headingPageCount
    : first.textRoles.includes('heading')
      ? first.pageCount
      : 0
  const secondHeadingPageCount = Number.isFinite(second.headingPageCount)
    ? second.headingPageCount
    : second.textRoles.includes('heading')
      ? second.pageCount
      : 0
  return (
    secondMainPageCount - firstMainPageCount ||
    secondHeadingPageCount - firstHeadingPageCount ||
    secondMainShare - firstMainShare ||
    second.pageCount - first.pageCount ||
    second.normalizedShare - first.normalizedShare ||
    secondMainRoleBreadth - firstMainRoleBreadth ||
    second.contrastRatio - first.contrastRatio
  )
}

export function compareMutedForegroundPairs(first: PairedSurfaceEvidence, second: PairedSurfaceEvidence): number {
  return (
    second.pageCount - first.pageCount ||
    second.normalizedShare - first.normalizedShare ||
    second.textRoles.length - first.textRoles.length ||
    first.contrastRatio - second.contrastRatio
  )
}
