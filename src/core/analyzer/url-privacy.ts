import type { DesignEvidence } from '../design-evidence/types.js'
import type { AuthWallDetection } from './auth-wall.js'
import type { DesignToken, ExtractionIssue, PageCoverage, PageScreenshot } from './types.js'

export function sanitizeUrlForPersistence(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return value.split(/[?#]/, 1)[0].replace(/(https?:\/\/)[^/@\s]+@/i, '$1')
  }
}

export function redactUrlsInText(value: string): string {
  return value.replace(/[a-z][a-z\d+.-]*:\/\/[^\s<>"'`]+/gi, (matched) => {
    const trailing = /[),.;\]}]+$/.exec(matched)?.[0] || ''
    const url = trailing ? matched.slice(0, -trailing.length) : matched
    return `${sanitizeUrlForPersistence(url)}${trailing}`
  })
}

export function sanitizeDesignTokensForPersistence(tokens: DesignToken): DesignToken {
  const sanitizeCaptureId = (captureId: string) => {
    const separator = captureId.lastIndexOf('|')
    if (separator < 0) return sanitizeUrlForPersistence(captureId)
    return `${sanitizeUrlForPersistence(captureId.slice(0, separator))}${captureId.slice(separator)}`
  }
  const colorRoles = tokens.colorRoles
    ? {
        ...tokens.colorRoles,
        ...(tokens.colorRoles.primaryAction
          ? {
              primaryAction: {
                ...tokens.colorRoles.primaryAction,
                provenance: tokens.colorRoles.primaryAction.provenance.map((item) => ({
                  ...item,
                  captureId: sanitizeCaptureId(item.captureId),
                })),
              },
            }
          : {}),
        ...(tokens.colorRoles.semanticPairs
          ? {
              semanticPairs: Object.fromEntries(
                Object.entries(tokens.colorRoles.semanticPairs).map(([key, pair]) => [
                  key,
                  pair
                    ? {
                        ...pair,
                        provenance: pair.provenance.map((item) => ({
                          ...item,
                          captureId: sanitizeCaptureId(item.captureId),
                        })),
                      }
                    : pair,
                ]),
              ) as NonNullable<DesignToken['colorRoles']>['semanticPairs'],
            }
          : {}),
      }
    : undefined
  if (!tokens.evidence && !colorRoles) return tokens
  return {
    ...tokens,
    ...(tokens.evidence
      ? {
          evidence: Object.fromEntries(
            Object.entries(tokens.evidence).map(([key, evidence]) => [
              key,
              { ...evidence, pages: evidence.pages.map(sanitizeUrlForPersistence) },
            ]),
          ),
        }
      : {}),
    ...(colorRoles ? { colorRoles } : {}),
  }
}

export function sanitizeDesignEvidenceForPersistence(evidence: DesignEvidence): DesignEvidence {
  const tokens = sanitizeDesignTokensForPersistence(evidence.tokens)
  return {
    ...evidence,
    source: {
      ...evidence.source,
      requestedUrl: sanitizeUrlForPersistence(evidence.source.requestedUrl),
      finalUrl: sanitizeUrlForPersistence(evidence.source.finalUrl),
    },
    pages: evidence.pages.map((page) => ({
      ...page,
      url: sanitizeUrlForPersistence(page.url),
      ...(page.health
        ? {
            health: {
              ...page.health,
              issues: page.health.issues.map((issue) => ({
                ...issue,
                ...(issue.detail ? { detail: redactUrlsInText(issue.detail) } : {}),
              })),
            },
          }
        : {}),
    })),
    tokens,
  }
}

export function sanitizePageScreenshotsForPersistence(screenshots: PageScreenshot[]): PageScreenshot[] {
  return screenshots.map((screenshot) => ({ ...screenshot, url: sanitizeUrlForPersistence(screenshot.url) }))
}

export function sanitizePageCoverageForPersistence(coverage: PageCoverage): PageCoverage {
  return {
    ...coverage,
    pages: coverage.pages.map((page) => ({ ...page, url: sanitizeUrlForPersistence(page.url) })),
  }
}

export function sanitizeExtractionIssuesForDisplay(issues: ExtractionIssue[]): ExtractionIssue[] {
  return issues.map((issue) => ({ ...issue, reason: redactUrlsInText(issue.reason) }))
}

export function sanitizeAuthWallDetectionForDisplay(detection: AuthWallDetection): AuthWallDetection {
  return { ...detection, finalUrl: sanitizeUrlForPersistence(detection.finalUrl) }
}
