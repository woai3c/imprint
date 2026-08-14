import type { DesignClaim, DesignProfile } from './types.js'

export interface ClaimDedupeResult {
  profile: DesignProfile
  removed: number
}

interface PreparedStatement {
  text: string
  grams: Set<string>
}

const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/

function prepareStatement(text: string): PreparedStatement {
  const normalized = text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (CJK_PATTERN.test(normalized)) {
    const compact = normalized.replace(/\s+/g, '')
    const grams = new Set<string>()
    for (let index = 0; index < compact.length - 1; index += 1) grams.add(compact.slice(index, index + 2))
    if (compact.length === 1) grams.add(compact)
    return { text: compact, grams }
  }
  return { text: normalized, grams: new Set(normalized.split(' ').filter(Boolean)) }
}

function prepareClaim(claim: DesignClaim, schemaVersion: DesignProfile['schemaVersion']): PreparedStatement {
  if (schemaVersion === '2' && claim.assertions && claim.assertions.length > 0) {
    const assertions = claim.assertions
      .map((assertion) =>
        JSON.stringify({
          kind: assertion.kind,
          target: assertion.target,
          predicate: assertion.predicate,
          scope: assertion.scope,
          property: assertion.property,
          value: assertion.value,
        }),
      )
      .sort()
    return { text: assertions.join('|'), grams: new Set(assertions) }
  }
  return prepareStatement(claim.statement)
}

const SIMILARITY_THRESHOLD = 0.85
const CONTAINMENT_LENGTH_RATIO = 0.7

function isNearDuplicate(a: PreparedStatement, b: PreparedStatement): boolean {
  if (!a.text || !b.text) return false
  const [shorter, longer] = a.text.length <= b.text.length ? [a, b] : [b, a]
  if (longer.text.includes(shorter.text) && shorter.text.length / longer.text.length >= CONTAINMENT_LENGTH_RATIO) {
    return true
  }
  let intersection = 0
  for (const gram of a.grams) if (b.grams.has(gram)) intersection += 1
  const union = a.grams.size + b.grams.size - intersection
  return union > 0 && intersection / union >= SIMILARITY_THRESHOLD
}

/**
 * Removes near-duplicate claims across profile sections. The model is told not to repeat
 * ideas but does anyway (the same "full-width header" rule tends to appear in signatureMoves,
 * continuityRules, section grammar, and patterns). Single required claims (thesis,
 * composition fields, ...) only act as dedupe sources and are never removed themselves;
 * duplicates are dropped from array fields, keeping the first occurrence in a fixed
 * section order. When a validated evidence fallback profile is supplied, a later duplicate
 * required claim is replaced with that field's low-confidence fallback so required schema
 * fields do not repeat an earlier, more specific claim.
 */
export function dedupeProfileClaims(profile: DesignProfile, fallbackProfile?: DesignProfile): ClaimDedupeResult {
  const kept: PreparedStatement[] = []
  let removed = 0

  const register = (claim: DesignClaim | undefined) => {
    if (claim) kept.push(prepareClaim(claim, profile.schemaVersion))
  }
  const registerRequired = <T extends DesignClaim>(claim: T, fallback?: DesignClaim): T => {
    const prepared = prepareClaim(claim, profile.schemaVersion)
    if (fallback && prepared.text && kept.some((existing) => isNearDuplicate(existing, prepared))) {
      removed += 1
      const replacement = {
        ...fallback,
        confidence: 'low' as const,
        ...(profile.schemaVersion === '2'
          ? {
              assertions: [
                {
                  kind: 'evidence' as const,
                  target: 'design-thesis',
                  predicate: 'supports',
                  scope: 'instance' as const,
                  evidenceIds: fallback.evidence.map((reference) => reference.evidenceId).slice(0, 2),
                },
              ],
            }
          : {}),
      } as T
      kept.push(prepareClaim(replacement, profile.schemaVersion))
      return replacement
    }
    kept.push(prepared)
    return claim
  }
  const filterClaims = <T extends DesignClaim>(claims: T[]): T[] =>
    claims.filter((claim) => {
      const prepared = prepareClaim(claim, profile.schemaVersion)
      if (!prepared.text) return true
      if (kept.some((existing) => isNearDuplicate(existing, prepared))) {
        removed += 1
        return false
      }
      kept.push(prepared)
      return true
    })
  const filterLocalClaims = <T extends DesignClaim>(claims: T[]): T[] => {
    const localKept: PreparedStatement[] = []
    return claims.filter((claim) => {
      const prepared = prepareClaim(claim, profile.schemaVersion)
      if (!prepared.text) return true
      if (localKept.some((existing) => isNearDuplicate(existing, prepared))) {
        removed += 1
        return false
      }
      localKept.push(prepared)
      return true
    })
  }

  register(profile.thesis)
  const signatureMoves = filterClaims(profile.signatureMoves)
  const composition = {
    containerStrategy: registerRequired(
      profile.composition.containerStrategy,
      fallbackProfile?.composition.containerStrategy,
    ),
    alignmentStrategy: registerRequired(
      profile.composition.alignmentStrategy,
      fallbackProfile?.composition.alignmentStrategy,
    ),
    densityAndWhitespace: registerRequired(
      profile.composition.densityAndWhitespace,
      fallbackProfile?.composition.densityAndWhitespace,
    ),
    rhythm: registerRequired(profile.composition.rhythm, fallbackProfile?.composition.rhythm),
  }
  const entryPoint = registerRequired(profile.attention.entryPoint, fallbackProfile?.attention.entryPoint)
  const visualSequence = filterClaims(profile.attention.visualSequence)
  const actionHierarchy = registerRequired(
    profile.attention.actionHierarchy,
    fallbackProfile?.attention.actionHierarchy,
  )
  const contrastStrategy = registerRequired(
    profile.attention.contrastStrategy,
    fallbackProfile?.attention.contrastStrategy,
  )
  const color = registerRequired(profile.visualLanguage.color, fallbackProfile?.visualLanguage.color)
  const typography = registerRequired(profile.visualLanguage.typography, fallbackProfile?.visualLanguage.typography)
  const shape = registerRequired(profile.visualLanguage.shape, fallbackProfile?.visualLanguage.shape)
  const surfaces = registerRequired(profile.visualLanguage.surfaces, fallbackProfile?.visualLanguage.surfaces)
  const imagery = profile.visualLanguage.imagery ? filterClaims([profile.visualLanguage.imagery])[0] : undefined
  const motion = profile.visualLanguage.motion ? filterClaims([profile.visualLanguage.motion])[0] : undefined
  const primaryDrivers = filterClaims(profile.interactionLanguage.primaryDrivers)
  const feedbackStyle = registerRequired(
    profile.interactionLanguage.feedbackStyle,
    fallbackProfile?.interactionLanguage.feedbackStyle,
  )
  const stateChangeAmplitude = registerRequired(
    profile.interactionLanguage.stateChangeAmplitude,
    fallbackProfile?.interactionLanguage.stateChangeAmplitude,
  )
  const scrollNarrative = profile.interactionLanguage.scrollNarrative
    ? filterClaims([profile.interactionLanguage.scrollNarrative])[0]
    : undefined
  const continuityRules = filterClaims(profile.interactionLanguage.continuityRules)
  const sectionGrammar = profile.sectionGrammar.map((section) => ({
    ...section,
    composition: filterClaims(section.composition),
    contentRhythm: filterClaims(section.contentRhythm),
    transitionToNext: filterClaims(section.transitionToNext),
  }))
  const componentGrammar = profile.componentGrammar.map((component) => ({
    ...component,
    rules: filterClaims(component.rules),
  }))
  const patterns = (profile.patterns || []).map((pattern) => ({
    ...pattern,
    structureRules: filterClaims(pattern.structureRules),
    visualRules: filterClaims(pattern.visualRules),
    interactionRules: filterClaims(pattern.interactionRules),
    responsiveRules: filterClaims(pattern.responsiveRules),
  }))
  const transferRules = {
    preserve: filterLocalClaims(profile.transferRules.preserve),
    adapt: filterLocalClaims(profile.transferRules.adapt),
    avoid: filterLocalClaims(profile.transferRules.avoid),
  }

  if (removed === 0) return { profile, removed }

  return {
    profile: {
      ...profile,
      signatureMoves,
      composition,
      attention: { entryPoint, visualSequence, actionHierarchy, contrastStrategy },
      visualLanguage: {
        color,
        typography,
        shape,
        surfaces,
        ...(imagery ? { imagery } : {}),
        ...(motion ? { motion } : {}),
      },
      interactionLanguage: {
        primaryDrivers,
        feedbackStyle,
        stateChangeAmplitude,
        ...(scrollNarrative ? { scrollNarrative } : {}),
        continuityRules,
      },
      sectionGrammar,
      componentGrammar,
      ...(profile.patterns ? { patterns } : {}),
      transferRules,
    },
    removed,
  }
}
