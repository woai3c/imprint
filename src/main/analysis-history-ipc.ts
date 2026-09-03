import { app, ipcMain } from 'electron'

import { generateAgentContextBundle } from '../core/design-context/agent-context.js'
import { generateReconstructionBrief } from '../core/design-context/reconstruction-brief.js'
import { collectStoredAnalysisAssets, removeGeneratedAssets } from './analysis-assets.js'
import { resolveAnalysisComparison, restoreDeterministicStoredContext } from './analysis-records.js'
import { createComparisonVisualPairs } from './comparison-visuals.js'
import { getDb } from './database.js'
import { addHistoryThumbnailPaths, toAnalysisSummaryWithThumbnail } from './history-thumbnails.js'
import {
  readAnalysisCompletion,
  readAnalysisTiming,
  readCaptureManifest,
  readDarkModeExportData,
  readDesignEvidence,
  readPageScreenshots,
  readStoredDesignTokens,
  readStringList,
  toAnalysisSummary,
} from './persisted-records.js'

export function registerAnalysisHistoryIpcHandlers(): void {
  ipcMain.handle('analyses:list', () => {
    const db = getDb()
    return db
      .prepare(
        `SELECT a.*, t.name AS theme_name
         FROM analyses a
         LEFT JOIN themes t ON t.id = a.theme_id
         ORDER BY a.created_at DESC`,
      )
      .all()
  })

  ipcMain.handle('analyses:listSummaries', () => {
    const db = getDb()
    const records = db
      .prepare(
        `SELECT a.id, a.theme_id, t.name AS theme_name, a.site_name, a.url, a.pages_analyzed, a.viewports,
                 a.duration_ms, a.created_at, a.preview_path, a.route_identity
         FROM analyses a
         LEFT JOIN themes t ON t.id = a.theme_id
         ORDER BY a.created_at DESC`,
      )
      .all() as Array<Record<string, unknown>>

    return records.map((record) => toAnalysisSummary(record, (record.preview_path as string | null) || null))
  })

  ipcMain.handle(
    'analyses:listSummariesPage',
    async (_event, query?: { page?: number; pageSize?: number; search?: string }) => {
      const db = getDb()
      const requestedPage = Number.isFinite(query?.page) ? Math.max(1, Math.floor(query?.page || 1)) : 1
      const pageSize = Number.isFinite(query?.pageSize)
        ? Math.min(100, Math.max(1, Math.floor(query?.pageSize || 10)))
        : 10
      const search = typeof query?.search === 'string' ? query.search.trim().slice(0, 500) : ''
      const where = search
        ? `WHERE a.url LIKE @search OR COALESCE(t.name, '') LIKE @search
             OR COALESCE(a.site_name, '') LIKE @search`
        : ''
      const searchParams = search ? { search: `%${search}%` } : {}
      const matchingIds = (
        db
          .prepare(
            `SELECT a.id
             FROM analyses a
             LEFT JOIN themes t ON t.id = a.theme_id
             ${where}
             ORDER BY a.created_at DESC`,
          )
          .all(searchParams) as Array<{ id: string }>
      ).map((record) => record.id)
      const total = matchingIds.length
      const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)))
      const records = db
        .prepare(
          `SELECT a.id, a.theme_id, t.name AS theme_name, a.site_name, a.url, a.pages_analyzed, a.viewports,
                   a.duration_ms, a.created_at, a.preview_path, a.route_identity
           FROM analyses a
           LEFT JOIN themes t ON t.id = a.theme_id
           ${where}
           ORDER BY a.created_at DESC
           LIMIT @limit OFFSET @offset`,
        )
        .all({ ...searchParams, limit: pageSize, offset: (page - 1) * pageSize }) as Array<Record<string, unknown>>

      const summaries: Awaited<ReturnType<typeof toAnalysisSummaryWithThumbnail>>[] = []
      for (const record of records) summaries.push(await toAnalysisSummaryWithThumbnail(record))

      return {
        records: summaries,
        matchingIds,
        page,
        pageSize,
        total,
      }
    },
  )

  ipcMain.handle('analyses:delete', async (_event, id: string) => {
    const db = getDb()
    const record = db.prepare('SELECT * FROM analyses WHERE id = ?').get(id) as Record<string, unknown> | undefined
    db.prepare('DELETE FROM analyses WHERE id = ?').run(id)
    if (record && !record.theme_id) {
      await removeGeneratedAssets(app.getPath('userData'), collectStoredAnalysisAssets(record))
    }
    return { success: true }
  })

  ipcMain.handle('analyses:deleteMany', async (_event, ids: string[]) => {
    const db = getDb()
    const lookup = db.prepare('SELECT * FROM analyses WHERE id = ?')
    const stmt = db.prepare('DELETE FROM analyses WHERE id = ?')
    const assets: string[] = []
    db.transaction((list: string[]) => {
      for (const id of list) {
        const record = lookup.get(id) as Record<string, unknown> | undefined
        if (record && !record.theme_id) assets.push(...collectStoredAnalysisAssets(record))
        stmt.run(id)
      }
    })(ids)
    await removeGeneratedAssets(app.getPath('userData'), assets)
    return { success: true }
  })

  ipcMain.handle('analyses:get', async (_event, id: string) => {
    const db = getDb()
    const record = db
      .prepare(
        `SELECT *
         FROM analyses
         WHERE id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined
    if (!record) return null

    const designEvidence = readDesignEvidence(record.design_evidence_json)
    const tokens = readStoredDesignTokens(record.tokens_json, designEvidence)
    if (!tokens) return null
    const storedContext = restoreDeterministicStoredContext(record, tokens, designEvidence)
    const designProfile = storedContext.profile
    const reconstructionBrief = designEvidence
      ? generateReconstructionBrief(designProfile, designEvidence, designEvidence.tokens)
      : null
    const agentContext =
      designEvidence && designProfile
        ? generateAgentContextBundle('Create a new page or component', designEvidence, designProfile)
        : designEvidence
          ? generateAgentContextBundle('Use the observed design evidence', designEvidence)
          : null
    const pageScreenshots = await addHistoryThumbnailPaths(
      readPageScreenshots(record.page_screenshots_json),
      designEvidence,
    )
    const darkMode = readDarkModeExportData(
      record.dark_tokens_json,
      tokens,
      record.dark_mode_method,
      record.dark_mode_selector,
      designEvidence || undefined,
    )

    return {
      id: record.id,
      savedThemeId: (record.theme_id as string | null) || null,
      url: record.url,
      finalUrl: record.final_url,
      pagesAnalyzed: record.pages_analyzed,
      durationMs: record.duration_ms,
      analysisTiming: readAnalysisTiming(record.analysis_timing_json),
      createdAt: record.created_at,
      routeIdentity: record.route_identity || null,
      tokens,
      cssVariables: storedContext.cssVariables,
      tailwindTheme: storedContext.tailwindTheme,
      designDoc: storedContext.designDoc,
      pageScreenshots,
      featureTags: readStringList(record.feature_tags_json),
      darkTokens: darkMode?.darkTokens?.colors ?? null,
      hasDarkMode: record.has_dark_mode === 1,
      accessMode: record.access_mode,
      authWallDetected: record.auth_wall_detected === 1,
      designEvidence,
      designProfile,
      reconstructionBrief,
      agentContext,
      validationReport: storedContext.validationReport,
      captureManifest: readCaptureManifest(record.capture_manifest_json),
      completion: readAnalysisCompletion(record.completion_json),
    }
  })

  ipcMain.handle('analyses:compare', (_event, earlierAnalysisId: string, laterAnalysisId: string) => {
    const lookup = resolveAnalysisComparison(earlierAnalysisId, laterAnalysisId)
    if (!lookup.success) return lookup
    return {
      success: true,
      comparison: lookup.comparison,
      visualPairs: createComparisonVisualPairs(
        readPageScreenshots(lookup.reference.page_screenshots_json),
        readPageScreenshots(lookup.target.page_screenshots_json),
        {
          referenceEvidence: readDesignEvidence(lookup.reference.design_evidence_json),
          targetEvidence: readDesignEvidence(lookup.target.design_evidence_json),
          ...(lookup.comparison.status === 'inconclusive'
            ? {}
            : { allowedPageKeys: lookup.comparison.comparability.comparedPageKeys }),
        },
      ),
    }
  })
}
