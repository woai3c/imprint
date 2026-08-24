import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { app, nativeImage } from 'electron'

import type { DesignEvidence } from '../core/design-evidence/types.js'
import type { PageScreenshotData } from '../shared/ipc-contract.js'
import { readDesignEvidence, readPageScreenshots, toAnalysisSummary } from './persisted-records.js'

const HISTORY_THUMBNAIL_SIZE = { width: 192, height: 128 }
const historyThumbnailJobs = new Map<string, Promise<string>>()

function isValidHistoryThumbnail(filePath: string): boolean {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) return false
  const image = nativeImage.createFromBuffer(fs.readFileSync(filePath))
  if (image.isEmpty()) return false
  const size = image.getSize()
  return size.width <= HISTORY_THUMBNAIL_SIZE.width && size.height <= HISTORY_THUMBNAIL_SIZE.height
}

function findHistoryThumbnailSource(evidence: DesignEvidence | null, screenshot: PageScreenshotData): string {
  if (!evidence) return screenshot.path
  const page =
    evidence.pages.find(
      (candidate) => candidate.url === screenshot.url && candidate.viewport === screenshot.viewport,
    ) ||
    evidence.pages.find((candidate) => candidate.url === screenshot.url) ||
    evidence.pages[0]
  const viewportCrop = page?.images.find((image) => image.kind === 'viewport-crop')
  return viewportCrop?.path || screenshot.path
}

async function createHistoryThumbnail(sourcePath: string): Promise<string> {
  if (!fs.existsSync(sourcePath)) return sourcePath

  const stats = fs.statSync(sourcePath)
  const cacheKey = createHash('sha256').update(`${sourcePath}:${stats.size}:${stats.mtimeMs}`).digest('hex')
  const thumbnailDir = path.join(app.getPath('userData'), 'history-thumbnails')
  const thumbnailPath = path.join(thumbnailDir, `${cacheKey}.jpg`)
  if (isValidHistoryThumbnail(thumbnailPath)) return thumbnailPath

  const existingJob = historyThumbnailJobs.get(cacheKey)
  if (existingJob) return existingJob

  const job = (async () => {
    try {
      fs.mkdirSync(thumbnailDir, { recursive: true })
      const image = nativeImage.createFromBuffer(fs.readFileSync(sourcePath))
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
      fs.writeFileSync(thumbnailPath, thumbnail.toJPEG(78))
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
    enriched.push({
      ...screenshot,
      thumbnailPath: await createHistoryThumbnail(findHistoryThumbnailSource(evidence, screenshot)),
    })
  }
  return enriched
}

export async function toAnalysisSummaryWithThumbnail(record: Record<string, unknown>) {
  const screenshot = readPageScreenshots(record.page_screenshots_json)[0]
  if (!screenshot) return toAnalysisSummary(record, null)
  const evidence = readDesignEvidence(record.design_evidence_json)
  const thumbnailPath = await createHistoryThumbnail(findHistoryThumbnailSource(evidence, screenshot))
  return toAnalysisSummary(record, thumbnailPath)
}
