import type { CapturedPageEvidence } from '../design-evidence/index.js'
import { buildDesignEvidence } from '../design-evidence/index.js'
import type { DesignEvidence, TechStackInfo } from '../design-evidence/types.js'
import { clusterColors, normalizeColorValue } from './color-cluster.js'
import { appendExtractionIssueLimitation, isPageHealthExtractionIssue } from './extraction-limitations.js'
import { buildEvidenceBackedClaims, generateFeatureTags } from './feature-tags.js'
import type { MotionToken, ResponsiveBreakpoint } from './responsive-motion.js'
import { mergeStyles, mergeStylesWithNormalizedUsage } from './style-merge.js'
import { buildDesignTokens, normalizeDesignTokenUsageCount } from './token-builder.js'
import { type TokenEvidenceCapture, buildTokenEvidence, measurementConfidenceFor } from './token-evidence.js'
import type { DesignToken, ExtractedStyles, ExtractionIssue, InteractionStyles } from './types.js'
import { pageIdentityUrl } from './url-identity.js'

export interface BuildAnalysisOutputInput {
  analysisId: string
  requestedUrl: string
  finalUrl: string
  accessMode: 'anonymous' | 'managed'
  authWallDetected: boolean
  expectedPageCount: number
  expectedViewports: string[]
  expectedCaptureCount: number
  styles: ExtractedStyles[]
  styleCaptures: TokenEvidenceCapture[]
  evidenceEligibleStyles: ExtractedStyles[]
  evidenceEligibleStyleCaptures: TokenEvidenceCapture[]
  extractionIssues: ExtractionIssue[]
  limitations: string[]
  interactionStyles: InteractionStyles
  breakpoints: ResponsiveBreakpoint[]
  motion: MotionToken[]
  captures: CapturedPageEvidence[]
  techStack?: TechStackInfo
}

export interface AnalysisOutput {
  tokens: DesignToken
  rawStyles: ExtractedStyles
  designEvidence: DesignEvidence
  featureTags: string[]
}

export interface AnalysisOutputStages {
  onClusteringColors?: () => void
  onGeneratingTokens?: () => void
}

function emptyDesignTokens(): DesignToken {
  return {
    colors: {},
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
    usageCount: {},
    evidence: {},
  }
}

/** Keep isolated border samples as candidates without presenting them as a reusable surface contract. */
export function demoteWeakSemanticBorderTokens(tokens: DesignToken): void {
  for (const name of ['border', 'border-subtle']) {
    const path = `colors.${name}`
    const value = tokens.colors[name]
    const evidence = tokens.evidence?.[path]
    if (!value || evidence?.confidence !== 'low') continue
    const normalizedValue = normalizeColorValue(value) || value
    const usageFor = (category: string): number =>
      Object.entries(tokens.usageCount || {}).reduce((total, [key, count]) => {
        if (!key.startsWith(`${category}:`)) return total
        return normalizeColorValue(key.slice(category.length + 1)) === normalizedValue ? total + count : total
      }, 0)
    const borderObservationCount = usageFor('borderColor') || usageFor('structuralBorderColor')
    const observationCount = borderObservationCount || evidence.observationCount
    if (observationCount > 1) continue

    delete tokens.colors[name]
    delete tokens.evidence?.[path]
    const alreadyRepresented = Object.values(tokens.colors).some(
      (candidate) => (normalizeColorValue(candidate) || candidate) === normalizedValue,
    )
    if (alreadyRepresented) continue
    const candidates = tokens.candidates?.colors || []
    if (!candidates.some((candidate) => normalizeColorValue(candidate.value) === normalizedValue)) {
      candidates.push({
        value: normalizedValue,
        kind: 'observed-unassigned',
        observationCount,
        pageCount: evidence.pageCount,
        captureCount: evidence.captureCount,
        measurementConfidence: evidence.measurementConfidence || evidence.confidence,
        sources: evidence.sources,
      })
    }
    tokens.candidates = { ...tokens.candidates, colors: candidates }
  }
}

const RENDERED_COLOR_CANDIDATE_CATEGORIES = new Set([
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

export function colorCandidateObservationCount(
  styles: Pick<ExtractedStyles, 'usageCount'>,
  value: string,
  kind: 'declared-only' | 'observed-unassigned' = 'observed-unassigned',
): number {
  const normalized = normalizeColorValue(value)
  if (!normalized) return 0
  const counts = new Map<string, number>()
  for (const [key, count] of Object.entries(styles.usageCount)) {
    const separator = key.indexOf(':')
    if (separator <= 0 || !Number.isFinite(count) || count <= 0) continue
    const category = key.slice(0, separator)
    if (normalizeColorValue(key.slice(separator + 1)) !== normalized) continue
    counts.set(category, (counts.get(category) || 0) + count)
  }
  if (kind === 'declared-only') return counts.get('declaredColor') || 0
  const baseRendered = (counts.get('bgColor') || 0) + (counts.get('textColor') || 0) + (counts.get('borderColor') || 0)
  return (
    baseRendered ||
    Math.max(
      counts.get('structuralBorderColor') || 0,
      ...[...counts.entries()]
        .filter(([category]) => RENDERED_COLOR_CANDIDATE_CATEGORIES.has(category) && category !== 'bgArea')
        .map(([, count]) => count),
    )
  )
}

function enrichColorCandidateEvidence(tokens: DesignToken, captures: TokenEvidenceCapture[]): void {
  for (const candidate of tokens.candidates?.colors || []) {
    const pages = new Set<string>()
    const sources = new Set(candidate.sources)
    let captureCount = 0
    let observationCount = 0
    for (const capture of captures) {
      let matched = false
      for (const [key, count] of Object.entries(capture.styles.usageCount)) {
        const separator = key.indexOf(':')
        if (separator <= 0 || !Number.isFinite(count) || count <= 0) continue
        const category = key.slice(0, separator)
        const eligible =
          candidate.kind === 'declared-only'
            ? category === 'declaredColor'
            : RENDERED_COLOR_CANDIDATE_CATEGORIES.has(category)
        if (!eligible || normalizeColorValue(key.slice(separator + 1)) !== candidate.value) continue
        matched = true
        for (const source of capture.styles.valueSources?.[key] || []) sources.add(source)
      }
      if (!matched) continue
      observationCount += colorCandidateObservationCount(capture.styles, candidate.value, candidate.kind)
      captureCount += 1
      pages.add(pageIdentityUrl(capture.url))
    }
    candidate.observationCount = Number(observationCount.toFixed(3))
    candidate.captureCount = captureCount
    candidate.pageCount = pages.size
    candidate.sources = [...sources].sort()
    candidate.measurementConfidence = measurementConfidenceFor(pages.size, captureCount, observationCount, sources)
  }
}

/** Builds tokens and evidence from completed captures without owning browser lifecycle or persistence. */
export function buildAnalysisOutput(
  input: BuildAnalysisOutputInput,
  stages: AnalysisOutputStages = {},
): AnalysisOutput {
  const mergedStyles = mergeStyles(input.styles)
  const tokenSelectionStyles = mergeStylesWithNormalizedUsage(
    input.styles,
    input.styleCaptures.map((capture) => pageIdentityUrl(capture.url)),
  )

  stages.onClusteringColors?.()
  const clusteredColors = clusterColors(tokenSelectionStyles.colors, tokenSelectionStyles.usageCount)

  stages.onGeneratingTokens?.()
  const tokens = buildDesignTokens(tokenSelectionStyles, clusteredColors, tokenSelectionStyles)
  tokens.usageCount = normalizeDesignTokenUsageCount(mergedStyles.usageCount)
  tokens.evidence = buildTokenEvidence(tokens, input.styleCaptures)
  enrichColorCandidateEvidence(tokens, input.styleCaptures)
  demoteWeakSemanticBorderTokens(tokens)

  let evidenceTokens = emptyDesignTokens()
  let evidenceMergedStyles = mergeStyles([])
  if (input.evidenceEligibleStyles.length > 0) {
    evidenceMergedStyles = mergeStyles(input.evidenceEligibleStyles)
    const evidenceSelectionStyles = mergeStylesWithNormalizedUsage(
      input.evidenceEligibleStyles,
      input.evidenceEligibleStyleCaptures.map((capture) => pageIdentityUrl(capture.url)),
    )
    const evidenceColors = clusterColors(evidenceSelectionStyles.colors, evidenceSelectionStyles.usageCount)
    evidenceTokens = buildDesignTokens(evidenceSelectionStyles, evidenceColors, evidenceSelectionStyles)
    evidenceTokens.usageCount = normalizeDesignTokenUsageCount(evidenceMergedStyles.usageCount)
    evidenceTokens.evidence = buildTokenEvidence(evidenceTokens, input.evidenceEligibleStyleCaptures)
    enrichColorCandidateEvidence(evidenceTokens, input.evidenceEligibleStyleCaptures)
    demoteWeakSemanticBorderTokens(evidenceTokens)
  }

  let featureTags = generateFeatureTags(tokens, mergedStyles)
  const limitations = [...input.limitations]
  input.extractionIssues
    .filter((issue) => !isPageHealthExtractionIssue(issue))
    .slice(0, 8)
    .forEach((issue) => appendExtractionIssueLimitation(limitations, issue))

  let designEvidence = buildDesignEvidence({
    analysisId: input.analysisId,
    requestedUrl: input.requestedUrl,
    finalUrl: input.finalUrl,
    accessMode: input.accessMode,
    authWallDetected: input.authWallDetected,
    expectedPageCount: input.expectedPageCount,
    expectedViewports: input.expectedViewports,
    expectedCaptureCount: input.expectedCaptureCount,
    screenshotAssetIssueCount: input.extractionIssues.filter(
      (issue) =>
        /:screenshot:overview$/.test(issue.stage) &&
        /^screenshot-dimensions-(?:mismatch|unreadable)/.test(issue.reason),
    ).length,
    tokens: evidenceTokens,
    featureTags,
    interactionStyles: input.interactionStyles,
    breakpoints: input.breakpoints,
    motion: input.motion,
    captures: input.captures,
    limitations,
    techStack: input.techStack,
  })
  const deterministicClaims = buildEvidenceBackedClaims(evidenceTokens, evidenceMergedStyles, designEvidence)
  featureTags = [...new Set([...deterministicClaims.map((claim) => claim.label), ...featureTags])].slice(0, 6)
  designEvidence = {
    ...designEvidence,
    featureTags,
    ...(deterministicClaims.length > 0 ? { deterministicClaims } : {}),
  }

  return { tokens, rawStyles: mergedStyles, designEvidence, featureTags }
}
