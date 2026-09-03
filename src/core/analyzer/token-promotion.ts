import { normalizeColorValue } from './color-cluster.js'
import { canonicalTokenEntriesForGroup, tokenCandidateId } from './token-catalog.js'
import type { DesignToken, TokenCandidateGroup, TokenEvidence, TokenValueCandidate } from './types.js'
import { isOpaqueRouteIdentity } from './url-identity.js'

type ArrayTokenGroup = Exclude<TokenCandidateGroup, 'colors'>

const TYPOGRAPHY_GROUPS = [
  'fontFamilies',
  'fontStacks',
  'fontSizes',
  'fontWeights',
  'lineHeights',
  'letterSpacings',
] as const

const ARRAY_GROUPS = ['spacing', 'radii', 'shadows', 'borders', 'zIndices', 'transitions'] as const

function semanticConfidence(evidence: TokenEvidence): TokenEvidence['confidence'] {
  return evidence.semanticConfidence || evidence.confidence
}

function hasContextIndependentRenderedOwners(evidence: TokenEvidence): boolean {
  const owners = evidence.renderedTextOwners || []
  return (
    owners.length > 0 &&
    owners.every(
      (owner) =>
        isOpaqueRouteIdentity(owner.routeId) &&
        Array.isArray(owner.source.maskChain) &&
        owner.source.maskChain.length === 0 &&
        Array.isArray(owner.source.blendChain) &&
        owner.source.blendChain.length === 0,
    )
  )
}

function hasAuditablePairedRoutes(evidence: TokenEvidence): boolean {
  if (!evidence.pairedSurface) return true
  const routes = evidence.pairedSurface.routeSupport || []
  const routeIds = routes.map((route) => route.routeId)
  return (
    routes.length === evidence.pairedSurface.eligiblePageCount &&
    routeIds.every(isOpaqueRouteIdentity) &&
    new Set(routeIds).size === routeIds.length
  )
}

export function isPortableTokenEvidence(evidence: TokenEvidence | undefined): boolean {
  return Boolean(
    evidence &&
    semanticConfidence(evidence) !== 'low' &&
    evidence.reuseScope === 'foundation' &&
    hasAuditablePairedRoutes(evidence) &&
    (!evidence.pairedSurface ||
      (evidence.sources.includes('rendered:text') && hasContextIndependentRenderedOwners(evidence))),
  )
}

export function hasRequiredRenderedOwnerEvidence(path: string, evidence: TokenEvidence): boolean {
  if (!path.startsWith('typography.') && !['colors.foreground', 'colors.muted-foreground'].includes(path)) {
    return true
  }
  return evidence.sources.includes('rendered:text') && hasContextIndependentRenderedOwners(evidence)
}

export function hasCompleteTokenPromotionEvidence(tokens: DesignToken): boolean {
  const paths = [
    ...Object.keys(tokens.colors).map((role) => `colors.${role}`),
    ...TYPOGRAPHY_GROUPS.flatMap((group) =>
      tokens.typography[group].map((_value, index) => `typography.${group}.${index}`),
    ),
    ...ARRAY_GROUPS.flatMap((group) => tokens[group].map((_value, index) => `${group}.${index}`)),
  ]
  return (
    paths.length > 0 &&
    paths.every((path) => {
      const evidence = tokens.evidence?.[path]
      return Boolean(evidence?.semanticConfidence && evidence.reuseScope)
    })
  )
}

function rejectionReason(evidence: TokenEvidence): TokenValueCandidate['rejectionReason'] {
  if (semanticConfidence(evidence) === 'low') return 'low-semantic-confidence'
  if (evidence.reuseScope === 'component') return 'component-scope'
  if (evidence.reuseScope === 'local') return 'local-scope'
  if (evidence.reuseScope === 'declared-only') return 'declared-only'
  return 'unknown-scope'
}

function cloneEvidence(evidence: TokenEvidence): TokenEvidence {
  return {
    ...evidence,
    pages: [...evidence.pages],
    ...(evidence.pageRefs ? { pageRefs: [...evidence.pageRefs] } : {}),
    sources: [...evidence.sources],
    ...(evidence.sourceCounts ? { sourceCounts: { ...evidence.sourceCounts } } : {}),
    ...(evidence.roleCounts ? { roleCounts: { ...evidence.roleCounts } } : {}),
    ...(evidence.pairedSurface
      ? {
          pairedSurface: {
            ...evidence.pairedSurface,
            textRoles: [...evidence.pairedSurface.textRoles],
            routeSupport: (evidence.pairedSurface.routeSupport || []).map((route) => ({
              ...route,
              ownerIds: [...route.ownerIds],
              totalOwnerIds: [...route.totalOwnerIds],
              mainTextOwnerIds: [...route.mainTextOwnerIds],
              headingOwnerIds: [...route.headingOwnerIds],
              textRoles: [...route.textRoles],
            })),
          },
        }
      : {}),
    ...(evidence.renderedTextOwners
      ? {
          renderedTextOwners: evidence.renderedTextOwners.map((owner) => ({
            ...owner,
            styles: { ...owner.styles },
            source: {
              ...owner.source,
              visibleBounds: { ...owner.source.visibleBounds },
              visibleGlyphRects: owner.source.visibleGlyphRects.map((rect) => ({ ...rect })),
              clipPathChain: owner.source.clipPathChain.map((clip) => ({ ...clip })),
              filterChain: owner.source.filterChain.map((filter) => ({ ...filter })),
              maskChain: (owner.source.maskChain || []).map((mask) => ({ ...mask })),
              blendChain: (owner.source.blendChain || []).map((blend) => ({ ...blend })),
            },
          })),
        }
      : {}),
    reasons: [...evidence.reasons],
  }
}

function candidateKey(candidate: TokenValueCandidate): string {
  return (
    candidate.id ||
    tokenCandidateId(
      candidate.group,
      candidate.value,
      candidate.role,
      candidate.provenance || candidate.rejectionReason,
    )
  )
}

function normalizedCandidate(candidate: TokenValueCandidate): TokenValueCandidate {
  if (candidate.id) return candidate
  return {
    ...candidate,
    id: tokenCandidateId(
      candidate.group,
      candidate.value,
      candidate.role,
      candidate.provenance || candidate.rejectionReason,
    ),
  }
}

function requiredEvidence(tokens: DesignToken, sourcePath: string): TokenEvidence {
  const evidence = tokens.evidence?.[sourcePath]
  if (!evidence) throw new Error(`Portable token promotion requires evidence for ${sourcePath}`)
  return evidence
}

function appendCandidate(
  candidates: Map<string, TokenValueCandidate>,
  group: TokenCandidateGroup,
  value: string,
  sourcePath: string,
  evidence: TokenEvidence,
  role?: string,
): void {
  const candidate: TokenValueCandidate = {
    id: tokenCandidateId(group, value, role, 'built-token'),
    group,
    ...(role ? { role } : {}),
    value,
    sourcePath,
    provenance: 'built-token',
    rejectionReason: rejectionReason(evidence),
    evidence: cloneEvidence(evidence),
  }
  candidates.set(candidateKey(candidate), candidate)
}

function semanticCandidateRolesForColorRole(role: string): string[] {
  if (['background', 'surface', 'secondary'].includes(role)) return ['background']
  if (['foreground', 'muted-foreground'].includes(role)) return ['foreground']
  if (role.startsWith('border')) return ['border']
  if (role === 'primary') return ['action-background']
  if (role === 'danger') return ['status']
  if (role === 'accent') return ['action-background', 'accent']
  if (['editorial-accent', 'decorative-accent'].includes(role)) return ['accent']
  return []
}

function hasObservedSemanticColorCandidate(
  candidates: ReadonlyMap<string, TokenValueCandidate>,
  role: string,
  value: string,
): boolean {
  const normalized = normalizeColorValue(value)
  if (!normalized) return false
  const semanticRoles = new Set(semanticCandidateRolesForColorRole(role))
  if (semanticRoles.size === 0) return false
  return [...candidates.values()].some(
    (candidate) =>
      candidate.group === 'colors' &&
      candidate.provenance === 'observed-color' &&
      Boolean(candidate.role && semanticRoles.has(candidate.role)) &&
      normalizeColorValue(candidate.value) === normalized,
  )
}

function filterArrayGroup(
  tokens: DesignToken,
  group: ArrayTokenGroup,
  values: readonly string[],
  candidates: Map<string, TokenValueCandidate>,
  retainedEvidence: Record<string, TokenEvidence>,
): string[] {
  let retainedIndex = 0
  return values.filter((value, index) => {
    const sourcePath = `${group}.${index}`
    const evidence = requiredEvidence(tokens, sourcePath)
    if (isPortableTokenEvidence(evidence) && hasRequiredRenderedOwnerEvidence(sourcePath, evidence)) {
      retainedEvidence[`${group}.${retainedIndex}`] = cloneEvidence(evidence)
      retainedIndex += 1
      return true
    }
    appendCandidate(candidates, group, value, sourcePath, evidence)
    return false
  })
}

/**
 * Applies the single portability decision used by every export surface.
 *
 * The token builder intentionally remains a broad candidate generator. This
 * stage runs only after browser evidence is available and keeps non-portable
 * values in structured candidates instead of presenting them as foundations.
 * Existing evidence is reindexed immediately; callers that still own browser captures may rebuild it afterwards.
 */
export function promotePortableDesignTokens(tokens: DesignToken): void {
  const candidates = new Map<string, TokenValueCandidate>()
  const retainedEvidence: Record<string, TokenEvidence> = {}
  for (const rawCandidate of tokens.candidates?.values || []) {
    const candidate = normalizedCandidate(rawCandidate)
    candidates.set(candidateKey(candidate), candidate)
  }

  tokens.colors = Object.fromEntries(
    Object.entries(tokens.colors).filter(([role, value]) => {
      const sourcePath = `colors.${role}`
      const evidence = requiredEvidence(tokens, sourcePath)
      if (isPortableTokenEvidence(evidence) && hasRequiredRenderedOwnerEvidence(sourcePath, evidence)) {
        retainedEvidence[sourcePath] = cloneEvidence(evidence)
        return true
      }
      if (!hasObservedSemanticColorCandidate(candidates, role, value)) {
        appendCandidate(candidates, 'colors', value, sourcePath, evidence, role)
      }
      return false
    }),
  )

  for (const group of TYPOGRAPHY_GROUPS) {
    tokens.typography[group] = filterArrayGroup(
      tokens,
      `typography.${group}`,
      tokens.typography[group],
      candidates,
      retainedEvidence,
    )
  }
  for (const group of ARRAY_GROUPS) {
    tokens[group] = filterArrayGroup(tokens, group, tokens[group], candidates, retainedEvidence)
  }

  const values = [...candidates.values()].sort(
    (first, second) =>
      first.group.localeCompare(second.group) ||
      (first.role || '').localeCompare(second.role || '') ||
      first.value.localeCompare(second.value),
  )
  const legacyColors = tokens.candidates?.colors
  if (values.length > 0 || (legacyColors?.length || 0) > 0) {
    tokens.candidates = {
      ...(legacyColors?.length ? { colors: legacyColors } : {}),
      ...(values.length > 0 ? { values } : {}),
    }
  } else {
    delete tokens.candidates
  }
  tokens.evidence = retainedEvidence
}

function appendBaseCatalogCandidate(
  candidates: Map<string, TokenValueCandidate>,
  group: TokenCandidateGroup,
  value: string,
  sourcePath: string,
  evidence: TokenEvidence,
  role?: string,
  rejectionReason: TokenValueCandidate['rejectionReason'] = 'not-in-base-catalog',
): void {
  const candidate: TokenValueCandidate = {
    id: tokenCandidateId(group, value, role, 'dark-mode'),
    group,
    ...(role ? { role } : {}),
    value,
    sourcePath,
    provenance: 'dark-mode',
    rejectionReason,
    evidence: cloneEvidence(evidence),
  }
  candidates.set(candidateKey(candidate), candidate)
}

function baseCatalogContainsCandidate(baseTokens: DesignToken, candidate: TokenValueCandidate): boolean {
  if (candidate.group === 'colors') {
    return candidate.role
      ? baseTokens.colors[candidate.role] !== undefined
      : Object.values(baseTokens.colors).includes(candidate.value)
  }
  return canonicalTokenEntriesForGroup(baseTokens, candidate.group).some((entry) => entry.value === candidate.value)
}

function darkCandidateForBaseCatalog(baseTokens: DesignToken, rawCandidate: TokenValueCandidate): TokenValueCandidate {
  const candidate = normalizedCandidate(rawCandidate)
  if (baseCatalogContainsCandidate(baseTokens, candidate)) return candidate
  return {
    ...candidate,
    id: tokenCandidateId(candidate.group, candidate.value, candidate.role, 'dark-mode'),
    provenance: 'dark-mode',
    rejectionReason: 'not-in-base-catalog',
  }
}

function unknownEvidence(value: string): TokenEvidence {
  return {
    value,
    confidence: 'low',
    measurementConfidence: 'low',
    semanticConfidence: 'low',
    reuseScope: 'unknown',
    observationCount: 0,
    ownerCount: 0,
    semanticAgreement: 0,
    pageCount: 0,
    captureCount: 0,
    eligiblePageCount: 0,
    pageSupportRatio: 0,
    pages: [],
    sources: ['restored:unmapped-dark-token'],
    reasons: [],
  }
}

function evidenceOrUnknown(tokens: DesignToken, sourcePath: string, value: string): TokenEvidence {
  const evidence = tokens.evidence?.[sourcePath]
  if (!evidence) return unknownEvidence(value)
  const matches = sourcePath.startsWith('colors.')
    ? normalizeColorValue(evidence.value) !== null && normalizeColorValue(evidence.value) === normalizeColorValue(value)
    : evidence.value.trim().replace(/\s+/g, ' ').toLowerCase() === value.trim().replace(/\s+/g, ' ').toLowerCase()
  return matches ? evidence : unknownEvidence(value)
}

function alignDarkArrayGroup(
  tokens: DesignToken,
  baseTokens: DesignToken,
  group: ArrayTokenGroup,
  values: readonly string[],
  baseValues: readonly string[],
  candidates: Map<string, TokenValueCandidate>,
  retainedEvidence: Record<string, TokenEvidence>,
  overrides: Record<string, string>,
): string[] {
  const aligned = [...baseValues]
  const baseEntries = canonicalTokenEntriesForGroup(baseTokens, group)
  const mappedDarkIndexes = new Set<number>()

  // A one-slot group has an unambiguous identity even when its value changes between modes.
  if (baseValues.length === 1 && values.length === 1) {
    const sourcePath = `${group}.0`
    const darkEvidence = evidenceOrUnknown(tokens, sourcePath, values[0])
    const changed = values[0] !== baseValues[0]
    if (
      !changed ||
      (isPortableTokenEvidence(darkEvidence) && hasRequiredRenderedOwnerEvidence(sourcePath, darkEvidence))
    ) {
      aligned[0] = values[0]
      retainedEvidence[sourcePath] = cloneEvidence(darkEvidence)
      if (changed && baseEntries[0]) overrides[baseEntries[0].id] = values[0]
    } else {
      appendBaseCatalogCandidate(
        candidates,
        group,
        values[0],
        sourcePath,
        darkEvidence,
        undefined,
        'ungrounded-dark-override',
      )
    }
    mappedDarkIndexes.add(0)
  } else {
    const availableBaseIndexes = new Map<string, number[]>()
    baseValues.forEach((value, index) => {
      const indexes = availableBaseIndexes.get(value) || []
      indexes.push(index)
      availableBaseIndexes.set(value, indexes)
    })
    values.forEach((value, darkIndex) => {
      const baseIndex = availableBaseIndexes.get(value)?.shift()
      if (baseIndex === undefined) return
      retainedEvidence[`${group}.${baseIndex}`] = cloneEvidence(
        evidenceOrUnknown(tokens, `${group}.${darkIndex}`, value),
      )
      mappedDarkIndexes.add(darkIndex)
    })
  }

  values.forEach((value, index) => {
    if (mappedDarkIndexes.has(index)) return
    const sourcePath = `${group}.${index}`
    appendBaseCatalogCandidate(candidates, group, value, sourcePath, evidenceOrUnknown(tokens, sourcePath, value))
  })
  return aligned
}

/**
 * Aligns a mode-specific snapshot to explicit base token identities.
 *
 * Exact shared values retain their base slot. A changed non-color value is accepted only for a one-slot group; larger
 * scales are ambiguous without paired element evidence and are retained as candidates instead of guessed by index.
 */
export function restrictDesignTokensToBaseCatalog(
  tokens: DesignToken,
  baseTokens: DesignToken,
): Record<string, string> {
  const candidates = new Map<string, TokenValueCandidate>()
  const retainedEvidence: Record<string, TokenEvidence> = {}
  const overrides: Record<string, string> = {}
  for (const rawCandidate of tokens.candidates?.values || []) {
    const candidate = darkCandidateForBaseCatalog(baseTokens, rawCandidate)
    candidates.set(candidateKey(candidate), candidate)
  }

  tokens.colors = Object.fromEntries(
    Object.entries(tokens.colors).filter(([role, value]) => {
      const sourcePath = `colors.${role}`
      if (baseTokens.colors[role] !== undefined) {
        const darkEvidence = evidenceOrUnknown(tokens, sourcePath, value)
        const changed = baseTokens.colors[role] !== value
        if (
          !changed ||
          (isPortableTokenEvidence(darkEvidence) && hasRequiredRenderedOwnerEvidence(sourcePath, darkEvidence))
        ) {
          retainedEvidence[sourcePath] = cloneEvidence(darkEvidence)
          if (changed) overrides[`color.${role}`] = value
          return true
        }
        appendBaseCatalogCandidate(
          candidates,
          'colors',
          value,
          sourcePath,
          darkEvidence,
          role,
          'ungrounded-dark-override',
        )
        return false
      }
      appendBaseCatalogCandidate(
        candidates,
        'colors',
        value,
        sourcePath,
        evidenceOrUnknown(tokens, sourcePath, value),
        role,
      )
      return false
    }),
  )
  for (const group of TYPOGRAPHY_GROUPS) {
    const candidateGroup = `typography.${group}` as const
    tokens.typography[group] = alignDarkArrayGroup(
      tokens,
      baseTokens,
      candidateGroup,
      tokens.typography[group],
      baseTokens.typography[group],
      candidates,
      retainedEvidence,
      overrides,
    )
  }
  for (const group of ARRAY_GROUPS) {
    tokens[group] = alignDarkArrayGroup(
      tokens,
      baseTokens,
      group,
      tokens[group],
      baseTokens[group],
      candidates,
      retainedEvidence,
      overrides,
    )
  }

  const values = [...candidates.values()].sort(
    (first, second) =>
      first.group.localeCompare(second.group) ||
      (first.role || '').localeCompare(second.role || '') ||
      first.value.localeCompare(second.value),
  )
  const legacyColors = tokens.candidates?.colors
  if (values.length > 0 || (legacyColors?.length || 0) > 0) {
    tokens.candidates = {
      ...(legacyColors?.length ? { colors: legacyColors } : {}),
      ...(values.length > 0 ? { values } : {}),
    }
  } else {
    delete tokens.candidates
  }
  tokens.evidence = retainedEvidence
  return Object.fromEntries(Object.entries(overrides).sort(([first], [second]) => first.localeCompare(second)))
}
