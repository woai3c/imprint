import { evidencePageRouteIdentity } from '../analyzer/url-identity.js'
import { hasSevereHorizontalOverflow } from './reliability.js'
import type { DesignEvidence, EvidencePage } from './types.js'

function pageRank(page: EvidencePage): number {
  if (page.viewport === 'desktop') return 0
  if (page.viewport === 'tablet') return 1
  if (page.viewport === 'mobile') return 2
  return 3
}

/** One deterministic, evidence-eligible capture without severe overflow per route; desktop is preferred. */
export function canonicalEvidencePageIds(evidence: Pick<DesignEvidence, 'pages'>): Set<string> {
  const pagesByRoute = new Map<string, EvidencePage[]>()
  for (const page of evidence.pages) {
    const routeIdentity = evidencePageRouteIdentity(page)
    const pages = pagesByRoute.get(routeIdentity) || []
    pages.push(page)
    pagesByRoute.set(routeIdentity, pages)
  }

  const result = new Set<string>()
  for (const pages of pagesByRoute.values()) {
    const selected = pages
      .filter((page) => !hasSevereHorizontalOverflow(page) && page.health?.evidenceEligible !== false)
      .sort(
        (first, second) =>
          pageRank(first) - pageRank(second) ||
          (second.viewportWidth || 0) - (first.viewportWidth || 0) ||
          first.id.localeCompare(second.id),
      )[0]
    if (selected) result.add(selected.id)
  }
  return result
}
