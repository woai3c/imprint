import { normalizeColorValue } from './color-cluster.js'
import {
  buildForegroundPairEvidence,
  buildFoundationForegroundPairEvidence,
  compareForegroundPairs,
  compareMutedForegroundPairs,
  isMutedForegroundPair,
  isPrimaryForegroundPair,
} from './color-pair-evidence.js'
import { buildTokenEvidence } from './token-evidence.js'
import type { TokenEvidenceCapture } from './token-evidence.js'
import { isPortableTokenEvidence } from './token-promotion.js'
import type { ColorTokenCandidate, DesignToken, TokenEvidence } from './types.js'
import { pageIdentityUrl } from './url-identity.js'

const RESELECTABLE_FOUNDATION_ROLES = ['foreground', 'muted-foreground', 'border', 'border-subtle'] as const

const RENDERED_COLOR_CATEGORIES = new Set([
  'textColor',
  'bgColor',
  'bgArea',
  'borderColor',
  'structuralBorderColor',
  'accentColor',
  'linkColor',
  'selectedColor',
  'primaryActionBackgroundColor',
  'primaryActionForegroundColor',
  'actionBackgroundColor',
  'actionForegroundColor',
  'destructiveActionBackgroundColor',
  'destructiveActionForegroundColor',
  'statusBackgroundColor',
  'statusForegroundColor',
  'statusColor',
])

function emptyProbe(role: string, value: string, background?: string): DesignToken {
  return {
    colors: { ...(background && role !== 'background' ? { background } : {}), [role]: value },
    typography: {
      fontFamilies: [],
      fontStacks: [],
      fontSizes: [],
      fontWeights: [],
      lineHeights: [],
      letterSpacings: [],
    },
    spacing: [],
    radii: [],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
  }
}

function foundationSurfaces(tokens: DesignToken): Array<string | undefined> {
  return [tokens.colors.background, tokens.colors.surface, tokens.colors.secondary]
}

function observedCandidate(captures: readonly TokenEvidenceCapture[], value: string): ColorTokenCandidate {
  const normalized = normalizeColorValue(value) || value
  const sources = new Set<string>()
  const ownersByPage = new Map<string, Set<string>>()
  let fallbackCount = 0
  let rendered = false
  for (const capture of captures) {
    const page = pageIdentityUrl(capture.url)
    const pageOwners = ownersByPage.get(page) || new Set<string>()
    for (const [key, count] of Object.entries(capture.styles.usageCount)) {
      const separator = key.indexOf(':')
      if (separator <= 0 || !Number.isFinite(count) || count <= 0) continue
      const category = key.slice(0, separator)
      if (normalizeColorValue(key.slice(separator + 1)) !== normalized) continue
      if (RENDERED_COLOR_CATEGORIES.has(category)) rendered = true
      for (const owner of capture.styles.usageOwnerIds?.[key] || []) pageOwners.add(owner)
      fallbackCount = Math.max(fallbackCount, capture.styles.usageOwnerCounts?.[key] || count)
      for (const source of capture.styles.valueSources?.[key] || []) sources.add(source)
    }
    if (pageOwners.size > 0) ownersByPage.set(page, pageOwners)
  }
  const ownerCount = [...ownersByPage.values()].reduce((sum, owners) => sum + owners.size, 0) || fallbackCount
  return {
    value: normalized,
    kind: rendered ? 'observed-unassigned' : 'declared-only',
    observationCount: ownerCount,
    sources: [...sources].sort(),
  }
}

function isBorderRole(role: string): role is 'border' | 'border-subtle' {
  return role === 'border' || role === 'border-subtle'
}

function isNeutralBorderColor(value: string): boolean {
  const normalized = normalizeColorValue(value)
  const match = normalized?.match(/^#([\da-f]{6})$/i)
  if (!match) return false
  const channels = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16))
  const maximum = Math.max(...channels)
  const minimum = Math.min(...channels)
  const chroma = maximum - minimum
  return chroma <= 24 || chroma / Math.max(1, maximum) <= 0.12
}

function hasDirectStructuralBorderEvidence(evidence: TokenEvidence | undefined): boolean {
  return Boolean(
    evidence &&
    (evidence.sources.includes('usage:structuralBorderColor') || (evidence.roleCounts?.structuralBorderColor || 0) > 0),
  )
}

function isFoundationColorRoleEligible(
  role: string,
  value: string,
  evidence: TokenEvidence | undefined,
  tokens: DesignToken,
): boolean {
  if (!isBorderRole(role)) return true
  const normalized = normalizeColorValue(value) || value
  const surfaceValues = ['background', 'surface', 'secondary'].flatMap((surfaceRole) => {
    const surface = tokens.colors[surfaceRole]
    return surface ? [normalizeColorValue(surface) || surface] : []
  })
  if (surfaceValues.includes(normalized)) return false
  const neutral = isNeutralBorderColor(normalized)
  const structural = hasDirectStructuralBorderEvidence(evidence)
  if (role === 'border-subtle') {
    const border = tokens.colors.border
    if (border && (normalizeColorValue(border) || border) === normalized) return false
    return neutral && structural
  }
  return neutral || structural
}

/**
 * Assign uncoupled foundation roles from the complete exact-value catalog before portability filtering.
 * Clustering may omit a close-valued surface or text color, so a role does not need an initial clustered proposal.
 * Action/status pairs retain their directly observed pair and still compete against ordinary foundation evidence.
 */
export function reselectPortableFoundationColors(tokens: DesignToken, captures: TokenEvidenceCapture[]): void {
  if (captures.length === 0) return
  const candidateByValue = new Map<string, ColorTokenCandidate>()
  for (const candidate of tokens.candidates?.colors || []) {
    const value = normalizeColorValue(candidate.value) || candidate.value
    candidateByValue.set(value, { ...candidate, value })
  }
  for (const value of Object.values(tokens.colors)) {
    const normalized = normalizeColorValue(value) || value
    if (!candidateByValue.has(normalized)) candidateByValue.set(normalized, observedCandidate(captures, normalized))
  }
  for (const capture of captures) {
    for (const observation of capture.styles.textColorPairObservations || []) {
      const value = normalizeColorValue(observation.foreground)
      if (value && !candidateByValue.has(value)) candidateByValue.set(value, observedCandidate(captures, value))
    }
  }

  const hasObservedPairs = captures.some((capture) => (capture.styles.textColorPairObservations?.length || 0) > 0)
  let changedForeground = false
  for (const role of RESELECTABLE_FOUNDATION_ROLES) {
    const current = tokens.colors[role]
    const normalizedCurrent = current ? normalizeColorValue(current) || current : undefined
    if (role === 'foreground' && hasObservedPairs) {
      const pairedForeground = [...candidateByValue.values()]
        .flatMap((candidate) => {
          const pairedSurface = buildFoundationForegroundPairEvidence(
            foundationSurfaces(tokens),
            candidate.value,
            captures,
          )
          if (!isPrimaryForegroundPair(pairedSurface)) return []
          const tokenEvidence = buildTokenEvidence(
            emptyProbe('foreground', candidate.value, pairedSurface?.background),
            captures,
          )['colors.foreground']
          return pairedSurface && isPortableTokenEvidence(tokenEvidence, 'colors.foreground')
            ? [{ candidate, evidence: pairedSurface }]
            : []
        })
        .sort(
          (first, second) =>
            compareForegroundPairs(first.evidence, second.evidence) ||
            first.candidate.value.localeCompare(second.candidate.value),
        )[0]
      const replacement = pairedForeground?.candidate.value
      if (replacement !== normalizedCurrent) {
        if (normalizedCurrent && !candidateByValue.has(normalizedCurrent)) {
          candidateByValue.set(normalizedCurrent, observedCandidate(captures, normalizedCurrent))
        }
        if (replacement) tokens.colors.foreground = replacement
        else delete tokens.colors.foreground
        changedForeground = true
      }
      continue
    }
    if (role === 'muted-foreground' && hasObservedPairs) {
      const foreground = tokens.colors.foreground
      const foregroundPair = foreground
        ? buildFoundationForegroundPairEvidence(foundationSurfaces(tokens), foreground, captures)
        : undefined
      const pairedBackground = foregroundPair?.background
      const occupiedValues = new Set(
        Object.entries(tokens.colors)
          .filter(([otherRole]) => otherRole !== role)
          .map(([, value]) => normalizeColorValue(value) || value),
      )
      const replacement = [...candidateByValue.values()]
        .filter((candidate) => !occupiedValues.has(candidate.value))
        .flatMap((candidate) => {
          const pairedSurface = buildForegroundPairEvidence(pairedBackground, candidate.value, captures)
          if (!isMutedForegroundPair(pairedBackground, foreground, candidate.value, pairedSurface)) return []
          const evidence = buildTokenEvidence(emptyProbe(role, candidate.value, pairedBackground), captures)[
            `colors.${role}`
          ]
          return pairedSurface && isPortableTokenEvidence(evidence, `colors.${role}`)
            ? [{ candidate, pairedSurface }]
            : []
        })
        .sort(
          (first, second) =>
            compareMutedForegroundPairs(first.pairedSurface, second.pairedSurface) ||
            first.candidate.value.localeCompare(second.candidate.value),
        )[0]?.candidate.value
      if (replacement) tokens.colors[role] = replacement
      else delete tokens.colors[role]
      continue
    }
    let currentRoleEligible = true
    if (normalizedCurrent) {
      const currentEvidence = buildTokenEvidence(emptyProbe(role, normalizedCurrent), captures)[`colors.${role}`]
      currentRoleEligible = isFoundationColorRoleEligible(role, normalizedCurrent, currentEvidence, tokens)
      // Re-selection repairs an absent or unsupported proposal. If the role that the semantic builder selected is
      // already portable, retain it instead of replacing it with an equally supported literal by lexical tie-break.
      if (isPortableTokenEvidence(currentEvidence, `colors.${role}`) && currentRoleEligible) continue
    }
    const occupiedValues = new Set(
      Object.entries(tokens.colors)
        .filter(([otherRole]) => otherRole !== role && !(isBorderRole(role) && isBorderRole(otherRole)))
        .map(([, value]) => normalizeColorValue(value) || value),
    )
    const alternatives = [...candidateByValue.values()]
      .filter((candidate) => !occupiedValues.has(candidate.value))
      .map((candidate) => {
        const evidence = buildTokenEvidence(emptyProbe(role, candidate.value), captures)[`colors.${role}`]
        return { candidate, evidence }
      })
      .filter((item) => isPortableTokenEvidence(item.evidence, `colors.${role}`))
      .filter((item) => isFoundationColorRoleEligible(role, item.candidate.value, item.evidence, tokens))
      .filter(
        (item) =>
          !item.evidence.sources.includes('element:page-background') || item.candidate.value === normalizedCurrent,
      )
      .sort(
        (first, second) =>
          (second.evidence.semanticAgreement || 0) - (first.evidence.semanticAgreement || 0) ||
          (second.evidence.pageSupportRatio || 0) - (first.evidence.pageSupportRatio || 0) ||
          second.evidence.pageCount - first.evidence.pageCount ||
          (second.evidence.ownerCount || 0) - (first.evidence.ownerCount || 0) ||
          first.candidate.value.localeCompare(second.candidate.value),
      )
    const replacement = alternatives[0]
    if (!replacement) {
      if (normalizedCurrent && !currentRoleEligible) delete tokens.colors[role]
      continue
    }
    if (replacement.candidate.value === normalizedCurrent) continue
    if (normalizedCurrent && !candidateByValue.has(normalizedCurrent)) {
      candidateByValue.set(normalizedCurrent, observedCandidate(captures, normalizedCurrent))
    }
    tokens.colors[role] = replacement.candidate.value
    if (role === 'foreground') changedForeground = true
  }

  const assigned = new Set(Object.values(tokens.colors).map((value) => normalizeColorValue(value) || value))
  const colorCandidates = [...candidateByValue.values()]
    .filter((candidate) => !assigned.has(candidate.value))
    .sort(
      (first, second) => second.observationCount - first.observationCount || first.value.localeCompare(second.value),
    )
  if (colorCandidates.length > 0 || (tokens.candidates?.values?.length || 0) > 0) {
    tokens.candidates = {
      ...(colorCandidates.length > 0 ? { colors: colorCandidates } : {}),
      ...(tokens.candidates?.values?.length ? { values: tokens.candidates.values } : {}),
    }
  } else {
    delete tokens.candidates
  }
  if (changedForeground && tokens.colorRoles?.primaryAction?.recommendedOnPrimary) {
    delete tokens.colorRoles.primaryAction.recommendedOnPrimary
  }
  tokens.evidence = buildTokenEvidence(tokens, captures)
}
