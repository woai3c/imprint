export const comparisonCategories = [
  'colors',
  'typography',
  'spacing',
  'radii',
  'layout',
  'interaction-states',
  'responsive',
]

function sortedUnique(values) {
  return [...new Set(values)].sort()
}

function sameValues(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index])
}

function evidenceIds(evidence) {
  if (!evidence) return new Set()
  const collections = [
    evidence.pages,
    evidence.sections,
    evidence.components,
    evidence.layoutNodes,
    evidence.pseudoElements,
    evidence.interactionObservations,
    evidence.responsiveObservations,
    evidence.mediaLayers,
  ]
  return new Set(collections.flatMap((collection) => (collection || []).map((item) => item.id)))
}

function evidenceIssues(comparison, referenceEvidence, targetEvidence) {
  const issues = []
  const referenceIds = evidenceIds(referenceEvidence)
  const targetIds = evidenceIds(targetEvidence)

  for (const change of comparison.categories.flatMap((category) => category.changes)) {
    const needsReference = change.kind !== 'added'
    const needsTarget = change.kind !== 'removed'
    if (needsReference && change.referenceEvidenceIds.length === 0) {
      issues.push({ code: 'missing-reference-evidence', category: change.category, changeId: change.id })
    }
    if (needsTarget && change.targetEvidenceIds.length === 0) {
      issues.push({ code: 'missing-target-evidence', category: change.category, changeId: change.id })
    }
    for (const id of change.referenceEvidenceIds) {
      if (!referenceIds.has(id)) {
        issues.push({
          code: 'unknown-reference-evidence',
          category: change.category,
          changeId: change.id,
          evidenceId: id,
        })
      }
    }
    for (const id of change.targetEvidenceIds) {
      if (!targetIds.has(id)) {
        issues.push({ code: 'unknown-target-evidence', category: change.category, changeId: change.id, evidenceId: id })
      }
    }
  }

  return issues
}

export function evaluateComparison({ scenario, comparison, referenceEvidence, targetEvidence }) {
  const expectation = scenario.expectation
  const observationOnly = expectation.status === 'observe'
  const issues = []
  const expectedChanged = sortedUnique(expectation.changedCategories || [])
  const actualChanged = sortedUnique(
    comparison.categories.filter((category) => category.status === 'changed').map((category) => category.category),
  )
  const actualStatuses = Object.fromEntries(
    comparison.categories.map((category) => [
      category.category,
      { status: category.status, coverage: category.coverage, changes: category.changes.length },
    ]),
  )

  if (!observationOnly && comparison.status !== expectation.status) {
    const code =
      expectation.status === 'inconclusive'
        ? 'fail-closed-violation'
        : comparison.status === 'inconclusive'
          ? 'unexpected-inconclusive'
          : 'status-mismatch'
    issues.push({ code, expected: expectation.status, actual: comparison.status })
  }

  if (!observationOnly && expectation.status !== 'inconclusive') {
    for (const category of expectedChanged) {
      const actual = actualStatuses[category]?.status
      if (actual === 'changed') continue
      issues.push({
        code: actual === 'inconclusive' ? 'expected-change-inconclusive' : 'missed-change',
        category,
        expected: 'changed',
        actual: actual || 'missing',
      })
    }
    for (const category of actualChanged) {
      if (expectedChanged.includes(category)) continue
      issues.push({ code: 'unexpected-change', category, expected: 'unchanged', actual: 'changed' })
    }
  }

  if (!observationOnly && expectation.categoryStatuses) {
    for (const [category, expected] of Object.entries(expectation.categoryStatuses)) {
      const actual = actualStatuses[category]
      if (
        !actual ||
        actual.status !== expected.status ||
        (expected.coverage && actual.coverage !== expected.coverage)
      ) {
        issues.push({
          code: 'category-status-mismatch',
          category,
          expected,
          actual: actual || null,
        })
      }
    }
  }

  if (!observationOnly && expectation.comparabilityReasons) {
    const expectedReasons = sortedUnique(expectation.comparabilityReasons)
    const actualReasons = sortedUnique(comparison.comparability.reasons)
    if (!sameValues(expectedReasons, actualReasons)) {
      issues.push({ code: 'comparability-reasons-mismatch', expected: expectedReasons, actual: actualReasons })
    }
  }

  const referenceIssues = evidenceIssues(comparison, referenceEvidence, targetEvidence)
  issues.push(...referenceIssues)

  const missedChanges = issues.filter(({ code }) => code === 'missed-change').length
  const expectedChangeInconclusive = issues.filter(({ code }) => code === 'expected-change-inconclusive').length
  const unexpectedChanges = issues.filter(({ code }) => code === 'unexpected-change').length
  const failClosedViolations = issues.filter(({ code }) => code === 'fail-closed-violation').length
  const passed = observationOnly ? (referenceIssues.length > 0 ? false : null) : issues.length === 0

  return {
    passed,
    outcome: passed === null ? 'observed' : passed ? 'passed' : 'failed',
    issues,
    expected: {
      status: expectation.status,
      changedCategories: expectedChanged,
      ...(expectation.comparabilityReasons
        ? { comparabilityReasons: sortedUnique(expectation.comparabilityReasons) }
        : {}),
    },
    actual: {
      status: comparison.status,
      changedCategories: actualChanged,
      comparabilityReasons: sortedUnique(comparison.comparability.reasons),
      categories: actualStatuses,
    },
    counts: {
      expectedChangedCategories: expectedChanged.length,
      detectedChangedCategories: expectedChanged.filter((category) => actualStatuses[category]?.status === 'changed')
        .length,
      missedChanges,
      expectedChangeInconclusive,
      unexpectedChanges,
      unexpectedInconclusive:
        !observationOnly && expectation.status !== 'inconclusive' && comparison.status === 'inconclusive' ? 1 : 0,
      correctFailClosed: expectation.status === 'inconclusive' && comparison.status === 'inconclusive' ? 1 : 0,
      failClosedViolations,
      evidenceReferenceFailures: referenceIssues.length,
    },
  }
}

export function evaluateExecutionFailure(scenario, error) {
  return {
    passed: false,
    outcome: 'failed',
    issues: [{ code: 'execution-error', errorName: error instanceof Error ? error.name : 'UnknownError' }],
    expected: {
      status: scenario.expectation.status,
      changedCategories: sortedUnique(scenario.expectation.changedCategories || []),
    },
    actual: {
      status: 'execution-error',
      changedCategories: [],
      comparabilityReasons: [],
      categories: {},
    },
    counts: {
      expectedChangedCategories: scenario.expectation.changedCategories?.length || 0,
      detectedChangedCategories: 0,
      missedChanges: 0,
      expectedChangeInconclusive: 0,
      unexpectedChanges: 0,
      unexpectedInconclusive: 0,
      correctFailClosed: 0,
      failClosedViolations: 0,
      evidenceReferenceFailures: 0,
      executionFailures: 1,
    },
  }
}

export function aggregateEvaluations(results) {
  const totals = {
    capturePairs: results.length,
    evaluatedPairs: results.filter((result) => result.evaluation.passed !== null).length,
    observationOnlyPairs: results.filter((result) => result.evaluation.passed === null).length,
    passedPairs: results.filter((result) => result.evaluation.passed === true).length,
    failedPairs: results.filter((result) => result.evaluation.passed === false).length,
    expectedChangedCategories: 0,
    detectedChangedCategories: 0,
    missedChanges: 0,
    expectedChangeInconclusive: 0,
    unexpectedChanges: 0,
    unexpectedInconclusive: 0,
    correctFailClosed: 0,
    failClosedViolations: 0,
    evidenceReferenceFailures: 0,
    executionFailures: 0,
  }
  const categories = Object.fromEntries(
    comparisonCategories.map((category) => [
      category,
      {
        expectedChanged: 0,
        detectedChanged: 0,
        missed: 0,
        unexpectedChanged: 0,
        inconclusiveWhenChangeExpected: 0,
        expectedUnchanged: 0,
        stable: 0,
      },
    ]),
  )

  for (const result of results) {
    for (const key of Object.keys(totals)) {
      if (key in result.evaluation.counts) totals[key] += result.evaluation.counts[key]
    }
    if (
      ['inconclusive', 'observe'].includes(result.evaluation.expected.status) ||
      result.evaluation.actual.status === 'execution-error'
    ) {
      continue
    }
    const expectedChanged = new Set(result.evaluation.expected.changedCategories)
    for (const category of comparisonCategories) {
      const status = result.evaluation.actual.categories[category]?.status
      if (expectedChanged.has(category)) {
        categories[category].expectedChanged += 1
        if (status === 'changed') categories[category].detectedChanged += 1
        else if (status === 'inconclusive') categories[category].inconclusiveWhenChangeExpected += 1
        else categories[category].missed += 1
      } else {
        categories[category].expectedUnchanged += 1
        if (status === 'changed') categories[category].unexpectedChanged += 1
        else if (status === 'unchanged' || status === 'not-supported') categories[category].stable += 1
      }
    }
  }

  return { totals, categories }
}
