import type { ExtractionIssue } from './types.js'
import { redactUrlsInText } from './url-privacy.js'

export function isPageHealthExtractionIssue(issue: ExtractionIssue): boolean {
  return /:(?:capture-)?health:/.test(issue.stage)
}

function publicExtractionIssueReason(reason: string): string {
  const cleaned = reason
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
  return redactUrlsInText(cleaned).replace(/\s+/g, ' ').trim().slice(0, 180) || 'unknown reason'
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
