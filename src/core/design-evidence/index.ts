export { resolveScreenshotAssetCoverage, screenshotAssetIssueCount } from './asset-integrity.js'
export { buildDesignEvidence } from './evidence-builder.js'
export type { BuildDesignEvidenceInput, CapturedPageEvidence } from './evidence-builder.js'
export { generateDesignEvidenceBrief, generateDesignEvidenceJson } from './evidence-export.js'
export { computeInteractionStateMetrics } from './interaction-metrics.js'
export type { InteractionStateMetrics } from './interaction-metrics.js'
export { extractPageEvidence } from './page-extractor.js'
export { observeSafeInteractions } from './interaction-observer.js'
export type { InteractionObservationSnapshot } from './interaction-observer.js'
export type {
  PageComponentSnapshot,
  PageEvidenceSnapshot,
  PageHorizontalOverflowSource,
  PageInteractionCandidateSnapshot,
  PageLayoutNodeSnapshot,
  PageMediaLayerSnapshot,
  PageSectionSnapshot,
} from './page-extractor.js'
export { createEvidenceId } from './stable-id.js'
export type * from './types.js'
