export { generateAgentContextBundle } from './agent-context.js'
export { buildAnalysisDigest } from './analysis-digest.js'
export type { AnalysisDigest, AnalysisDigestPackage, DigestTokenValue } from './analysis-digest.js'
export { createInterpretationCacheKey } from './cache-key.js'
export type { InterpretationCacheKeyInput } from './cache-key.js'
export { dedupeProfileClaims } from './claim-dedupe.js'
export type { ClaimDedupeResult } from './claim-dedupe.js'
export {
  DESIGN_CLAIM_CATALOG_VERSION,
  buildDeterministicClaimCatalog,
  canonicalCatalogPageIds,
  countAvailableSingletons,
  materializeDesignProfile,
  validateDesignClaimCatalog,
} from './claim-catalog.js'
export type { DesignClaimCatalogIntegrity } from './claim-catalog.js'
export { parseClaimSelection } from './claim-selection.js'
export type { ClaimSelectionResult } from './claim-selection.js'
export { checkProfileContradictions } from './contradiction-checker.js'
export type { ContradictionCheckResult } from './contradiction-checker.js'
export { buildEvidenceFallbackProfile, repairProfileCoverage } from './evidence-fallback.js'
export type { ProfileCoverageRepairResult } from './evidence-fallback.js'
export { expandCompactProfileCandidate, extractCompactProfileCandidate } from './compact-profile.js'
export {
  CLAIM_CURATION_TIMEOUT_MS,
  interpretDesignEvidence,
  runInterpretationPipeline,
  splitImagesByPass,
} from './interpreter.js'
export type {
  CallDetail,
  InterpretEvidenceOptions,
  InterpretEvidenceResult,
  InterpretationInvoke,
  InterpretationInvokeResult,
  InterpretationPipelineOptions,
  InterpretationPipelineResult,
  InterpretationProviderConfig,
  ObservationCache,
} from './interpreter.js'
export { extractObservationCandidate, validateSectionObservations } from './observation-pass.js'
export type { ObservationValidationResult } from './observation-pass.js'
export {
  createStructuralFingerprint,
  listEvidenceIds,
  listEvidencePackageIds,
  listEvidencePackageTokenRefs,
  listEvidenceTokenRefs,
  restrictEvidencePackageImages,
  selectEvidencePackage,
} from './evidence-selector.js'
export { createEvidenceFingerprint } from './input-fingerprint.js'
export { summarizeInterpretationDiagnostics } from './diagnostic-summary.js'
export {
  DESIGN_PROFILE_PROMPT_VERSION,
  DESIGN_PROFILE_PROMPT_CHAR_LIMIT,
  buildClaimSelectionPrompt,
  buildCompactDesignInterpretationPrompt,
  buildDesignInterpretationPrompt,
  buildDesignProfileRepairPrompt,
  buildSectionObservationPrompt,
  prepareAnalysisDigestPackageForPrompt,
} from './prompt.js'
export { generateDesignProfileJson, generateDesignProfileMarkdown } from './profile-export.js'
export { compareDesignProfiles } from './profile-compare.js'
export type { DesignLanguageComparison } from './profile-compare.js'
export {
  generateReconstructionBrief,
  getReconstructionBriefEligibility,
  reconstructionBriefUnavailableMessage,
} from './reconstruction-brief.js'
export type { ReconstructionBriefEligibility, ReconstructionBriefIneligibilityReason } from './reconstruction-brief.js'
export type * from './types.js'
export { DESIGN_PROFILE_SCHEMA_VERSION } from './types.js'
export { createValidationRecipe, validateRecipe } from './validation-recipe.js'
export { extractProfileCandidate, validateDesignProfile } from './validator.js'
export type { ProfileValidationResult } from './validator.js'
