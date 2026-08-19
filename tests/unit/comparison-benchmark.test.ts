import { describe, expect, it } from 'vitest'

import {
  aggregateEvaluations,
  comparisonCategories,
  evaluateComparison,
  evaluateExecutionFailure,
} from '../comparison-benchmark/evaluate.mjs'

function evidence(id: string) {
  return {
    pages: [{ id }],
    sections: [],
    components: [],
    layoutNodes: [],
    pseudoElements: [],
    interactionObservations: [],
    responsiveObservations: [],
    mediaLayers: [],
  }
}

function comparison({
  status = 'changed',
  changedCategories = ['colors'],
  reasons = [],
  referenceEvidence = 'reference-page',
  targetEvidence = 'target-page',
} = {}) {
  return {
    status,
    comparability: { reasons },
    categories: comparisonCategories.map((category) => ({
      category,
      status:
        status === 'inconclusive' ? 'inconclusive' : changedCategories.includes(category) ? 'changed' : 'unchanged',
      coverage: status === 'inconclusive' ? 'none' : 'complete',
      changes: changedCategories.includes(category)
        ? [
            {
              id: `${category}:changed:test`,
              category,
              kind: 'changed',
              referenceEvidenceIds: referenceEvidence ? [referenceEvidence] : [],
              targetEvidenceIds: targetEvidence ? [targetEvidence] : [],
            },
          ]
        : [],
    })),
  }
}

function scenario(status = 'changed', changedCategories = ['colors']) {
  return { id: 'test-scenario', expectation: { status, changedCategories } }
}

describe('comparison benchmark evaluator', () => {
  it('accepts an exact changed-category result with resolvable evidence', () => {
    const result = evaluateComparison({
      scenario: scenario(),
      comparison: comparison(),
      referenceEvidence: evidence('reference-page'),
      targetEvidence: evidence('target-page'),
    })

    expect(result.passed).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.counts).toMatchObject({
      detectedChangedCategories: 1,
      missedChanges: 0,
      unexpectedChanges: 0,
      evidenceReferenceFailures: 0,
    })
  })

  it('reports category drift and missing evidence separately', () => {
    const result = evaluateComparison({
      scenario: scenario('changed', ['colors']),
      comparison: comparison({ changedCategories: ['typography'], referenceEvidence: '' }),
      referenceEvidence: evidence('reference-page'),
      targetEvidence: evidence('target-page'),
    })

    expect(result.passed).toBe(false)
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['missed-change', 'unexpected-change', 'missing-reference-evidence']),
    )
  })

  it('treats a non-inconclusive damaged result as a fail-closed violation', () => {
    const result = evaluateComparison({
      scenario: {
        id: 'damaged',
        expectation: { status: 'inconclusive', changedCategories: [], comparabilityReasons: ['unhealthy-page'] },
      },
      comparison: comparison({ status: 'unchanged', changedCategories: [], reasons: [] }),
      referenceEvidence: evidence('reference-page'),
      targetEvidence: evidence('target-page'),
    })

    expect(result.passed).toBe(false)
    expect(result.issues.map(({ code }) => code)).toContain('fail-closed-violation')
    expect(result.counts.failClosedViolations).toBe(1)
  })

  it('aggregates raw counts without inventing an accuracy score', () => {
    const passed = evaluateComparison({
      scenario: scenario(),
      comparison: comparison(),
      referenceEvidence: evidence('reference-page'),
      targetEvidence: evidence('target-page'),
    })
    const failed = evaluateComparison({
      scenario: scenario('unchanged', []),
      comparison: comparison(),
      referenceEvidence: evidence('reference-page'),
      targetEvidence: evidence('target-page'),
    })

    const aggregate = aggregateEvaluations([{ evaluation: passed }, { evaluation: failed }])
    expect(aggregate.totals).toMatchObject({ capturePairs: 2, passedPairs: 1, failedPairs: 1, unexpectedChanges: 1 })
    expect(aggregate.categories.colors).toMatchObject({
      expectedChanged: 1,
      detectedChanged: 1,
      expectedUnchanged: 1,
      unexpectedChanged: 1,
    })
  })

  it('records mutable live-site results without inventing ground truth', () => {
    const result = evaluateComparison({
      scenario: scenario('observe', []),
      comparison: comparison({ changedCategories: ['colors', 'layout'] }),
      referenceEvidence: evidence('reference-page'),
      targetEvidence: evidence('target-page'),
    })

    expect(result.passed).toBeNull()
    expect(result.outcome).toBe('observed')
    expect(result.issues).toEqual([])
    const aggregate = aggregateEvaluations([{ evaluation: result }])
    expect(aggregate.totals).toMatchObject({
      capturePairs: 1,
      evaluatedPairs: 0,
      observationOnlyPairs: 1,
      passedPairs: 0,
      failedPairs: 0,
      unexpectedChanges: 0,
    })
  })

  it('records execution failures without turning them into detection misses', () => {
    const result = evaluateExecutionFailure(scenario(), new TypeError('sensitive URL is intentionally not retained'))

    expect(result).toMatchObject({
      passed: false,
      outcome: 'failed',
      issues: [{ code: 'execution-error', errorName: 'TypeError' }],
      actual: { status: 'execution-error' },
      counts: { executionFailures: 1, missedChanges: 0 },
    })
    expect(JSON.stringify(result)).not.toContain('sensitive URL')
  })
})
