import type { DesignEvidence, EvidenceCoverage } from './types.js'

export function screenshotAssetIssueCount(limitations: readonly string[]): number {
  return [...new Set(limitations)].filter((limitation) => {
    const match = /^extraction-issue:([^:]+):(.+)$/.exec(limitation)
    if (!match) return false
    try {
      const stage = decodeURIComponent(match[1])
      const reason = decodeURIComponent(match[2])
      return /:screenshot:overview$/.test(stage) && /^screenshot-dimensions-(?:mismatch|unreadable)/.test(reason)
    } catch {
      return false
    }
  }).length
}

export function resolveScreenshotAssetCoverage(
  evidence: Pick<DesignEvidence, 'pages' | 'coverage' | 'limitations'>,
): NonNullable<EvidenceCoverage['assetCoverage']> {
  if (evidence.coverage.assetCoverage) return evidence.coverage.assetCoverage
  const issueCount = screenshotAssetIssueCount([...evidence.coverage.limitations, ...evidence.limitations])
  return {
    expected: evidence.pages.length,
    valid: Math.max(0, evidence.pages.length - Math.min(evidence.pages.length, issueCount)),
    status: issueCount === 0 ? 'complete' : 'partial',
    issueCount,
  }
}
