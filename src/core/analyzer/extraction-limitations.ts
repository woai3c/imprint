import type { ExtractionIssue } from './types.js'

export function isPageHealthExtractionIssue(issue: ExtractionIssue): boolean {
  return /:(?:capture-)?health:/.test(issue.stage)
}

function publicExtractionIssueReason(reason: string): string {
  return (
    reason
      .replace(/https?:\/\/[^\s]+/gi, (value) => {
        try {
          const url = new URL(value)
          return `${url.origin}${url.pathname}`
        } catch {
          return '[url]'
        }
      })
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'unknown reason'
  )
}

export function extractionIssueLimitation(issue: ExtractionIssue): string {
  return `extraction-issue:${encodeURIComponent(issue.stage.slice(0, 120))}:${encodeURIComponent(publicExtractionIssueReason(issue.reason))}`
}

export function appendExtractionIssueLimitation(
  limitations: string[],
  issue: ExtractionIssue,
  options: { includePageHealth?: boolean } = {},
): void {
  if (!options.includePageHealth && isPageHealthExtractionIssue(issue)) return
  const limitation = extractionIssueLimitation(issue)
  if (!limitations.includes(limitation)) limitations.push(limitation)
}

export function appendFailedCaptureHealthLimitations(
  limitations: string[],
  captureIssues: readonly ExtractionIssue[],
): void {
  captureIssues
    .filter(isPageHealthExtractionIssue)
    .slice(0, 2)
    .forEach((issue) => appendExtractionIssueLimitation(limitations, issue, { includePageHealth: true }))
}
