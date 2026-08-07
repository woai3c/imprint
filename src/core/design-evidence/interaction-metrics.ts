import type { DesignEvidence } from './types.js'

export interface InteractionStateMetrics {
  // Deduped interaction state style patterns from stylesheet extraction (hover/focus/active/disabled).
  dedupedStatePatterns: number
  // Passive state observations recorded without performing any user action.
  passiveObservations: number
  // Observations from safely executed interactions (click to expand, switch tab, ...).
  safeActiveObservations: number
  // Interaction candidates that could not be observed safely.
  skippedCandidates: number
}

export function computeInteractionStateMetrics(evidence: DesignEvidence): InteractionStateMetrics {
  return {
    dedupedStatePatterns:
      evidence.interactionStyles.hover.length +
      evidence.interactionStyles.focus.length +
      evidence.interactionStyles.active.length +
      (evidence.interactionStyles.disabled?.length || 0),
    passiveObservations: evidence.interactionObservations.filter((observation) => observation.safety === 'passive')
      .length,
    safeActiveObservations: evidence.interactionObservations.filter(
      (observation) => observation.safety === 'safe-active',
    ).length,
    skippedCandidates: evidence.coverage.interactionCoverage.skipped,
  }
}
