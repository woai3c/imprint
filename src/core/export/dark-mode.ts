import { clusterColors } from '../analyzer/color-cluster.js'
import { reselectPortableFoundationColors } from '../analyzer/color-role-promotion.js'
import { buildDesignTokens } from '../analyzer/token-builder.js'
import { buildTokenEvidence } from '../analyzer/token-evidence.js'
import { promotePortableDesignTokens, restrictDesignTokensToBaseCatalog } from '../analyzer/token-promotion.js'
import type { DarkModeResult, DesignToken, TokenEvidence } from '../analyzer/types.js'
import { opaqueRouteIdentity, pageIdentityUrl } from '../analyzer/url-identity.js'
import { sanitizeUrlForPersistence } from '../analyzer/url-privacy.js'
import { canonicalEvidencePageIds } from '../design-evidence/canonical-pages.js'
import type { DesignEvidence, EvidencePage } from '../design-evidence/types.js'

export interface DarkModeExportData {
  hasDarkMode: boolean
  darkTokens?: DesignToken
  /** Observed dark values keyed by the explicit base Design Evidence token reference they override. */
  overrides?: Record<string, string>
  method?: 'media-query' | 'class-toggle' | 'none'
  selector?: string
}

function namespaceDarkPaletteTokens(tokens: DesignToken): DesignToken {
  const rename = (name: string): string => (/^palette-\d+$/.test(name) ? `dark-${name}` : name)
  const colors = Object.fromEntries(Object.entries(tokens.colors).map(([name, value]) => [rename(name), value]))
  const evidence = tokens.evidence
    ? Object.fromEntries(
        Object.entries(tokens.evidence).map(([key, value]) => {
          const match = /^colors\.(palette-\d+)$/.exec(key)
          return [match ? `colors.${rename(match[1])}` : key, value]
        }),
      )
    : undefined
  return { ...tokens, colors, ...(evidence ? { evidence } : {}) }
}

const UNBOUND_RENDERED_SOURCES = new Set(['rendered:text', 'observed:text-background-pair'])

function withoutUnboundRenderedProvenance(evidence: TokenEvidence): TokenEvidence {
  const {
    renderedTextOwners: _renderedTextOwners,
    pairedSurface: _pairedSurface,
    sourceCounts: _sourceCounts,
    ...rest
  } = evidence
  const sources = evidence.sources.filter((source) => !UNBOUND_RENDERED_SOURCES.has(source))
  const sourceCounts = evidence.sourceCounts
    ? Object.fromEntries(
        Object.entries(evidence.sourceCounts).filter(([source]) => !UNBOUND_RENDERED_SOURCES.has(source)),
      )
    : undefined
  return {
    ...rest,
    sources,
    ...(sourceCounts && Object.keys(sourceCounts).length > 0 ? { sourceCounts } : {}),
    reasons: evidence.reasons.filter((reason) => reason !== 'paired-surface'),
  }
}

function stripUnboundRenderedProvenance(tokens: DesignToken): void {
  if (tokens.evidence) {
    tokens.evidence = Object.fromEntries(
      Object.entries(tokens.evidence).map(([path, evidence]) => [path, withoutUnboundRenderedProvenance(evidence)]),
    )
  }
  if (tokens.candidates?.values) {
    tokens.candidates.values = tokens.candidates.values.map((candidate) => ({
      ...candidate,
      evidence: withoutUnboundRenderedProvenance(candidate.evidence),
    }))
  }
}

interface DarkCaptureBinding {
  sourceUrl: string
  pageUrl: string
  routeId: string
  viewport: string
}

function bindEvidenceToDarkCapture(evidence: TokenEvidence, binding: DarkCaptureBinding): TokenEvidence {
  const sourcePage = pageIdentityUrl(binding.sourceUrl)
  const page = pageIdentityUrl(binding.pageUrl)
  const evidencePages = evidence.pages.map(pageIdentityUrl)
  const pairPages = evidence.pairedSurface?.routeSupport.map((route) => pageIdentityUrl(route.page)) || []
  if ([...evidencePages, ...pairPages].some((evidencePage) => evidencePage !== sourcePage)) {
    return withoutUnboundRenderedProvenance(evidence)
  }
  return {
    ...evidence,
    pages: evidencePages.length > 0 ? [page] : [],
    pageRefs: evidencePages.length > 0 ? [binding.routeId] : [],
    ...(evidence.renderedTextOwners
      ? {
          renderedTextOwners: evidence.renderedTextOwners.map((owner) => ({
            ...owner,
            page,
            routeId: binding.routeId,
            viewport: binding.viewport,
          })),
        }
      : {}),
    ...(evidence.pairedSurface
      ? {
          pairedSurface: {
            ...evidence.pairedSurface,
            routeSupport: evidence.pairedSurface.routeSupport.map((route) => ({
              ...route,
              page,
              routeId: binding.routeId,
            })),
          },
        }
      : {}),
  }
}

function bindTokensToDarkCapture(tokens: DesignToken, binding: DarkCaptureBinding): void {
  if (tokens.evidence) {
    tokens.evidence = Object.fromEntries(
      Object.entries(tokens.evidence).map(([path, evidence]) => [path, bindEvidenceToDarkCapture(evidence, binding)]),
    )
  }
  if (tokens.candidates?.values) {
    tokens.candidates.values = tokens.candidates.values.map((candidate) => ({
      ...candidate,
      evidence: bindEvidenceToDarkCapture(candidate.evidence, binding),
    }))
  }
}

function ungroundedRestoredEvidence(value: string): TokenEvidence {
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
    sources: ['restored:unbound-dark-token'],
    reasons: [],
  }
}

function invalidateUnboundEvidence(tokens: DesignToken): void {
  if (tokens.evidence) {
    tokens.evidence = Object.fromEntries(
      Object.entries(tokens.evidence).map(([path, evidence]) => [path, ungroundedRestoredEvidence(evidence.value)]),
    )
  }
  if (tokens.candidates?.values) {
    tokens.candidates.values = tokens.candidates.values.map((candidate) => ({
      ...candidate,
      evidence: ungroundedRestoredEvidence(candidate.value),
    }))
  }
}

function canonicalDarkCaptures(evidence: Pick<DesignEvidence, 'pages'> | undefined): Map<string, EvidencePage> {
  if (!evidence) return new Map()
  const canonicalIds = canonicalEvidencePageIds(evidence)
  return new Map(
    evidence.pages
      .filter((page) => canonicalIds.has(page.id) && page.routeId)
      .map((page) => [page.routeId as string, page]),
  )
}

function resolveCanonicalDarkSource(
  source: NonNullable<DarkModeResult['source']>,
  evidence: Pick<DesignEvidence, 'pages'> | undefined,
): DarkCaptureBinding | undefined {
  if (!evidence) {
    return {
      sourceUrl: source.url,
      pageUrl: pageIdentityUrl(source.url),
      routeId: opaqueRouteIdentity(source.url),
      viewport: source.viewport,
    }
  }
  const capture = canonicalDarkCaptures(evidence).get(opaqueRouteIdentity(source.url))
  if (
    !capture ||
    pageIdentityUrl(capture.url) !== pageIdentityUrl(sanitizeUrlForPersistence(source.url)) ||
    capture.viewport !== source.viewport
  ) {
    return undefined
  }
  return {
    sourceUrl: source.url,
    pageUrl: capture.url,
    routeId: capture.routeId as string,
    viewport: capture.viewport,
  }
}

function hasBoundEvidenceCoverage(evidence: TokenEvidence, captures: ReadonlyMap<string, EvidencePage>): boolean {
  const pageRefs = evidence.pageRefs || []
  const pages = evidence.pages.map(pageIdentityUrl)
  const expectedPages = pageRefs.map((routeId) => captures.get(routeId)?.url).filter((page): page is string => !!page)
  return (
    evidence.observationCount > 0 &&
    (evidence.ownerCount || 0) > 0 &&
    evidence.pageCount > 0 &&
    evidence.captureCount >= evidence.pageCount &&
    (evidence.eligiblePageCount || 0) >= evidence.pageCount &&
    Number.isFinite(evidence.semanticAgreement) &&
    Number.isFinite(evidence.pageSupportRatio) &&
    Math.abs((evidence.pageSupportRatio || 0) - evidence.pageCount / (evidence.eligiblePageCount || 1)) <= 0.001 &&
    pageRefs.length === evidence.pageCount &&
    new Set(pageRefs).size === pageRefs.length &&
    pages.length === evidence.pageCount &&
    expectedPages.length === evidence.pageCount &&
    [...pages].sort().join('\u0000') === expectedPages.map(pageIdentityUrl).sort().join('\u0000')
  )
}

function hasBoundRenderedProvenance(evidence: TokenEvidence, captures: ReadonlyMap<string, EvidencePage>): boolean {
  const claimsRendered = evidence.sources.includes('rendered:text') || evidence.renderedTextOwners !== undefined
  const claimsPair = evidence.sources.includes('observed:text-background-pair') || evidence.pairedSurface !== undefined
  if (!claimsRendered && !claimsPair) return true
  const pageRefs = new Set(evidence.pageRefs || [])
  const ownerKeys = new Set<string>()
  if (
    !evidence.renderedTextOwners?.length ||
    evidence.renderedTextOwners.some((owner) => {
      const capture = captures.get(owner.routeId)
      const key = `${owner.routeId}\u0000${owner.ownerId}`
      const invalid =
        !capture ||
        !pageRefs.has(owner.routeId) ||
        pageIdentityUrl(capture.url) !== pageIdentityUrl(owner.page) ||
        capture.viewport !== owner.viewport ||
        ownerKeys.has(key)
      ownerKeys.add(key)
      return invalid
    })
  ) {
    return false
  }
  if (!claimsPair) return true
  const routeIds = evidence.pairedSurface?.routeSupport.map((route) => route.routeId) || []
  return Boolean(
    evidence.pairedSurface &&
    routeIds.length === evidence.pairedSurface.eligiblePageCount &&
    new Set(routeIds).size === routeIds.length &&
    evidence.pairedSurface.routeSupport.every((route) => {
      const capture = captures.get(route.routeId)
      return !!capture && pageRefs.has(route.routeId) && pageIdentityUrl(capture.url) === pageIdentityUrl(route.page)
    }),
  )
}

function validateRestoredDarkEvidence(tokens: DesignToken, evidence: Pick<DesignEvidence, 'pages'> | undefined): void {
  const captures = canonicalDarkCaptures(evidence)
  const validate = (item: TokenEvidence): TokenEvidence => {
    if (!hasBoundEvidenceCoverage(item, captures)) return ungroundedRestoredEvidence(item.value)
    return hasBoundRenderedProvenance(item, captures) ? item : withoutUnboundRenderedProvenance(item)
  }
  if (tokens.evidence) {
    tokens.evidence = Object.fromEntries(Object.entries(tokens.evidence).map(([path, item]) => [path, validate(item)]))
  }
  if (tokens.candidates?.values) {
    tokens.candidates.values = tokens.candidates.values.map((candidate) => ({
      ...candidate,
      evidence: validate(candidate.evidence),
    }))
  }
}

export function buildDarkModeExportData(
  darkMode: DarkModeResult | null | undefined,
  baseTokens?: DesignToken,
  designEvidence?: Pick<DesignEvidence, 'pages'>,
): DarkModeExportData | undefined {
  if (!darkMode?.hasDarkMode || !darkMode.darkStyles) return undefined

  const clusteredColors = clusterColors(darkMode.darkStyles.colors, darkMode.darkStyles.usageCount)
  const darkTokens = buildDesignTokens(darkMode.darkStyles, clusteredColors, darkMode.darkStyles)
  const source = darkMode.source?.url && darkMode.source.viewport ? darkMode.source : undefined
  const boundSource = source ? resolveCanonicalDarkSource(source, designEvidence) : undefined
  const captures = [
    {
      url: source?.url || 'imprint://dark-mode/',
      viewport: source?.viewport || 'dark',
      styles: darkMode.darkStyles,
    },
  ]
  darkTokens.evidence = buildTokenEvidence(darkTokens, captures)
  reselectPortableFoundationColors(darkTokens, captures)
  if (designEvidence && !boundSource) invalidateUnboundEvidence(darkTokens)
  else if (!boundSource) stripUnboundRenderedProvenance(darkTokens)
  promotePortableDesignTokens(darkTokens)
  darkTokens.evidence = buildTokenEvidence(darkTokens, captures)
  let overrides: Record<string, string> | undefined
  if (baseTokens) {
    overrides = restrictDesignTokensToBaseCatalog(darkTokens, baseTokens)
  }
  if (boundSource) bindTokensToDarkCapture(darkTokens, boundSource)
  else if (designEvidence) invalidateUnboundEvidence(darkTokens)
  else stripUnboundRenderedProvenance(darkTokens)
  return {
    hasDarkMode: true,
    // Residual palette indexes are local to each independently clustered snapshot. Keeping
    // the same palette-N key would falsely imply a semantic light/dark override relationship.
    darkTokens: namespaceDarkPaletteTokens(darkTokens),
    ...(overrides && Object.keys(overrides).length > 0 ? { overrides } : {}),
    method: darkMode.method,
    selector: darkMode.selector,
  }
}

export function normalizeDarkSelector(value: unknown): string {
  if (value === '.dark') return value
  if (typeof value === 'string' && /^\[data-[\w-]+="dark"\]$/.test(value)) return value
  return '.dark'
}

function isDesignToken(value: unknown): value is DesignToken {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<DesignToken>
  return (
    !!candidate.colors &&
    typeof candidate.colors === 'object' &&
    !!candidate.typography &&
    typeof candidate.typography === 'object' &&
    Array.isArray(candidate.spacing) &&
    Array.isArray(candidate.radii) &&
    Array.isArray(candidate.shadows)
  )
}

export function restoreDarkModeExportData(
  storedDarkTokens: unknown,
  baseTokens: DesignToken,
  method: unknown,
  selector?: unknown,
  designEvidence?: Pick<DesignEvidence, 'pages'>,
): DarkModeExportData | undefined {
  if (!storedDarkTokens || typeof storedDarkTokens !== 'object' || Array.isArray(storedDarkTokens)) return undefined

  const restoredDarkTokens = isDesignToken(storedDarkTokens)
    ? structuredClone(storedDarkTokens)
    : {
        ...structuredClone(baseTokens),
        colors: storedDarkTokens as Record<string, string>,
        // Legacy color-only records contain no dark observation evidence. Never retain base/light evidence at the same
        // paths: changed values would otherwise appear grounded simply because the positional key still matches.
        evidence: {},
        candidates: undefined,
        colorRoles: undefined,
      }
  if (Object.keys(restoredDarkTokens.colors).length === 0) return undefined
  validateRestoredDarkEvidence(restoredDarkTokens, designEvidence)
  const overrides = restrictDesignTokensToBaseCatalog(restoredDarkTokens, baseTokens)
  const darkTokens = namespaceDarkPaletteTokens(restoredDarkTokens)
  const normalizedMethod = method === 'media-query' || method === 'class-toggle' ? method : 'media-query'

  return {
    hasDarkMode: true,
    darkTokens,
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    method: normalizedMethod,
    selector: normalizedMethod === 'class-toggle' ? normalizeDarkSelector(selector) : undefined,
  }
}
