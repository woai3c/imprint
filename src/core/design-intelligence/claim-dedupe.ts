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
 * section order.
 */
export function dedupeProfileClaims(profile: DesignProfile): ClaimDedupeResult {
  const kept: PreparedStatement[] = []
  let removed = 0

  const register = (claim: DesignClaim | undefined) => {
    if (claim) kept.push(prepareStatement(claim.statement))
  }
  const filterClaims = <T extends DesignClaim>(claims: T[]): T[] =>
    claims.filter((claim) => {
      const prepared = prepareStatement(claim.statement)
      if (!prepared.text) return true
      if (kept.some((existing) => isNearDuplicate(existing, prepared))) {
        removed += 1
        return false
      }
      kept.push(prepared)
      return true
    })

  register(profile.thesis)
  const signatureMoves = filterClaims(profile.signatureMoves)
  register(profile.composition.containerStrategy)
  register(profile.composition.alignmentStrategy)
  register(profile.composition.densityAndWhitespace)
  register(profile.composition.rhythm)
  register(profile.attention.entryPoint)
  const visualSequence = filterClaims(profile.attention.visualSequence)
  register(profile.attention.actionHierarchy)
  register(profile.attention.contrastStrategy)
  register(profile.visualLanguage.color)
  register(profile.visualLanguage.typography)
  register(profile.visualLanguage.shape)
  register(profile.visualLanguage.surfaces)
  register(profile.visualLanguage.imagery)
  register(profile.visualLanguage.motion)
  const primaryDrivers = filterClaims(profile.interactionLanguage.primaryDrivers)
  register(profile.interactionLanguage.feedbackStyle)
  register(profile.interactionLanguage.stateChangeAmplitude)
  register(profile.interactionLanguage.scrollNarrative)
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
    preserve: filterClaims(profile.transferRules.preserve),
    adapt: filterClaims(profile.transferRules.adapt),
    avoid: filterClaims(profile.transferRules.avoid),
  }

  if (removed === 0) return { profile, removed }

  return {
    profile: {
      ...profile,
      signatureMoves,
      attention: { ...profile.attention, visualSequence },
      interactionLanguage: {
        ...profile.interactionLanguage,
        primaryDrivers,
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
