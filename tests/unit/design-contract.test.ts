import { describe, expect, it } from 'vitest'

import type { ReferenceComparisonResult } from '../../src/core/analyzer/reference-compare.js'
import { createApprovedComparisonReview } from '../../src/core/governance/design-contract.js'

function comparison(status: ReferenceComparisonResult['status'] = 'changed'): ReferenceComparisonResult {
  return {
    schemaVersion: '1',
    reference: {
      analysisId: 'reference-analysis',
      url: 'https://example.test/products',
      routeIdentity: 'https://example.test/products',
    },
    target: {
      analysisId: 'target-analysis',
      url: 'https://example.test/products',
      routeIdentity: 'https://example.test/products',
    },
    status,
    comparability: {
      status: status === 'inconclusive' ? 'inconclusive' : 'limited',
      reasons: status === 'inconclusive' ? ['incomplete-coverage'] : [],
      limitations: ['exact-observed-values-only', 'entry-and-captured-page-set-only'],
      comparedPageKeys: ['https://example.test/products::desktop'],
      differences: [],
    },
    categories: [
      {
        category: 'colors',
        status: 'changed',
        changes: [
          {
            id: 'colors:changed:colors.primary',
            category: 'colors',
            kind: 'changed',
            tokenPath: 'colors.primary',
            from: '#112233',
            to: '#445566',
            referenceEvidenceIds: ['reference-color'],
            targetEvidenceIds: ['target-color'],
            reviewable: true,
          },
        ],
        coverage: 'complete',
        limitations: [],
      },
      {
        category: 'spacing',
        status: 'changed',
        changes: [
          {
            id: 'spacing:removed:spacing.1',
            category: 'spacing',
            kind: 'removed',
            tokenPath: 'spacing.1',
            from: '8px',
            referenceEvidenceIds: ['reference-spacing'],
            targetEvidenceIds: [],
            reviewable: true,
          },
        ],
        coverage: 'complete',
        limitations: [],
      },
      { category: 'typography', status: 'unchanged', coverage: 'complete', limitations: [], changes: [] },
      { category: 'radii', status: 'unchanged', coverage: 'complete', limitations: [], changes: [] },
      {
        category: 'layout',
        status: 'changed',
        coverage: 'partial',
        limitations: ['section-level-properties-only'],
        changes: [
          {
            id: 'layout:changed:layout.hero.1.order',
            category: 'layout',
            kind: 'changed',
            tokenPath: 'layout.hero.1.order',
            from: '0',
            to: '1',
            referenceEvidenceIds: ['reference-hero'],
            targetEvidenceIds: ['target-hero'],
            reviewable: false,
          },
        ],
      },
      {
        category: 'interaction-states',
        status: 'inconclusive',
        coverage: 'none',
        limitations: ['observed-interaction-styles-only'],
        changes: [],
      },
      {
        category: 'responsive',
        status: 'inconclusive',
        coverage: 'none',
        limitations: ['matched-responsive-observations-only', 'single-viewport'],
        changes: [],
      },
    ],
    entityMatching: null,
    summary: { changedCategories: 3, changedItems: 3 },
  }
}

const options = {
  reviewId: 'review-1',
  contractId: 'contract-1',
  contractVersion: 3,
  approvedAt: '2026-08-17T15:00:00.000Z',
}

function colorDecision(decision: 'approve-target' | 'ignore') {
  return {
    changeId: 'colors:changed:colors.primary',
    decision,
    expectedFrom: '#112233',
    expectedTo: '#445566',
  }
}

function spacingDecision(decision: 'approve-target' | 'ignore') {
  return {
    changeId: 'spacing:removed:spacing.1',
    decision,
    expectedFrom: '8px',
    expectedTo: null,
  }
}

describe('approved comparison review', () => {
  it('creates an immutable partial contract from explicitly approved target changes', () => {
    const result = createApprovedComparisonReview(
      comparison(),
      [colorDecision('approve-target'), spacingDecision('ignore')],
      options,
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.review.decisions.map(({ decision }) => decision)).toEqual(['approve-target', 'ignore'])
    expect(result.review.contract).toMatchObject({
      scope: 'supported-token-rules',
      version: 3,
      routeIdentity: 'https://example.test/products',
      referenceAnalysisId: 'reference-analysis',
      targetAnalysisId: 'target-analysis',
    })
    expect(result.review.contract.rules).toEqual([
      {
        category: 'colors',
        tokenPath: 'colors.primary',
        operation: 'set',
        value: '#445566',
        referenceValue: '#112233',
        referenceEvidenceIds: ['reference-color'],
        targetEvidenceIds: ['target-color'],
      },
    ])
  })

  it('represents an approved removal without inventing a replacement value', () => {
    const result = createApprovedComparisonReview(
      comparison(),
      [colorDecision('ignore'), spacingDecision('approve-target')],
      options,
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.review.contract.rules[0]).toMatchObject({
      tokenPath: 'spacing.1',
      operation: 'remove',
      value: null,
      referenceValue: '8px',
    })
  })

  it.each([
    {
      name: 'missing decisions',
      inputs: [colorDecision('approve-target')],
      reason: 'missing-decision',
    },
    {
      name: 'duplicate decisions',
      inputs: [colorDecision('approve-target'), colorDecision('ignore')],
      reason: 'duplicate-decision',
    },
    {
      name: 'unknown changes',
      inputs: [
        {
          changeId: 'colors:changed:colors.unknown',
          decision: 'approve-target' as const,
          expectedFrom: '#112233',
          expectedTo: '#445566',
        },
        spacingDecision('ignore'),
      ],
      reason: 'unknown-change',
    },
    {
      name: 'all ignored changes',
      inputs: [colorDecision('ignore'), spacingDecision('ignore')],
      reason: 'no-approved-changes',
    },
  ])('rejects $name', ({ inputs, reason }) => {
    expect(createApprovedComparisonReview(comparison(), inputs, options)).toEqual({ success: false, reason })
  })

  it('rejects a decision when the values changed after the user reviewed it', () => {
    expect(
      createApprovedComparisonReview(
        comparison(),
        [{ ...colorDecision('approve-target'), expectedTo: '#ffffff' }, spacingDecision('ignore')],
        options,
      ),
    ).toEqual({ success: false, reason: 'stale-comparison' })
  })

  it('rejects comparisons that were not conclusively changed', () => {
    expect(createApprovedComparisonReview(comparison('inconclusive'), [], options)).toEqual({
      success: false,
      reason: 'comparison-inconclusive',
    })
    expect(createApprovedComparisonReview(comparison('unchanged'), [], options)).toEqual({
      success: false,
      reason: 'comparison-not-changed',
    })
  })
})
