import { describe, expect, it } from 'vitest'

import { evaluateQualityPolicy, validateQualityPolicy } from '../comparison-benchmark/policy.mjs'

const categories = ['colors', 'typography', 'spacing', 'radii', 'layout', 'interaction-states', 'responsive']

function policy() {
  return {
    schemaVersion: '1',
    id: 'policy-v1',
    frozenAt: '2026-08-19',
    frozenAgainstCommit: 'abc123',
    requirements: {
      corpusIds: ['prospective-v1'],
      corpusSha256: 'a'.repeat(64),
      fixtureSha256: 'c'.repeat(64),
      implementationPaths: ['src/core/analyzer', 'src/core/design-evidence', 'src/core/governance'],
      allowedRoles: ['prospective-holdout'],
      allowObservationOnly: false,
      requiredStatuses: ['changed', 'unchanged', 'inconclusive'],
      requiredChangedCategories: categories,
      maximumTotals: {
        failedPairs: 0,
        missedChanges: 0,
        expectedChangeInconclusive: 0,
        unexpectedChanges: 0,
        unexpectedInconclusive: 0,
        failClosedViolations: 0,
        evidenceReferenceFailures: 0,
        executionFailures: 0,
      },
    },
    runtime: { mode: 'observe-only', reason: 'Not calibrated.' },
    claimBoundary: 'Controlled corpus only.',
  }
}

function corpus() {
  return {
    id: 'prospective-v1',
    scenarios: [
      {
        role: 'prospective-holdout',
        expectation: { status: 'changed', changedCategories: categories },
      },
      { role: 'prospective-holdout', expectation: { status: 'unchanged', changedCategories: [] } },
      { role: 'prospective-holdout', expectation: { status: 'inconclusive', changedCategories: [] } },
    ],
  }
}

function summary(overrides = {}) {
  return {
    totals: {
      failedPairs: 0,
      missedChanges: 0,
      expectedChangeInconclusive: 0,
      unexpectedChanges: 0,
      unexpectedInconclusive: 0,
      failClosedViolations: 0,
      evidenceReferenceFailures: 0,
      executionFailures: 0,
      ...overrides,
    },
  }
}

describe('comparison benchmark quality policy', () => {
  it('passes only when the frozen corpus coverage and error maxima are satisfied', () => {
    const result = evaluateQualityPolicy({
      policy: policy(),
      corpus: corpus(),
      corpusSha256: 'a'.repeat(64),
      fixtureSha256: 'c'.repeat(64),
      summary: summary(),
      policySha256: 'policy-hash',
    })

    expect(result.status).toBe('passed')
    expect(result.issues).toEqual([])
  })

  it('fails when a required category is absent or an error maximum is exceeded', () => {
    const inputCorpus = corpus()
    inputCorpus.scenarios[0].expectation.changedCategories = categories.slice(0, -1)
    const result = evaluateQualityPolicy({
      policy: policy(),
      corpus: inputCorpus,
      corpusSha256: 'a'.repeat(64),
      fixtureSha256: 'c'.repeat(64),
      summary: summary({ unexpectedChanges: 1 }),
      policySha256: 'policy-hash',
    })

    expect(result.status).toBe('failed')
    expect(result.issues).toContainEqual({ code: 'required-changed-category-missing', category: 'responsive' })
    expect(result.issues).toContainEqual({
      code: 'metric-maximum-exceeded',
      metric: 'unexpectedChanges',
      maximum: 0,
      actual: 1,
    })
  })

  it('fails when the prospective corpus changes after it is pinned', () => {
    const result = evaluateQualityPolicy({
      policy: policy(),
      corpus: corpus(),
      corpusSha256: 'b'.repeat(64),
      fixtureSha256: 'c'.repeat(64),
      summary: summary(),
      policySha256: 'policy-hash',
    })

    expect(result.status).toBe('failed')
    expect(result.issues).toContainEqual({
      code: 'corpus-hash-mismatch',
      expected: 'a'.repeat(64),
      actual: 'b'.repeat(64),
    })
  })

  it('fails when a referenced fixture changes after it is pinned', () => {
    const result = evaluateQualityPolicy({
      policy: policy(),
      corpus: corpus(),
      corpusSha256: 'a'.repeat(64),
      fixtureSha256: 'd'.repeat(64),
      summary: summary(),
      policySha256: 'policy-hash',
    })

    expect(result.status).toBe('failed')
    expect(result.issues).toContainEqual({
      code: 'fixture-hash-mismatch',
      expected: 'c'.repeat(64),
      actual: 'd'.repeat(64),
    })
  })

  it('rejects runtime thresholds before they are calibrated', () => {
    const invalid = policy()
    invalid.runtime.mode = 'threshold'

    expect(() => validateQualityPolicy(invalid)).toThrow('runtime.mode must remain observe-only')
  })
})
