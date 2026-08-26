import type { CapturedPageEvidence } from '../design-evidence/index.js'
import { buildDesignEvidence } from '../design-evidence/index.js'
import type { DesignEvidence, TechStackInfo } from '../design-evidence/types.js'
import { clusterColors } from './color-cluster.js'
import { appendExtractionIssueLimitation, isPageHealthExtractionIssue } from './extraction-limitations.js'
import { buildEvidenceBackedClaims, generateFeatureTags } from './feature-tags.js'
import type { MotionToken, ResponsiveBreakpoint } from './responsive-motion.js'
import { mergeStyles, mergeStylesWithNormalizedUsage } from './style-merge.js'
import { buildDesignTokens, normalizeDesignTokenUsageCount } from './token-builder.js'
import { type TokenEvidenceCapture, buildTokenEvidence } from './token-evidence.js'
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
