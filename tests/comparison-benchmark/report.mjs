import { comparisonCategories } from './evaluate.mjs'

function displayed(values) {
  return values.length > 0 ? values.join(', ') : 'none'
}

function tableRow(values) {
  return `| ${values.join(' | ')} |`
}

export function renderBenchmarkMarkdown(report) {
  const lines = [
    '# Imprint Comparison Benchmark',
    '',
    '> This report evaluates the declared corpus against frozen ground truth. It is not a universal live-site accuracy claim.',
    '',
    '## Run',
    '',
    `- Commit: \`${report.run.commit}\`${report.run.dirty ? ' (dirty working tree)' : ''}`,
    `- Tool: \`${report.run.toolVersion}\``,
    `- Corpus: \`${report.corpus.id}\` (SHA-256 \`${report.corpus.sha256}\`)`,
    `- Browser: ${report.run.browser || 'unavailable'}`,
    `- Platform: \`${report.run.platform}\` / \`${report.run.architecture}\``,
    `- Started: ${report.run.startedAt}`,
    `- Completed: ${report.run.completedAt}`,
    '',
    '## Summary',
    '',
    tableRow([
      'Capture pairs',
      'Evaluated',
      'Observed only',
      'Passed',
      'Failed',
      'Unexpected changes',
      'Missed changes',
    ]),
    tableRow(['---:', '---:', '---:', '---:', '---:', '---:', '---:']),
    tableRow([
      report.summary.totals.capturePairs,
      report.summary.totals.evaluatedPairs,
      report.summary.totals.observationOnlyPairs,
      report.summary.totals.passedPairs,
      report.summary.totals.failedPairs,
      report.summary.totals.unexpectedChanges,
      report.summary.totals.missedChanges,
    ]),
    '',
    `- Correct fail-closed results: ${report.summary.totals.correctFailClosed}`,
    `- Fail-closed violations: ${report.summary.totals.failClosedViolations}`,
    `- Execution failures: ${report.summary.totals.executionFailures}`,
    `- Evidence reference failures: ${report.summary.totals.evidenceReferenceFailures}`,
    `- Unexpected inconclusive results: ${report.summary.totals.unexpectedInconclusive}`,
    `- Expected changes that became inconclusive: ${report.summary.totals.expectedChangeInconclusive}`,
    '',
    '## Category results',
    '',
    tableRow([
      'Category',
      'Expected changed',
      'Detected',
      'Missed',
      'Unexpected changed',
      'Expected unchanged',
      'Stable',
    ]),
    tableRow(['---', '---:', '---:', '---:', '---:', '---:', '---:']),
  ]

  for (const category of comparisonCategories) {
    const result = report.summary.categories[category]
    lines.push(
      tableRow([
        category,
        result.expectedChanged,
        result.detectedChanged,
        result.missed,
        result.unexpectedChanged,
        result.expectedUnchanged,
        result.stable,
      ]),
    )
  }

  lines.push('', '## Scenarios', '')
  for (const result of report.scenarios) {
    lines.push(
      `### ${result.evaluation.outcome.toUpperCase()} — ${result.scenarioId} / pair ${result.repetition}`,
      '',
      `- Role: \`${result.role}\``,
      `- Expected: \`${result.evaluation.expected.status}\`; changed categories: ${displayed(result.evaluation.expected.changedCategories)}`,
      `- Actual: \`${result.evaluation.actual.status}\`; changed categories: ${displayed(result.evaluation.actual.changedCategories)}`,
      `- Comparability reasons: ${displayed(result.evaluation.actual.comparabilityReasons)}`,
      `- Duration: ${result.durationMs} ms`,
      `- Route hash: \`${result.routeHash}\``,
      '',
    )
    if (result.evaluation.issues.length > 0) {
      lines.push('Issues:', '')
      for (const issue of result.evaluation.issues) lines.push(`- \`${issue.code}\`: ${JSON.stringify(issue)}`)
      lines.push('')
    }
  }

  lines.push(
    '## Interpretation limits',
    '',
    '- Controlled fixtures measure declared behavior and fail-closed rules; they do not establish arbitrary live-site accuracy.',
    '- Public or mutable live sites cannot provide false-positive ground truth unless their content and capture conditions are controlled.',
    '- Current regression holdouts prevent future regressions but are not independent prospective holdouts.',
    '- A passing report does not establish user comprehension or product value.',
    '',
  )
  return `${lines.join('\n')}\n`
}
