export { buildDesignEvidence } from './evidence-builder.js'
export type { BuildDesignEvidenceInput, CapturedPageEvidence } from './evidence-builder.js'
export { generateDesignEvidenceBrief, generateDesignEvidenceJson } from './evidence-export.js'
export { extractPageEvidence } from './page-extractor.js'
export { observeSafeInteractions } from './interaction-observer.js'
export type { InteractionObservationSnapshot } from './interaction-observer.js'
export type {
  PageComponentSnapshot,
  PageEvidenceSnapshot,
  PageInteractionCandidateSnapshot,
  PageLayoutNodeSnapshot,
  PageMediaLayerSnapshot,
  PageSectionSnapshot,
} from './page-extractor.js'
export { createEvidenceId } from './stable-id.js'
export type * from './types.js'
