import { compareReferenceCaptures } from '../core/analyzer/reference-compare.js'
import type { DesignToken } from '../core/analyzer/types.js'
import { createDeterministicDesignContext } from '../core/design-context/deterministic-context.js'
import type { DesignProfile } from '../core/design-context/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import { generateDesignDoc } from '../core/export/index.js'
import { getDb } from './database.js'
import {
  readAnalysisCompletion,
  readAnalysisTiming,
  readDarkModeExportData,
  readDesignProfile,
  readPageScreenshots,
  readStringList,
  readValidationReport,
  referenceCaptureFromRecord,
} from './persisted-records.js'

export function restoreDeterministicStoredContext(
  record: Record<string, unknown>,
  tokens: DesignToken,
  evidence: DesignEvidence | null,
): {
  profile: DesignProfile | null
  validationReport: ReturnType<typeof createDeterministicDesignContext>['validationReport'] | null
  designDoc: string
} {
  const currentProfile = readDesignProfile(record.design_profile_json)
  const currentValidationReport = readValidationReport(record.validation_report_json)

  if (!evidence) {
    return {
      profile: currentProfile,
      validationReport: currentProfile ? currentValidationReport : null,
      designDoc: (record.design_doc as string) || '',
    }
  }
  const language =
    currentProfile?.language || (evidence.source.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en')
  const context =
    currentProfile && currentValidationReport
      ? { profile: currentProfile, validationReport: currentValidationReport }
      : createDeterministicDesignContext(evidence, language)
  const darkMode = readDarkModeExportData(
    record.dark_tokens_json,
    tokens,
    record.dark_mode_method,
    record.dark_mode_selector,
    evidence,
  )
  const designDoc = generateDesignDoc({
    tokens,
    url: String(record.url || evidence.source.requestedUrl),
    featureTags: readStringList(record.feature_tags_json),
    darkMode,
    language,
    designEvidence: evidence,
    designProfile: context.profile,
  })

  if (!currentProfile || !currentValidationReport || designDoc !== record.design_doc) {
    getDb()
      .prepare(
        `UPDATE analyses
         SET design_profile_json = ?, validation_report_json = ?, design_doc = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(context.profile), JSON.stringify(context.validationReport), designDoc, record.id)
  }

  return {
    profile: context.profile,
    validationReport: context.validationReport,
    designDoc,
  }
}

export function buildStoredAnalysisResult(
  record: Record<string, unknown>,
  tokens: DesignToken,
  designDoc = (record.design_doc as string) || '',
) {
  const pageScreenshots = readPageScreenshots(record.page_screenshots_json)
  return {
    analysisId: record.id,
    savedThemeId: (record.theme_id as string | null) || null,
    tokens,
    cssVariables: record.css_variables || '',
    tailwindTheme: record.tailwind_theme || '',
    designDoc,
    screenshots: pageScreenshots.map((screenshot) => screenshot.path),
    pageScreenshots,
    duration: Number(record.duration_ms) || 0,
    analysisTiming: readAnalysisTiming(record.analysis_timing_json),
    url: record.url,
    completion: readAnalysisCompletion(record.completion_json),
  }
}

export type AnalysisComparisonLookup =
  | {
      success: true
      target: Record<string, unknown>
      reference: Record<string, unknown>
      comparison: ReturnType<typeof compareReferenceCaptures>
    }
  | {
      success: false
      reason: 'analysis-not-found' | 'same-analysis' | 'analysis-order-invalid' | 'invalid-analysis-data'
    }

export function resolveAnalysisComparison(
  earlierAnalysisId: string,
  laterAnalysisId: string,
): AnalysisComparisonLookup {
  const db = getDb()
  const reference = db.prepare('SELECT * FROM analyses WHERE id = ?').get(earlierAnalysisId) as
    Record<string, unknown> | undefined
  const target = db.prepare('SELECT * FROM analyses WHERE id = ?').get(laterAnalysisId) as
    Record<string, unknown> | undefined
  if (!reference || !target) return { success: false, reason: 'analysis-not-found' }
  if (earlierAnalysisId === laterAnalysisId) return { success: false, reason: 'same-analysis' }
  const referenceTime = Date.parse(String(reference.created_at || ''))
  const targetTime = Date.parse(String(target.created_at || ''))
  if (Number.isNaN(referenceTime) || Number.isNaN(targetTime) || referenceTime >= targetTime) {
    return { success: false, reason: 'analysis-order-invalid' }
  }

  const referenceCapture = referenceCaptureFromRecord(reference)
  const targetCapture = referenceCaptureFromRecord(target)
  if (!referenceCapture || !targetCapture) return { success: false, reason: 'invalid-analysis-data' }
  return {
    success: true,
    target,
    reference,
    comparison: compareReferenceCaptures(referenceCapture, targetCapture),
  }
}
