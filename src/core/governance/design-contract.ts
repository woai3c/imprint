import type {
  ReferenceComparisonChange,
  ReferenceComparisonLimitation,
  ReferenceComparisonResult,
} from '../analyzer/reference-compare.js'

export const DESIGN_CONTRACT_SCHEMA_VERSION = '1' as const

export type ComparisonReviewDecisionValue = 'approve-target' | 'ignore'

export interface ComparisonReviewDecisionInput {
  changeId: string
  decision: ComparisonReviewDecisionValue
  expectedFrom: string | null
  expectedTo: string | null
}

export interface ComparisonReviewDecision {
  change: ReferenceComparisonChange
  decision: ComparisonReviewDecisionValue
}

export interface ApprovedDesignContractRule {
  category: ReferenceComparisonChange['category']
  tokenPath: string
  operation: 'set' | 'remove'
  value: string | null
  referenceValue: string | null
  referenceEvidenceIds: string[]
  targetEvidenceIds: string[]
}

export interface ApprovedDesignContract {
  id: string
  schemaVersion: typeof DESIGN_CONTRACT_SCHEMA_VERSION
  scope: 'supported-token-rules'
  routeIdentity: string
  version: number
  reviewId: string
  referenceAnalysisId: string
  targetAnalysisId: string
  rules: ApprovedDesignContractRule[]
  limitations: ReferenceComparisonLimitation[]
  approvedAt: string
}

export interface ApprovedComparisonReview {
  id: string
  schemaVersion: typeof DESIGN_CONTRACT_SCHEMA_VERSION
  routeIdentity: string
  referenceAnalysisId: string
  targetAnalysisId: string
  status: 'approved'
  decisions: ComparisonReviewDecision[]
  comparison: ReferenceComparisonResult
  contract: ApprovedDesignContract
  approvedAt: string
}

export type ComparisonReviewValidationError =
  | 'comparison-not-changed'
  | 'comparison-inconclusive'
  | 'route-mismatch'
  | 'invalid-decision'
  | 'duplicate-decision'
  | 'unknown-change'
  | 'stale-comparison'
  | 'missing-decision'
  | 'no-approved-changes'

export type CreateApprovedComparisonReviewResult =
  { success: true; review: ApprovedComparisonReview } | { success: false; reason: ComparisonReviewValidationError }

interface CreateApprovedComparisonReviewOptions {
  reviewId: string
  contractId: string
  contractVersion: number
  approvedAt: string
}

function comparableChanges(comparison: ReferenceComparisonResult): ReferenceComparisonChange[] {
  return comparison.categories.flatMap((category) => category.changes).filter((change) => change.reviewable !== false)
}

export function createApprovedComparisonReview(
  comparison: ReferenceComparisonResult,
  inputs: ComparisonReviewDecisionInput[],
  options: CreateApprovedComparisonReviewOptions,
): CreateApprovedComparisonReviewResult {
  if (comparison.comparability.reasons.length > 0 || comparison.status === 'inconclusive') {
    return { success: false, reason: 'comparison-inconclusive' }
  }
  if (comparison.status !== 'changed') return { success: false, reason: 'comparison-not-changed' }
  if (comparison.reference.routeIdentity !== comparison.target.routeIdentity) {
    return { success: false, reason: 'route-mismatch' }
  }
  if (
    !options.reviewId ||
    !options.contractId ||
    !Number.isInteger(options.contractVersion) ||
    options.contractVersion < 1 ||
    !options.approvedAt
  ) {
    return { success: false, reason: 'invalid-decision' }
  }

  const changes = comparableChanges(comparison)
  const changesById = new Map(changes.map((change) => [change.id, change]))
  const decisionsById = new Map<string, ComparisonReviewDecisionValue>()
  for (const input of inputs) {
    if (!input || typeof input.changeId !== 'string' || !['approve-target', 'ignore'].includes(input.decision)) {
      return { success: false, reason: 'invalid-decision' }
    }
    if (decisionsById.has(input.changeId)) return { success: false, reason: 'duplicate-decision' }
    const currentChange = changesById.get(input.changeId)
    if (!currentChange) return { success: false, reason: 'unknown-change' }
    if (input.expectedFrom !== (currentChange.from ?? null) || input.expectedTo !== (currentChange.to ?? null)) {
      return { success: false, reason: 'stale-comparison' }
    }
    decisionsById.set(input.changeId, input.decision)
  }
  if (changes.some((change) => !decisionsById.has(change.id))) {
    return { success: false, reason: 'missing-decision' }
  }

  const decisions = changes.map((change) => ({ change, decision: decisionsById.get(change.id)! }))
  const approvedChanges = decisions.filter(({ decision }) => decision === 'approve-target').map(({ change }) => change)
  if (approvedChanges.length === 0) return { success: false, reason: 'no-approved-changes' }

  const contract: ApprovedDesignContract = {
    id: options.contractId,
    schemaVersion: DESIGN_CONTRACT_SCHEMA_VERSION,
    scope: 'supported-token-rules',
    routeIdentity: comparison.target.routeIdentity,
    version: options.contractVersion,
    reviewId: options.reviewId,
    referenceAnalysisId: comparison.reference.analysisId,
    targetAnalysisId: comparison.target.analysisId,
    rules: approvedChanges.map((change) => ({
      category: change.category,
      tokenPath: change.tokenPath,
      operation: change.kind === 'removed' ? 'remove' : 'set',
      value: change.kind === 'removed' ? null : (change.to ?? null),
      referenceValue: change.from ?? null,
      referenceEvidenceIds: [...change.referenceEvidenceIds],
      targetEvidenceIds: [...change.targetEvidenceIds],
    })),
    limitations: [...comparison.comparability.limitations],
    approvedAt: options.approvedAt,
  }

  return {
    success: true,
    review: {
      id: options.reviewId,
      schemaVersion: DESIGN_CONTRACT_SCHEMA_VERSION,
      routeIdentity: comparison.target.routeIdentity,
      referenceAnalysisId: comparison.reference.analysisId,
      targetAnalysisId: comparison.target.analysisId,
      status: 'approved',
      decisions,
      comparison,
      contract,
      approvedAt: options.approvedAt,
    },
  }
}
