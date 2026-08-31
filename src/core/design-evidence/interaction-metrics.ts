import { interactionStylePatternKey } from '../interaction-style.js'
import type { DesignEvidence } from './types.js'

export interface InteractionStateMetrics {
  // Deduped interaction state style patterns from stylesheet extraction (hover/focus/active/disabled).
  dedupedStatePatterns: number
  // Legacy passive bucket: non-click probes, applicable declarations, and directly observed passive states.
  passiveObservations: number
  // Browser-computed hover/focus/disabled states observed against a real element.
  computedProbedObservations: number
  // Stylesheet declarations whose unstated selector applies to the current DOM.
  declaredApplicableObservations: number
  // Passive evidence such as ARIA state and scroll-snap observations.
  otherPassiveObservations: number
  // Observations from safely executed interactions (click to expand, switch tab, ...).
  safeActiveObservations: number
  // Interaction candidates that could not be observed safely.
  skippedCandidates: number
}

export function computeInteractionStateMetrics(evidence: DesignEvidence): InteractionStateMetrics {
  const passiveObservations = evidence.interactionObservations.filter((observation) => observation.safety === 'passive')
  const computedProbedObservations = passiveObservations.filter(
    (observation) => observation.source === 'computed-probed',
  ).length
  const declaredApplicableObservations = passiveObservations.filter(
    (observation) => observation.source === 'declared-applicable',
  ).length
  return {
    dedupedStatePatterns: new Set(
      (['hover', 'focus', 'active', 'disabled'] as const).flatMap((kind) =>
        (evidence.interactionStyles[kind] || []).map(
          (observation) => `${kind}:${interactionStylePatternKey(observation)}`,
        ),
      ),
    ).size,
    passiveObservations: passiveObservations.length,
    computedProbedObservations,
    declaredApplicableObservations,
    otherPassiveObservations: passiveObservations.length - computedProbedObservations - declaredApplicableObservations,
    safeActiveObservations: evidence.interactionObservations.filter(
      (observation) => observation.safety === 'safe-active',
    ).length,
    skippedCandidates: evidence.coverage.interactionCoverage.skipped,
  }
}
