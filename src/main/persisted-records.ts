import { isPageHealthEvidenceEligible } from '../core/analyzer/page-health.js'
import type { ReferenceCaptureInput } from '../core/analyzer/reference-compare.js'
import type { AnalysisCompletion, AnalysisTiming, CaptureManifest, DesignToken } from '../core/analyzer/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import { type DarkModeExportData, restoreDarkModeExportData } from '../core/export/index.js'
import type { PageScreenshotData, ThemeSummaryRecord } from '../shared/ipc-contract.js'
import { isRecord } from '../shared/type-guards.js'

export function compactTokenSnapshot(serialized: string | null): string | null {
  if (!serialized) return serialized
  try {
    const parsed = JSON.parse(serialized) as unknown
    if (!isRecord(parsed) || !('usageCount' in parsed)) return serialized
    const { usageCount: _usageCount, ...tokens } = parsed
    return JSON.stringify(tokens)
  } catch {
    return serialized
  }
}

export function toThemeSummary(record: ThemeSummaryRecord): ThemeSummaryRecord {
  return {
    ...record,
    tokens_json: compactTokenSnapshot(record.tokens_json) || '{}',
    dark_tokens_json: compactTokenSnapshot(record.dark_tokens_json),
  }
}

export function readFirstScreenshotPath(serialized: unknown): string | null {
  if (typeof serialized !== 'string') return null

  try {
    const screenshots = JSON.parse(serialized) as unknown
    if (!Array.isArray(screenshots) || screenshots.length === 0) return null
    const first = screenshots[0]
    return isRecord(first) && typeof first.path === 'string' ? first.path : null
  } catch {
    return null
  }
}

export function readDesignEvidence(serialized: unknown): DesignEvidence | null {
  if (typeof serialized !== 'string') return null
  try {
    const evidence = JSON.parse(serialized) as DesignEvidence
    for (const page of evidence.pages || []) {
      if (!page.health) continue
      page.health.evidenceEligible = isPageHealthEvidenceEligible(page.health)
    }
    return evidence
  } catch {
    return null
  }
}

export function readAnalysisTiming(serialized: unknown): AnalysisTiming | undefined {
  if (typeof serialized !== 'string') return undefined
  try {
    const stored = JSON.parse(serialized) as unknown
    if (!isRecord(stored)) return undefined
    const readNumber = (key: string): number | undefined => {
      const value = stored[key]
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
    }
    const optional = {
      userWaitMs: readNumber('userWaitMs'),
      browserMs: readNumber('browserMs'),
      preparationMs: readNumber('preparationMs'),
      extractionMs: readNumber('extractionMs'),
      healthGateMs: readNumber('healthGateMs'),
      screenshotCaptureMs: readNumber('screenshotCaptureMs'),
    }
    return {
      ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
      validationMs: readNumber('validationMs') ?? 0,
      totalMs: readNumber('totalMs') ?? 0,
      imageCount: readNumber('imageCount') ?? 0,
      ...(Array.isArray(stored.budgetExceeded)
        ? { budgetExceeded: stored.budgetExceeded.filter((value): value is string => typeof value === 'string') }
        : {}),
    }
  } catch {
    return undefined
  }
}

function hostnameFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '') || value
  } catch {
    return value
  }
}

export function toAnalysisSummary(
  { page_screenshots_json: screenshots, design_evidence_json: designEvidenceJson, ...record }: Record<string, unknown>,
  screenshotPath?: string | null,
) {
  const evidence = readDesignEvidence(designEvidenceJson)
  const siteNameCandidates = [evidence?.source?.siteName, evidence?.pages?.find((page) => page.siteName)?.siteName]
  const siteName =
    siteNameCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim() ||
    hostnameFromUrl(String(record.url || ''))
  return {
    ...record,
    site_name: siteName,
    screenshot_path: screenshotPath === undefined ? readFirstScreenshotPath(screenshots) : screenshotPath,
  }
}

export function readPageScreenshots(serialized: unknown): PageScreenshotData[] {
  return JSON.parse((serialized as string) || '[]') as PageScreenshotData[]
}

export function readCaptureManifest(serialized: unknown): CaptureManifest | null {
  if (typeof serialized !== 'string') return null
  try {
    const manifest = JSON.parse(serialized) as unknown
    if (
      !isRecord(manifest) ||
      manifest.schemaVersion !== '1' ||
      !isRecord(manifest.tool) ||
      !isRecord(manifest.request) ||
      !isRecord(manifest.environment) ||
      !Array.isArray(manifest.environment.viewports) ||
      !isRecord(manifest.stabilization) ||
      !isRecord(manifest.stabilization.animationFreeze) ||
      !isRecord(manifest.capture)
    ) {
      return null
    }
    return manifest as unknown as CaptureManifest
  } catch {
    return null
  }
}

export function readAnalysisCompletion(serialized: unknown): AnalysisCompletion | undefined {
  if (typeof serialized !== 'string') return undefined
  try {
    const completion = JSON.parse(serialized) as unknown
    if (!isRecord(completion) || !['complete', 'time-limit', 'user-finished'].includes(String(completion.reason))) {
      return undefined
    }
    const activeLimitValid =
      typeof completion.activeLimitMs === 'number' &&
      Number.isFinite(completion.activeLimitMs) &&
      completion.activeLimitMs > 0
    if (completion.reason === 'time-limit' && !activeLimitValid) return undefined
    if (completion.activeLimitMs !== undefined && !activeLimitValid) return undefined
    return completion as unknown as AnalysisCompletion
  } catch {
    return undefined
  }
}

export function readDarkModeExportData(
  serialized: unknown,
  baseTokens: DesignToken,
  method: unknown,
  selector?: unknown,
): DarkModeExportData | undefined {
  if (typeof serialized !== 'string') return undefined
  try {
    return restoreDarkModeExportData(JSON.parse(serialized) as unknown, baseTokens, method, selector)
  } catch {
    return undefined
  }
}

export function referenceCaptureFromRecord(record: Record<string, unknown>): ReferenceCaptureInput | null {
  try {
    const tokens = JSON.parse((record.tokens_json as string) || '{}') as DesignToken
    if (
      !isRecord(tokens) ||
      !isRecord(tokens.colors) ||
      !isRecord(tokens.typography) ||
      !Array.isArray(tokens.typography.fontFamilies) ||
      !Array.isArray(tokens.typography.fontStacks) ||
      !Array.isArray(tokens.typography.fontSizes) ||
      !Array.isArray(tokens.typography.fontWeights) ||
      !Array.isArray(tokens.typography.lineHeights) ||
      !Array.isArray(tokens.typography.letterSpacings) ||
      !Array.isArray(tokens.spacing) ||
      !Array.isArray(tokens.radii)
    ) {
      return null
    }
    return {
      analysisId: String(record.id),
      url: String(record.final_url || record.url || ''),
      createdAt: typeof record.created_at === 'string' ? record.created_at : undefined,
      tokens,
      evidence: readDesignEvidence(record.design_evidence_json),
      manifest: readCaptureManifest(record.capture_manifest_json),
    }
  } catch {
    return null
  }
}
