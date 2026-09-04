import { normalizeColorValue } from './color-cluster.js'
import type { ExtractedStyles, SemanticSurfaceObservation } from './types.js'
import { pageIdentityUrl } from './url-identity.js'

export interface SemanticOwnerCapture {
  url: string
  viewport: string
  styles: Pick<ExtractedStyles, 'semanticSurfaceObservations'>
}

export interface FoundationSurfaceSelection {
  background?: string
  surface?: string
  secondary?: string
}

interface SurfaceCandidate {
  value: string
  routes: Set<string>
  ownersByRoute: Map<string, Set<string>>
  area: number
  viewportCoverage: number
}

function candidatesFor(
  captures: readonly SemanticOwnerCapture[],
  predicate: (observation: SemanticSurfaceObservation) => boolean,
): SurfaceCandidate[] {
  const candidates = new Map<string, SurfaceCandidate>()
  // Callers provide the health-checked canonical capture set. Owners are still de-duplicated by route so repeated
  // viewport evidence can never manufacture independent page or owner support.
  for (const capture of captures) {
    const route = pageIdentityUrl(capture.url)
    for (const observation of capture.styles.semanticSurfaceObservations || []) {
      if (!observation.rendered || !predicate(observation)) continue
      const value = normalizeColorValue(observation.value)
      if (!value) continue
      const candidate = candidates.get(value) || {
        value,
        routes: new Set<string>(),
        ownersByRoute: new Map<string, Set<string>>(),
        area: 0,
        viewportCoverage: 0,
      }
      candidate.routes.add(route)
      const owners = candidate.ownersByRoute.get(route) || new Set<string>()
      owners.add(observation.ownerId)
      candidate.ownersByRoute.set(route, owners)
      candidate.area += Math.max(0, observation.areaRatio || 0)
      candidate.viewportCoverage += Math.max(0, observation.viewportCoverage || 0)
      candidates.set(value, candidate)
    }
  }
  return [...candidates.values()]
}

function ownerCount(candidate: SurfaceCandidate): number {
  return [...candidate.ownersByRoute.values()].reduce((total, owners) => total + owners.size, 0)
}

function supportedReusableSurface(candidate: SurfaceCandidate): boolean {
  const ownerTotal = ownerCount(candidate)
  const substantialSingleOwner =
    candidate.routes.size === 1 && ownerTotal === 1 && candidate.area >= 0.2 && candidate.viewportCoverage >= 0.2
  return (
    candidate.routes.size >= 2 ||
    [...candidate.ownersByRoute.values()].some((owners) => owners.size >= 2) ||
    substantialSingleOwner
  )
}

function candidateOrder(first: SurfaceCandidate, second: SurfaceCandidate): number {
  return (
    second.routes.size - first.routes.size ||
    ownerCount(second) - ownerCount(first) ||
    second.viewportCoverage - first.viewportCoverage ||
    second.area - first.area ||
    first.value.localeCompare(second.value)
  )
}

/** Selects portable foundation surfaces exclusively from already classified rendered owners. */
export function selectFoundationSurfaceColors(captures: readonly SemanticOwnerCapture[]): FoundationSurfaceSelection {
  const background = candidatesFor(
    captures,
    (observation) => observation.domain === 'foundation' && observation.role === 'page-canvas',
  ).sort(candidateOrder)[0]?.value

  const reusable = candidatesFor(
    captures,
    (observation) => observation.domain === 'foundation' && observation.role === 'content-surface',
  )
    .filter(supportedReusableSurface)
    .filter((candidate) => candidate.value !== background)
    .sort(candidateOrder)

  return {
    ...(background ? { background } : {}),
    ...(reusable[0] ? { surface: reusable[0].value } : {}),
    ...(reusable[1] ? { secondary: reusable[1].value } : {}),
  }
}
