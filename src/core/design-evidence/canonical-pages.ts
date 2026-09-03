import { evidencePageRouteIdentity } from '../analyzer/url-identity.js'
import { hasSevereHorizontalOverflow } from './reliability.js'
import type { DesignEvidence, EvidencePage } from './types.js'

export interface CanonicalEvidenceCaptureCandidate {
  key: string
  routeIdentity: string
  viewport: string
  viewportWidth?: number
  contentWidth?: number
  horizontalOverflow?: boolean
  health?: { evidenceEligible?: boolean }
}

function viewportRank(viewport: string): number {
  if (viewport === 'desktop') return 0
  if (viewport === 'tablet') return 1
  if (viewport === 'mobile') return 2
  return 3
}

/** Selects one deterministic, usable capture per route for every public evidence-backed calculation. */
export function canonicalEvidenceCaptureKeys(candidates: readonly CanonicalEvidenceCaptureCandidate[]): Set<string> {
  const capturesByRoute = new Map<string, CanonicalEvidenceCaptureCandidate[]>()
  for (const candidate of candidates) {
    if (!candidate.key || !candidate.routeIdentity) continue
    const captures = capturesByRoute.get(candidate.routeIdentity) || []
    captures.push(candidate)
    capturesByRoute.set(candidate.routeIdentity, captures)
  }

  const result = new Set<string>()
  for (const captures of capturesByRoute.values()) {
    const selected = captures
      .filter((capture) => !hasSevereHorizontalOverflow(capture) && capture.health?.evidenceEligible !== false)
      .sort(
        (first, second) =>
          viewportRank(first.viewport) - viewportRank(second.viewport) ||
          (second.viewportWidth || 0) - (first.viewportWidth || 0) ||
          first.key.localeCompare(second.key),
      )[0]
    if (selected) result.add(selected.key)
  }
  return result
}

/** One deterministic, evidence-eligible capture without severe overflow per route; desktop is preferred. */
export function canonicalEvidencePageIds(evidence: Pick<DesignEvidence, 'pages'>): Set<string> {
  return canonicalEvidenceCaptureKeys(
    evidence.pages.map((page: EvidencePage) => ({
      key: page.id,
      routeIdentity: evidencePageRouteIdentity(page),
      viewport: page.viewport,
      viewportWidth: page.viewportWidth,
      contentWidth: page.contentWidth,
      horizontalOverflow: page.horizontalOverflow,
      health: page.health,
    })),
  )
}
