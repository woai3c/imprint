import type { DesignEvidence } from '../design-evidence/types.js'
import { checkProfileContradictions as checkLegacyProfileContradictions } from './legacy-contradiction-checker.js'
import { checkStructuredProfileAssertions } from './structured-contradiction-checker.js'
import type { DesignProfile } from './types.js'

export interface ContradictionCheckResult {
  profile: DesignProfile
  rejected: string[]
}

/**
 * Schema v2 validates machine-readable assertions and never interprets prose.
 * Schema v1 remains readable through the isolated compatibility checker.
 */
export function checkProfileContradictions(
  inputProfile: DesignProfile,
  evidence: DesignEvidence,
): ContradictionCheckResult {
  return inputProfile.schemaVersion === '2'
    ? checkStructuredProfileAssertions(inputProfile, evidence)
    : checkLegacyProfileContradictions(inputProfile, evidence)
}
