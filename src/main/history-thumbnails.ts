import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { app, nativeImage } from 'electron'

import type { DesignEvidence } from '../core/design-evidence/types.js'
import type { PageScreenshotData } from '../shared/ipc-contract.js'
import { analysisPreviewPath, readPageScreenshots, toAnalysisSummary } from './persisted-records.js'

const HISTORY_THUMBNAIL_SIZE = { width: 192, height: 128 }
const historyThumbnailJobs = new Map<string, Promise<string>>()

async function isValidHistoryThumbnail(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).size > 0
  } catch {
    return false
  }
}

function findHistoryThumbnailSource(evidence: DesignEvidence | null, screenshot: PageScreenshotData): string {
  return analysisPreviewPath([screenshot], evidence) || screenshot.path
}

export async function createHistoryThumbnail(sourcePath: string): Promise<string> {
  const thumbnailDir = path.join(app.getPath('userData'), 'history-thumbnails')
  if (
    path.dirname(path.resolve(sourcePath)) === path.resolve(thumbnailDir) &&
    (await isValidHistoryThumbnail(sourcePath))
  ) {
    return sourcePath
  }
  let stats
  try {
    stats = await fs.stat(sourcePath)
  } catch {
    return sourcePath
  }
  const cacheKey = createHash('sha256').update(`${sourcePath}:${stats.size}:${stats.mtimeMs}`).digest('hex')
  const thumbnailPath = path.join(thumbnailDir, `${cacheKey}.jpg`)
  if (await isValidHistoryThumbnail(thumbnailPath)) return thumbnailPath

  const existingJob = historyThumbnailJobs.get(cacheKey)
  if (existingJob) return existingJob

  const job = (async () => {
    try {
      await fs.mkdir(thumbnailDir, { recursive: true })
      const image = nativeImage.createFromBuffer(await fs.readFile(sourcePath))
      if (image.isEmpty()) return sourcePath
      const size = image.getSize()
      const scale = Math.min(1, HISTORY_THUMBNAIL_SIZE.width / size.width, HISTORY_THUMBNAIL_SIZE.height / size.height)
      const thumbnail =
        scale < 1
          ? image.resize({
              width: Math.max(1, Math.round(size.width * scale)),
              height: Math.max(1, Math.round(size.height * scale)),
              quality: 'better',
            })
          : image
      await fs.writeFile(thumbnailPath, thumbnail.toJPEG(78))
      return thumbnailPath
    } catch {
      return sourcePath
    } finally {
      historyThumbnailJobs.delete(cacheKey)
    }
  })()
  historyThumbnailJobs.set(cacheKey, job)
  return job
}

export async function addHistoryThumbnailPaths(
  pageScreenshots: PageScreenshotData[],
  evidence: DesignEvidence | null,
): Promise<PageScreenshotData[]> {
  const enriched: PageScreenshotData[] = []
  for (const screenshot of pageScreenshots) {
    const thumbnailPath =
      screenshot.thumbnailPath && (await isValidHistoryThumbnail(screenshot.thumbnailPath))
        ? screenshot.thumbnailPath
        : await createHistoryThumbnail(findHistoryThumbnailSource(evidence, screenshot))
    enriched.push({
      ...screenshot,
      thumbnailPath,
    })
  }
  return enriched
}

export async function toAnalysisSummaryWithThumbnail(record: Record<string, unknown>) {
  const storedPreviewPath = typeof record.preview_path === 'string' ? record.preview_path : null
  const screenshot = storedPreviewPath ? null : readPageScreenshots(record.page_screenshots_json)[0]
  const sourcePath = storedPreviewPath || screenshot?.path || null
  if (!sourcePath) return toAnalysisSummary(record, null)
  const thumbnailPath = await createHistoryThumbnail(sourcePath)
  return toAnalysisSummary(record, thumbnailPath)
}
