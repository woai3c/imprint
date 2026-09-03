import { isPageHealthEvidenceEligible } from '../core/analyzer/page-health.js'
import type { ReferenceCaptureInput } from '../core/analyzer/reference-compare.js'
import type { AnalysisCompletion, AnalysisTiming, CaptureManifest, DesignToken } from '../core/analyzer/types.js'
import { isCurrentDesignProfile } from '../core/design-context/types.js'
import type { DesignProfile, ValidationReport } from '../core/design-context/types.js'
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRecordArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every(isRecord)
}

function isPageScreenshotData(value: unknown): value is PageScreenshotData {
  if (!isRecord(value)) return false
  return (
    (value.routeId === undefined || typeof value.routeId === 'string') &&
    typeof value.url === 'string' &&
    typeof value.path === 'string' &&
    typeof value.viewport === 'string' &&
    (value.thumbnailPath === undefined || typeof value.thumbnailPath === 'string') &&
    (value.width === undefined || (typeof value.width === 'number' && Number.isFinite(value.width))) &&
    (value.height === undefined || (typeof value.height === 'number' && Number.isFinite(value.height))) &&
    (value.valid === undefined || typeof value.valid === 'boolean')
  )
}

function isDesignToken(value: unknown): value is DesignToken {
  if (!isRecord(value) || !isRecord(value.colors) || !isRecord(value.typography)) return false
  return (
    isStringArray(value.typography.fontFamilies) &&
    isStringArray(value.typography.fontStacks) &&
    isStringArray(value.typography.fontSizes) &&
    isStringArray(value.typography.fontWeights) &&
    isStringArray(value.typography.lineHeights) &&
    isStringArray(value.typography.letterSpacings) &&
    isStringArray(value.spacing) &&
    isStringArray(value.radii) &&
    isStringArray(value.shadows) &&
    isStringArray(value.borders) &&
    isStringArray(value.zIndices) &&
    isStringArray(value.transitions)
  )
}

function readJson(serialized: unknown): unknown {
  if (typeof serialized !== 'string') return undefined
  try {
    return JSON.parse(serialized) as unknown
  } catch {
    return undefined
  }
}

export function readDesignTokens(serialized: unknown): DesignToken | null {
  const parsed = readJson(serialized)
  return isDesignToken(parsed) ? parsed : null
}

export function readStringList(serialized: unknown): string[] {
  const parsed = readJson(serialized)
  return isStringArray(parsed) ? parsed : []
}

export function readDesignProfile(serialized: unknown): DesignProfile | null {
  const parsed = readJson(serialized)
  return isCurrentDesignProfile(parsed) ? parsed : null
}

export function readValidationReport(serialized: unknown): ValidationReport | null {
  const parsed = readJson(serialized)
  return isRecord(parsed) ? (parsed as unknown as ValidationReport) : null
}

function isEvidenceImage(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    ['overview', 'viewport-crop', 'region-crop'].includes(String(value.kind)) &&
    typeof value.path === 'string' &&
    typeof value.width === 'number' &&
    Number.isFinite(value.width) &&
    typeof value.height === 'number' &&
    Number.isFinite(value.height)
  )
}

function isEvidencePage(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (
    typeof value.id !== 'string' ||
    typeof value.url !== 'string' ||
    typeof value.viewport !== 'string' ||
    !Array.isArray(value.images) ||
    !value.images.every(isEvidenceImage)
  ) {
    return false
  }
  if (value.health === undefined) return true
  return (
    isRecord(value.health) &&
    ['healthy', 'degraded', 'unusable'].includes(String(value.health.status)) &&
    isRecordArray(value.health.issues) &&
    value.health.issues.every((issue) => typeof issue.code === 'string')
  )
}

function isDesignEvidence(value: unknown): value is DesignEvidence {
  if (
    !isRecord(value) ||
    value.schemaVersion !== '1' ||
    typeof value.analysisId !== 'string' ||
    !isRecord(value.source) ||
    typeof value.source.requestedUrl !== 'string' ||
    typeof value.source.finalUrl !== 'string' ||
    !['anonymous', 'managed'].includes(String(value.source.accessMode)) ||
    !Array.isArray(value.pages) ||
    !value.pages.every(isEvidencePage) ||
    !isDesignToken(value.tokens) ||
    !isStringArray(value.featureTags) ||
    !isRecord(value.topology) ||
    value.topology.schemaVersion !== '1' ||
    !isRecordArray(value.topology.pages) ||
    !isRecordArray(value.topology.globalLayers) ||
    !isStringArray(value.topology.crossPagePatternIds) ||
    !isRecordArray(value.sections) ||
    !isRecordArray(value.components) ||
    !isRecordArray(value.layoutNodes) ||
    !isRecord(value.interactionStyles) ||
    !isRecordArray(value.interactionStyles.hover) ||
    !isRecordArray(value.interactionStyles.focus) ||
    !isRecordArray(value.interactionStyles.active) ||
    !isRecordArray(value.interactionObservations) ||
    !isRecordArray(value.breakpoints) ||
    !isRecordArray(value.responsiveObservations) ||
    !isRecordArray(value.motion) ||
    !isRecordArray(value.mediaLayers) ||
    !isRecord(value.coverage) ||
    !isStringArray(value.limitations)
  ) {
    return false
  }
  if (value.pseudoElements !== undefined && !isRecordArray(value.pseudoElements)) return false
  if (value.deterministicClaims !== undefined && !isRecordArray(value.deterministicClaims)) return false
  return true
}

export function readDesignEvidence(serialized: unknown): DesignEvidence | null {
  if (typeof serialized !== 'string') return null
  try {
    const parsed = JSON.parse(serialized) as unknown
    if (!isDesignEvidence(parsed)) return null
    for (const page of parsed.pages) {
      if (!page.health) continue
      page.health.evidenceEligible = isPageHealthEvidenceEligible(page.health)
    }
    return parsed
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

export function analysisSiteName(url: string, evidence: DesignEvidence | null): string {
  const candidates = [evidence?.source?.siteName, evidence?.pages?.find((page) => page.siteName)?.siteName]
  return (
    candidates.find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim() || hostnameFromUrl(url)
  )
}

export function analysisPreviewPath(
  pageScreenshots: PageScreenshotData[],
  evidence: DesignEvidence | null,
): string | null {
  const screenshot = pageScreenshots[0]
  if (!screenshot) return null
  if (!evidence) return screenshot.path
  const evidencePages = Array.isArray(evidence.pages) ? evidence.pages : []
  const page =
    evidencePages.find(
      (candidate) =>
        screenshot.routeId && candidate.routeId === screenshot.routeId && candidate.viewport === screenshot.viewport,
    ) ||
    evidencePages.find((candidate) => candidate.url === screenshot.url && candidate.viewport === screenshot.viewport) ||
    evidencePages.find((candidate) => candidate.url === screenshot.url) ||
    evidencePages[0]
  const images = Array.isArray(page?.images) ? page.images : []
  return (
    images.find((image) => image.kind === 'viewport-crop' && typeof image.path === 'string')?.path || screenshot.path
  )
}

export function toAnalysisSummary(
  { page_screenshots_json: screenshots, design_evidence_json: designEvidenceJson, ...record }: Record<string, unknown>,
  screenshotPath?: string | null,
) {
  const storedSiteName = typeof record.site_name === 'string' ? record.site_name.trim() : ''
  const evidence = storedSiteName ? null : readDesignEvidence(designEvidenceJson)
  const siteName = storedSiteName || analysisSiteName(String(record.url || ''), evidence)
  const storedPreviewPath = typeof record.preview_path === 'string' ? record.preview_path : null
  const { preview_path: _previewPath, ...publicRecord } = record
  return {
    ...publicRecord,
    site_name: siteName,
    screenshot_path:
      screenshotPath === undefined ? storedPreviewPath || readFirstScreenshotPath(screenshots) : screenshotPath,
  }
}

export function readPageScreenshots(serialized: unknown): PageScreenshotData[] {
  if (typeof serialized !== 'string') return []
  try {
    const screenshots = JSON.parse(serialized) as unknown
    return Array.isArray(screenshots) ? screenshots.filter(isPageScreenshotData) : []
  } catch {
    return []
  }
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
  designEvidence?: Pick<DesignEvidence, 'pages'>,
): DarkModeExportData | undefined {
  if (typeof serialized !== 'string') return undefined
  try {
    return restoreDarkModeExportData(JSON.parse(serialized) as unknown, baseTokens, method, selector, designEvidence)
  } catch {
    return undefined
  }
}

export function referenceCaptureFromRecord(record: Record<string, unknown>): ReferenceCaptureInput | null {
  try {
    const tokens = readDesignTokens(record.tokens_json)
    if (!tokens) return null
    return {
      analysisId: String(record.id),
      url: String(record.final_url || record.url || ''),
      routeIdentity:
        typeof record.route_identity === 'string' && record.route_identity.trim()
          ? record.route_identity.trim()
          : undefined,
      createdAt: typeof record.created_at === 'string' ? record.created_at : undefined,
      tokens,
      evidence: readDesignEvidence(record.design_evidence_json),
      manifest: readCaptureManifest(record.capture_manifest_json),
    }
  } catch {
    return null
  }
}
