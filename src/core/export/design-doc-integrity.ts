import { normalizeColorValue } from '../analyzer/color-cluster.js'
import { hasDepthShadow } from '../analyzer/component-detect.js'
import type { DesignToken } from '../analyzer/types.js'
import { evidencePageRouteIdentity } from '../analyzer/url-identity.js'
import type { DesignProfile } from '../design-context/types.js'
import { resolveDesignTokenRef } from '../design-evidence/token-reference.js'
import type { DesignEvidence } from '../design-evidence/types.js'

const RENDERED_COLOR_USAGE_CATEGORIES = [
  'primaryActionBackgroundColor',
  'primaryActionForegroundColor',
  'primaryActionColor',
  'actionBackgroundColor',
  'actionForegroundColor',
  'actionColor',
  'destructiveActionBackgroundColor',
  'destructiveActionForegroundColor',
  'selectedColor',
  'accentColor',
  'linkColor',
  'statusBackgroundColor',
  'statusForegroundColor',
  'statusColor',
  'bgColor',
  'bgArea',
  'textColor',
  'borderColor',
  'structuralBorderColor',
] as const

function usageForColor(tokens: DesignToken, category: string, value: string): number {
  const normalized = normalizeColorValue(value)
  if (!normalized) return 0
  const prefix = `${category}:`
  return Object.entries(tokens.usageCount || {}).reduce((total, [key, count]) => {
    if (!key.startsWith(prefix)) return total
    return normalizeColorValue(key.slice(prefix.length)) === normalized ? total + count : total
  }, 0)
}

export function isDeclaredOnlyColor(tokens: DesignToken, value: string): boolean {
  const rendered = RENDERED_COLOR_USAGE_CATEGORIES.reduce(
    (total, category) => total + usageForColor(tokens, category, value),
    0,
  )
  if (rendered > 0) return false
  return usageForColor(tokens, 'declaredColor', value) + usageForColor(tokens, 'brandTokenColor', value) > 0
}

export function isPortableColor(tokens: DesignToken, name: string, value: string): boolean {
  if (isDeclaredOnlyColor(tokens, value)) return false
  return !/^(?:dark-)?palette-\d+$/.test(name)
}

function cssLengthPixels(value: string): number | null {
  const match = value.trim().match(/^(-?\d*\.?\d+)(px|rem|em)$/i)
  if (!match) return null
  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount)) return null
  return match[2].toLowerCase() === 'px' ? amount : amount * 16
}

export interface TypographyRoleSizeException {
  role: string
  values: string[]
}

export function typographyRoleSizeExceptions(
  tokens: DesignToken,
  evidence: DesignEvidence | undefined,
): TypographyRoleSizeException[] {
  if (!evidence) return []
  const reusablePixels = tokens.typography.fontSizes.flatMap((value) => {
    const pixels = cssLengthPixels(value)
    return pixels === null ? [] : [pixels]
  })
  const valuesByRole = new Map<string, Set<string>>()
  for (const node of evidence.layoutNodes) {
    const value = node.observedTypography?.fontSize
    if (!node.textRole || !value) continue
    const pixels = cssLengthPixels(value)
    if (pixels === null || reusablePixels.some((candidate) => Math.abs(candidate - pixels) <= 0.1)) continue
    const values = valuesByRole.get(node.textRole) || new Set<string>()
    values.add(value)
    valuesByRole.set(node.textRole, values)
  }
  const roleOrder = ['display', 'heading', 'body', 'label', 'metadata']
  return [...valuesByRole.entries()]
    .map(([role, values]) => ({
      role,
      values: [...values].sort(
        (first, second) =>
          (cssLengthPixels(first) || Number.POSITIVE_INFINITY) -
            (cssLengthPixels(second) || Number.POSITIVE_INFINITY) || first.localeCompare(second),
      ),
    }))
    .sort((first, second) => roleOrder.indexOf(first.role) - roleOrder.indexOf(second.role))
}

export type SurfaceShadowScope = 'foundation' | 'component-only' | 'none'

function observedSurfaceCounts(profile: DesignProfile | null | undefined): { owners: number; shadowed: number } | null {
  const assertion = profile?.transferGrammar?.styleCoordinates
    .find((coordinate) => coordinate.dimension === 'surface')
    ?.claim.assertions?.find((candidate) => candidate.property === 'observed-surface-counts')
  if (!Array.isArray(assertion?.value)) return null
  const counts = new Map(
    assertion.value.flatMap((item) => {
      const match = /^(owners|shadowed):(\d+)$/.exec(item)
      return match ? [[match[1], Number(match[2])] as const] : []
    }),
  )
  const owners = counts.get('owners')
  const shadowed = counts.get('shadowed')
  return owners !== undefined && shadowed !== undefined ? { owners, shadowed } : null
}

export function resolveSurfaceShadowScope(
  tokens: DesignToken,
  evidence: DesignEvidence | undefined,
  profile: DesignProfile | null | undefined,
): SurfaceShadowScope {
  if (!tokens.shadows.some(hasDepthShadow)) return 'none'
  const surfaceCoordinate = profile?.transferGrammar?.styleCoordinates.find(
    (coordinate) => coordinate.dimension === 'surface',
  )
  if (surfaceCoordinate) {
    const hasFoundationClaim =
      surfaceCoordinate.priority === 'P0' &&
      (surfaceCoordinate.claim.tokenRefs || []).some((ref) => {
        if (!ref.startsWith('shadow.')) return false
        const value = resolveDesignTokenRef(tokens, ref)
        return value ? hasDepthShadow(value) : false
      })
    if (!hasFoundationClaim) return 'component-only'

    // A P0 surface coordinate means the sampled surface treatment is reusable;
    // it does not make every token cited by that mixed sample a global rule.
    // The catalog records one representative surface per URL, so promote depth
    // shadows only when they recur across a meaningful share of that sample.
    const counts = observedSurfaceCounts(profile)
    if (counts) {
      const recurrent = counts.owners >= 2 && counts.shadowed >= 2 && counts.shadowed / counts.owners >= 0.5
      return recurrent ? 'foundation' : 'component-only'
    }
    if (!evidence) return 'foundation'
  }
  if (!evidence) return 'component-only'
  const pageUrlById = new Map(evidence.pages.map((page) => [page.id, evidencePageRouteIdentity(page)]))
  const eligibleUrls = new Set(evidence.pages.map(evidencePageRouteIdentity))
  const surfaceSections = evidence.sections.filter((section) => {
    const styles = section.observedStyles
    return Boolean(
      styles?.backgroundColor || styles?.gradient || styles?.boxShadow || Object.keys(styles?.borders || {}).length,
    )
  })
  const shadowedSections = surfaceSections.filter((section) => hasDepthShadow(section.observedStyles?.boxShadow))
  const shadowedUrls = new Set(
    shadowedSections.flatMap((section) => {
      const url = pageUrlById.get(section.pageId)
      return url ? [url] : []
    }),
  )
  const reusable =
    eligibleUrls.size >= 2 &&
    shadowedUrls.size / eligibleUrls.size >= 0.75 &&
    shadowedSections.length / Math.max(1, surfaceSections.length) >= 0.5
  return reusable ? 'foundation' : 'component-only'
}

export interface DesignDocSemanticIntegrity {
  valid: boolean
  errors: string[]
  warnings: string[]
  typographyRoleExceptions: TypographyRoleSizeException[]
  surfaceShadowScope: SurfaceShadowScope
}

function validateCoverage(evidence: DesignEvidence, errors: string[], warnings: string[]): void {
  const coverage = evidence.coverage.captureCoverage
  if (!coverage) return
  const validateStatus = (label: string, captured: number, expected: number, status: 'complete' | 'partial'): void => {
    const actual = captured >= expected ? 'complete' : 'partial'
    if (status !== actual) errors.push(`${label}:status-${status}-but-${captured}-of-${expected}`)
    if (captured > expected) errors.push(`${label}:captured-exceeds-expected(${captured}>${expected})`)
  }
  validateStatus('capture-plan', coverage.captured, coverage.expected, coverage.status)
  if (coverage.fullMatrix) {
    validateStatus(
      'capture-matrix',
      coverage.fullMatrix.captured,
      coverage.fullMatrix.expected,
      coverage.fullMatrix.status,
    )
    const expectedMatrix =
      (evidence.coverage.urlCoverage?.requested || 0) * Math.max(1, coverage.requestedViewports.length)
    if (expectedMatrix > 0 && coverage.fullMatrix.expected !== expectedMatrix) {
      errors.push(`capture-matrix:expected-${coverage.fullMatrix.expected}-should-be-${expectedMatrix}`)
    }
  } else if (coverage.requestedViewports.length > 1) {
    warnings.push('capture-matrix:legacy-record-without-full-matrix')
  }
  if (coverage.responsivePairs) {
    validateStatus(
      'responsive-pairs',
      coverage.responsivePairs.capturedUrls,
      coverage.responsivePairs.expectedUrls,
      coverage.responsivePairs.status,
    )
  } else if (coverage.requestedViewports.length > 1) {
    warnings.push('responsive-pairs:legacy-record-without-pair-coverage')
  }
}

/** Validates cross-section semantic invariants before a DESIGN.md document is emitted. */
export function validateDesignDocSemantics(
  tokens: DesignToken,
  evidence?: DesignEvidence,
  profile?: DesignProfile | null,
): DesignDocSemanticIntegrity {
  const errors: string[] = []
  const warnings: string[] = []
  const evidenceTokens = evidence?.tokens || tokens
  if (evidence) validateCoverage(evidence, errors, warnings)

  const foundationClaims = [
    ...(profile?.transferGrammar?.styleCoordinates || [])
      .filter((coordinate) => coordinate.priority === 'P0')
      .map((coordinate) => coordinate.claim),
    ...(profile?.transferGrammar?.coreRules || []).filter((rule) => rule.priority === 'P0').map((rule) => rule.claim),
  ]
  for (const claim of foundationClaims) {
    for (const ref of claim.tokenRefs || []) {
      if (!ref.startsWith('color.')) continue
      const value = resolveDesignTokenRef(evidenceTokens, ref)
      if (value && isDeclaredOnlyColor(evidenceTokens, value)) {
        errors.push(`foundation-claim:${claim.catalogId || 'uncataloged'}:declared-only-color(${ref})`)
      }
    }
  }

  const shadowScope = resolveSurfaceShadowScope(evidenceTokens, evidence, profile)
  const surfaceCoordinate = profile?.transferGrammar?.styleCoordinates.find(
    (coordinate) => coordinate.dimension === 'surface',
  )
  if (shadowScope === 'foundation' && surfaceCoordinate && surfaceCoordinate.priority !== 'P0') {
    errors.push('surface-shadow:foundation-guidance-without-P0-surface-coordinate')
  }

  const declaredCandidates = [
    ...(tokens.candidates?.colors || []).filter((candidate) => candidate.kind === 'declared-only'),
    ...Object.entries(tokens.colors).flatMap(([name, value]) =>
      !isPortableColor(tokens, name, value) && isDeclaredOnlyColor(tokens, value)
        ? [{ value, kind: 'declared-only' as const }]
        : [],
    ),
  ]
  if (declaredCandidates.length > 0) {
    warnings.push(`declared-only-colors:moved-to-evidence-appendix(${declaredCandidates.length})`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    typographyRoleExceptions: typographyRoleSizeExceptions(tokens, evidence),
    surfaceShadowScope: shadowScope,
  }
}
