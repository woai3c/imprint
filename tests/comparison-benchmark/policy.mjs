import { comparisonCategories } from './evaluate.mjs'

const totalMetrics = new Set([
  'failedPairs',
  'missedChanges',
  'expectedChangeInconclusive',
  'unexpectedChanges',
  'unexpectedInconclusive',
  'failClosedViolations',
  'evidenceReferenceFailures',
  'executionFailures',
])

function stringArray(value, context) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${context} must be an array of strings`)
  }
  return value
}

export function validateQualityPolicy(policy) {
  if (policy?.schemaVersion !== '1') throw new Error('Quality policy schemaVersion must be "1"')
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(policy.id || '')) throw new Error('Quality policy id is invalid')
  const requirements = policy.requirements
  if (!requirements || typeof requirements !== 'object') throw new Error('Quality policy requirements are missing')
  stringArray(requirements.corpusIds, 'Quality policy requirements.corpusIds')
  if (!/^[a-f0-9]{64}$/.test(requirements.corpusSha256 || '')) {
    throw new Error('Quality policy requirements.corpusSha256 must be a SHA-256 digest')
  }
  if (!/^[a-f0-9]{64}$/.test(requirements.fixtureSha256 || '')) {
    throw new Error('Quality policy requirements.fixtureSha256 must be a SHA-256 digest')
  }
  const implementationPaths = stringArray(
    requirements.implementationPaths,
    'Quality policy requirements.implementationPaths',
  )
  if (
    implementationPaths.length === 0 ||
    implementationPaths.some((entry) => entry.startsWith('/') || entry.split('/').includes('..'))
  ) {
    throw new Error('Quality policy requirements.implementationPaths must contain safe repository-relative paths')
  }
  stringArray(requirements.allowedRoles, 'Quality policy requirements.allowedRoles')
  const statuses = stringArray(requirements.requiredStatuses, 'Quality policy requirements.requiredStatuses')
  if (statuses.some((status) => !['changed', 'unchanged', 'inconclusive'].includes(status))) {
    throw new Error('Quality policy requiredStatuses contains an invalid status')
  }
  const categories = stringArray(
    requirements.requiredChangedCategories,
    'Quality policy requirements.requiredChangedCategories',
  )
  if (categories.some((category) => !comparisonCategories.includes(category))) {
    throw new Error('Quality policy requiredChangedCategories contains an invalid category')
  }
  if (typeof requirements.allowObservationOnly !== 'boolean') {
    throw new Error('Quality policy requirements.allowObservationOnly must be boolean')
  }
  if (!requirements.maximumTotals || typeof requirements.maximumTotals !== 'object') {
    throw new Error('Quality policy requirements.maximumTotals is missing')
  }
  for (const [metric, maximum] of Object.entries(requirements.maximumTotals)) {
    if (!totalMetrics.has(metric)) throw new Error(`Quality policy maximumTotals contains unknown metric ${metric}`)
    if (!Number.isInteger(maximum) || maximum < 0) {
      throw new Error(`Quality policy maximumTotals.${metric} must be a non-negative integer`)
    }
  }
  if (policy.runtime?.mode !== 'observe-only') {
    throw new Error('Quality policy runtime.mode must remain observe-only until a runtime threshold is justified')
  }
}

export function evaluateQualityPolicy({ policy, corpus, corpusSha256, fixtureSha256, summary, policySha256 }) {
  validateQualityPolicy(policy)
  const requirements = policy.requirements
  const issues = []

  if (!requirements.corpusIds.includes(corpus.id)) {
    issues.push({ code: 'corpus-not-allowed', expected: requirements.corpusIds, actual: corpus.id })
  }
  if (requirements.corpusSha256 !== corpusSha256) {
    issues.push({ code: 'corpus-hash-mismatch', expected: requirements.corpusSha256, actual: corpusSha256 })
  }
  if (requirements.fixtureSha256 !== fixtureSha256) {
    issues.push({ code: 'fixture-hash-mismatch', expected: requirements.fixtureSha256, actual: fixtureSha256 })
  }

  const roles = new Set(corpus.scenarios.map((scenario) => scenario.role))
  for (const role of roles) {
    if (!requirements.allowedRoles.includes(role)) issues.push({ code: 'role-not-allowed', role })
  }

  const statuses = new Set(corpus.scenarios.map((scenario) => scenario.expectation.status))
  for (const status of requirements.requiredStatuses) {
    if (!statuses.has(status)) issues.push({ code: 'required-status-missing', status })
  }
  if (!requirements.allowObservationOnly && statuses.has('observe')) {
    issues.push({ code: 'observation-only-not-allowed' })
  }

  const changedCategories = new Set(
    corpus.scenarios.flatMap((scenario) => scenario.expectation.changedCategories || []),
  )
  for (const category of requirements.requiredChangedCategories) {
    if (!changedCategories.has(category)) issues.push({ code: 'required-changed-category-missing', category })
  }

  for (const [metric, maximum] of Object.entries(requirements.maximumTotals)) {
    const actual = summary.totals[metric]
    if (!Number.isInteger(actual)) {
      issues.push({ code: 'metric-unavailable', metric })
    } else if (actual > maximum) {
      issues.push({ code: 'metric-maximum-exceeded', metric, maximum, actual })
    }
  }

  return {
    id: policy.id,
    schemaVersion: policy.schemaVersion,
    sha256: policySha256,
    frozenAt: policy.frozenAt,
    frozenAgainstCommit: policy.frozenAgainstCommit,
    status: issues.length === 0 ? 'passed' : 'failed',
    issues,
    requirements,
    runtime: policy.runtime,
    claimBoundary: policy.claimBoundary,
  }
}
