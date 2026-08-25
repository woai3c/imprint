import { createHash } from 'node:crypto'
import fs from 'node:fs'

import { routeIdentityFromUrl } from '../core/analyzer/reference-compare.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import type { ComparisonVisualPair, PageScreenshotData } from '../shared/ipc-contract.js'

interface ComparisonVisualPairOptions {
  referenceEvidence?: DesignEvidence | null
  targetEvidence?: DesignEvidence | null
  allowedPageKeys?: string[]
  isReadable?: (path: string) => boolean
  readContentHash?: (path: string) => string | undefined
}

function screenshotKey(screenshot: PageScreenshotData): string {
  return `${routeIdentityFromUrl(screenshot.url)}::${screenshot.viewport}`
}

function readableScreenshot(screenshot: PageScreenshotData, isReadable: (path: string) => boolean): boolean {
  return screenshot.valid !== false && Boolean(screenshot.path) && isReadable(screenshot.path)
}

function groupScreenshots(screenshots: PageScreenshotData[]): Map<string, PageScreenshotData[]> {
  const groups = new Map<string, PageScreenshotData[]>()
  for (const screenshot of screenshots) {
    const key = screenshotKey(screenshot)
    const group = groups.get(key) || []
    group.push(screenshot)
    groups.set(key, group)
  }
  return groups
}

function fileContentHash(filePath: string): string | undefined {
  try {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  } catch {
    return undefined
  }
}

function evidenceContentHash(evidence: DesignEvidence | null | undefined, screenshot: PageScreenshotData) {
  const pages = evidence?.pages.filter(
    (page) =>
      routeIdentityFromUrl(page.url) === routeIdentityFromUrl(screenshot.url) && page.viewport === screenshot.viewport,
  )
  if (pages?.length !== 1) return undefined
  const overviewImages = pages[0].images.filter((image) => image.kind === 'overview')
  const image = overviewImages.find((candidate) => candidate.path === screenshot.path) || overviewImages[0]
  return image?.contentHash
}

export function createComparisonVisualPairs(
  referenceScreenshots: PageScreenshotData[],
  targetScreenshots: PageScreenshotData[],
  options: ComparisonVisualPairOptions = {},
): ComparisonVisualPair[] {
  const isReadable = options.isReadable || fs.existsSync
  const readContentHash = options.readContentHash || fileContentHash
  const allowedPageKeys = options.allowedPageKeys ? new Set(options.allowedPageKeys) : null
  const referenceGroups = groupScreenshots(
    referenceScreenshots.filter(
      (screenshot) =>
        readableScreenshot(screenshot, isReadable) &&
        (!allowedPageKeys || allowedPageKeys.has(screenshotKey(screenshot))),
    ),
  )
  const targetGroups = groupScreenshots(
    targetScreenshots.filter(
      (screenshot) =>
        readableScreenshot(screenshot, isReadable) &&
        (!allowedPageKeys || allowedPageKeys.has(screenshotKey(screenshot))),
    ),
  )
  const pairs: ComparisonVisualPair[] = []

  for (const [key, references] of referenceGroups) {
    const targets = targetGroups.get(key)
    // Duplicate normalized page/viewport captures cannot be paired without guessing.
    if (references.length !== 1 || targets?.length !== 1) continue
    const reference = references[0]
    const target = targets[0]
    const referenceHash = evidenceContentHash(options.referenceEvidence, reference) || readContentHash(reference.path)
    const targetHash = evidenceContentHash(options.targetEvidence, target) || readContentHash(target.path)
    if (referenceHash && targetHash && referenceHash === targetHash) continue
    pairs.push({
      url: routeIdentityFromUrl(target.url),
      viewport: target.viewport,
      reference: {
        path: reference.path,
        width: reference.width,
        height: reference.height,
      },
      target: {
        path: target.path,
        width: target.width,
        height: target.height,
      },
    })
  }

  return pairs
}
