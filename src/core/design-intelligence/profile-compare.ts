import { extractComparableTerms } from './text-terms.js'
import type { DesignClaim, DesignProfile } from './types.js'

export interface DesignLanguageComparison {
  schemaVersion: '1'
  thesisSimilarity: number
  sharedSignatureTerms: string[]
  distinctiveToA: string[]
  distinctiveToB: string[]
  transferRuleComparison: {
    preserveSimilarity: number
    avoidSimilarity: number
  }
  interactionSimilarity: number
  evidenceGrounding: {
    profileAReferences: number
    profileBReferences: number
  }
}

function similarity(first: string, second: string): number {
  const a = extractComparableTerms(first)
  const b = extractComparableTerms(second)
  const union = new Set([...a, ...b])
  if (union.size === 0) return 1
  return [...a].filter((word) => b.has(word)).length / union.size
}

function claimText(claims: DesignClaim[]): string {
  return claims.map((claim) => `${claim.statement} ${claim.implementation}`).join(' ')
}

function signatureTerms(profile: DesignProfile): Set<string> {
  return extractComparableTerms(profile.signatureMoves.map((move) => `${move.name} ${move.statement}`).join(' '))
}

function evidenceCount(profile: DesignProfile): number {
  const claims: DesignClaim[] = [
    profile.thesis,
    ...profile.signatureMoves,
    ...profile.transferRules.preserve,
    ...profile.transferRules.adapt,
    ...profile.transferRules.avoid,
    ...profile.interactionLanguage.primaryDrivers,
    profile.interactionLanguage.feedbackStyle,
    profile.interactionLanguage.stateChangeAmplitude,
    ...profile.interactionLanguage.continuityRules,
  ]
  return new Set(claims.flatMap((claim) => claim.evidence.map((reference) => reference.evidenceId))).size
}

export function compareDesignProfiles(profileA: DesignProfile, profileB: DesignProfile): DesignLanguageComparison {
  const termsA = signatureTerms(profileA)
  const termsB = signatureTerms(profileB)
  return {
    schemaVersion: '1',
    thesisSimilarity: similarity(profileA.thesis.statement, profileB.thesis.statement),
    sharedSignatureTerms: [...termsA].filter((term) => termsB.has(term)).sort(),
    distinctiveToA: [...termsA]
      .filter((term) => !termsB.has(term))
      .sort()
      .slice(0, 24),
    distinctiveToB: [...termsB]
      .filter((term) => !termsA.has(term))
      .sort()
      .slice(0, 24),
    transferRuleComparison: {
      preserveSimilarity: similarity(
        claimText(profileA.transferRules.preserve),
        claimText(profileB.transferRules.preserve),
      ),
      avoidSimilarity: similarity(claimText(profileA.transferRules.avoid), claimText(profileB.transferRules.avoid)),
    },
    interactionSimilarity: similarity(
      claimText(profileA.interactionLanguage.primaryDrivers),
      claimText(profileB.interactionLanguage.primaryDrivers),
    ),
    evidenceGrounding: {
      profileAReferences: evidenceCount(profileA),
      profileBReferences: evidenceCount(profileB),
    },
  }
}
