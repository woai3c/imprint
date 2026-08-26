import type { DocLanguage } from './analyzer/agent-guide.js'
import type { AnalysisResult, DesignToken } from './analyzer/types.js'
import {
  sanitizeDesignEvidenceForPersistence,
  sanitizeDesignTokensForPersistence,
  sanitizeExtractionIssuesForDisplay,
  sanitizePageCoverageForPersistence,
  sanitizeUrlForPersistence,
} from './analyzer/url-privacy.js'
import { createDeterministicDesignContext } from './design-context/deterministic-context.js'
import type { DeterministicDesignContext } from './design-context/deterministic-context.js'
import type { DesignEvidence } from './design-evidence/types.js'
import {
  type DarkModeExportData,
  buildDarkModeExportData,
  generateComponentSpecsJson,
  generateCssVariables,
  generateDesignDoc,
  generateDesignEvidenceJson,
  generateDesignProfileJson,
  generateDtcgJson,
  generateLocalVisualQa,
  generatePdfHtml,
  generateScssVariables,
  generateTailwindTheme,
} from './export/index.js'

export interface BuildAnalysisArtifactsOptions {
  sourceUrl: string
  language?: DocLanguage
  /**
   * Evidence used to build deterministic context and prose artifacts. Desktop passes its already-sanitized snapshot;
   * CLI and MCP retain their existing in-memory context behavior by leaving this unset.
   */
  contextEvidence?: DesignEvidence
}

export interface AnalysisArtifactBundle {
  tokens: DesignToken
  evidence: DesignEvidence
  darkMode: DarkModeExportData | undefined
  designContext: DeterministicDesignContext
  cssVariables: string
  tailwindTheme: string
  scssVariables: string
  designDoc: string
  dtcgJson: string
  evidenceJson: string
  profileJson: string
  componentSpecsJson: string
  visualQaJson: string
  pdfHtml: string
  pageCoverage: AnalysisResult['pageCoverage']
  extractionIssues: AnalysisResult['extractionIssues']
  finalUrl: string
}

/** Builds the public, deterministic artifact set shared by Desktop, CLI, and MCP. */
export function buildAnalysisArtifacts(
  result: AnalysisResult,
  options: BuildAnalysisArtifactsOptions,
): AnalysisArtifactBundle {
  const language = options.language || 'en'
  const contextEvidence = options.contextEvidence || result.designEvidence
  const tokens = sanitizeDesignTokensForPersistence(result.tokens)
  const evidence = sanitizeDesignEvidenceForPersistence(contextEvidence)
  const rawDarkMode = buildDarkModeExportData(result.darkMode)
  const darkMode = rawDarkMode?.darkTokens
    ? { ...rawDarkMode, darkTokens: sanitizeDesignTokensForPersistence(rawDarkMode.darkTokens) }
    : rawDarkMode
  const designContext = createDeterministicDesignContext(contextEvidence, language)
  const cssVariables = generateCssVariables(tokens, darkMode, result.breakpoints)
  const tailwindTheme = generateTailwindTheme(tokens, darkMode, result.breakpoints)
  const designDoc = generateDesignDoc({
    tokens,
    url: options.sourceUrl,
    featureTags: result.featureTags,
    darkMode,
    breakpoints: result.breakpoints,
    components: result.components,
    language,
    designEvidence: contextEvidence,
    designProfile: designContext.profile,
  })

  return {
    tokens,
    evidence,
    darkMode,
    designContext,
    cssVariables,
    tailwindTheme,
    scssVariables: generateScssVariables(tokens, darkMode),
    designDoc,
    dtcgJson: generateDtcgJson(tokens, darkMode),
    evidenceJson: generateDesignEvidenceJson(evidence),
    profileJson: generateDesignProfileJson(designContext.profile),
    componentSpecsJson: generateComponentSpecsJson(evidence),
    visualQaJson: JSON.stringify(generateLocalVisualQa(evidence), null, 2),
    pdfHtml: generatePdfHtml(tokens, sanitizeUrlForPersistence(options.sourceUrl), result.featureTags, darkMode),
    pageCoverage: sanitizePageCoverageForPersistence(result.pageCoverage),
    extractionIssues: sanitizeExtractionIssuesForDisplay(result.extractionIssues),
    finalUrl: sanitizeUrlForPersistence(result.finalUrl),
  }
}
