import type { DesignEvidence } from '../design-evidence/types.js'
import { listEvidenceIds } from './evidence-selector.js'
import { extractComparableTerms } from './text-terms.js'
import type { DesignClaim, DesignProfile } from './types.js'

export interface ProfileQualityMetrics {
  groundedness: number
  executability: number
  specificity: number
  transferability: number
  restraint: number
  safety: number
  coverage: number
  crossViewportSupport: number
  distinctiveness: number
}

function profileClaims(profile: DesignProfile): DesignClaim[] {
  return [
    profile.thesis,
    ...profile.signatureMoves,
    ...Object.values(profile.composition),
    profile.attention.entryPoint,
    ...profile.attention.visualSequence,
    profile.attention.actionHierarchy,
    profile.attention.contrastStrategy,
    ...Object.values(profile.visualLanguage).filter((claim): claim is DesignClaim => Boolean(claim)),
    ...profile.sectionGrammar.flatMap((section) => [
      ...section.composition,
      ...section.contentRhythm,
      ...section.transitionToNext,
    ]),
    ...profile.interactionLanguage.primaryDrivers,
    profile.interactionLanguage.feedbackStyle,
    profile.interactionLanguage.stateChangeAmplitude,
    ...(profile.interactionLanguage.scrollNarrative ? [profile.interactionLanguage.scrollNarrative] : []),
    ...profile.interactionLanguage.continuityRules,
    ...profile.componentGrammar.flatMap((component) => component.rules),
    ...profile.transferRules.preserve,
    ...profile.transferRules.adapt,
    ...profile.transferRules.avoid,
  ]
}

function ratio(values: boolean[]): number {
  if (values.length === 0) return 0
  return values.filter(Boolean).length / values.length
}

function hasSpecificDetail(value: string): boolean {
  return value.trim().split(/\s+/).length >= 6 || (/[\u3400-\u9fff]/u.test(value) && [...value.trim()].length >= 16)
}

export function evaluateProfileQuality(profile: DesignProfile, evidence: DesignEvidence): ProfileQualityMetrics {
  const claims = profileClaims(profile)
  const evidenceIds = new Set(listEvidenceIds(evidence))
  const generic = /\b(modern|clean|beautiful|intuitive|professional|user-friendly)\b/i
  const actionable =
    /\b(use|keep|align|place|limit|reserve|stack|scale|group|separate|repeat|avoid|maintain|reduce|increase|preserve)\b|使用|保持|对齐|放置|限制|保留|排列|缩放|分组|分隔|重复|避免|减少|增加/i
  const transferClaims = [
    ...profile.transferRules.preserve,
    ...profile.transferRules.adapt,
    ...profile.transferRules.avoid,
  ]
  const unsafeContent =
    /https?:\/\/|<[^>]+>|javascript:|(?:copy|reuse).{0,24}(?:logo|asset|photo|text)|复制.{0,12}(?:标志|资产|图片|文案)/i
  return {
    groundedness: ratio(
      claims.map(
        (claim) =>
          claim.evidence.length > 0 && claim.evidence.every((reference) => evidenceIds.has(reference.evidenceId)),
      ),
    ),
    executability: ratio(claims.map((claim) => actionable.test(claim.implementation))),
    specificity: ratio(
      claims.map(
        (claim) =>
          hasSpecificDetail(claim.statement) &&
          hasSpecificDetail(claim.implementation) &&
          !generic.test(`${claim.statement} ${claim.implementation}`),
      ),
    ),
    transferability: ratio(
      transferClaims.map(
        (claim) =>
          actionable.test(claim.implementation) &&
          !/\b(?:this|current|source) page\b|(?:当前|来源|原)页面/i.test(claim.implementation),
      ),
    ),
    restraint: ratio(
      claims.map(
        (claim) =>
          claim.confidence !== 'high' ||
          (claim.evidence.length >= 2 &&
            claim.evidence.some((reference) => /^(?:image|section|layout)-/.test(reference.evidenceId))),
      ),
    ),
    safety: ratio(claims.map((claim) => !unsafeContent.test(`${claim.statement} ${claim.implementation}`))),
    coverage: ratio([
      profile.signatureMoves.length > 0,
      profile.sectionGrammar.length > 0,
      profile.componentGrammar.length > 0,
      profile.transferRules.preserve.length > 0,
      profile.transferRules.avoid.length > 0,
      profile.interactionLanguage.primaryDrivers.length > 0,
    ]),
    crossViewportSupport:
      evidence.coverage.viewportCoverage.length >= 2
        ? ratio(
            profile.interactionLanguage.continuityRules.map((claim) =>
              claim.evidence.some((reference) => reference.evidenceId.startsWith('responsive-')),
            ),
          )
        : 0,
    distinctiveness: ratio(
      profile.signatureMoves.map((move, index) => {
        const current = extractComparableTerms(`${move.name} ${move.statement} ${move.distinctiveness}`)
        const other = new Set(
          profile.signatureMoves
            .filter((_, otherIndex) => otherIndex !== index)
            .flatMap((candidate) => [...extractComparableTerms(`${candidate.name} ${candidate.statement}`)]),
        )
        return current.size >= 6 && [...current].some((word) => !other.has(word))
      }),
    ),
  }
}
