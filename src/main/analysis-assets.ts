import fs from 'node:fs/promises'
import path from 'node:path'

import type { PageScreenshot } from '../core/analyzer/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import { readDesignEvidence, readPageScreenshots } from './persisted-records.js'

const GENERATED_ASSET_DIRECTORIES = ['screenshots', 'history-thumbnails'] as const

function addEvidenceAssets(paths: Set<string>, evidence: DesignEvidence | null): void {
  for (const page of evidence?.pages || []) {
    for (const image of page.images || []) {
      if (image.path) paths.add(image.path)
    }
  }
}

export function collectAnalysisAssets(
  pageScreenshots: Array<PageScreenshot & { thumbnailPath?: string }>,
  evidence: DesignEvidence | null,
): string[] {
  const paths = new Set<string>()
  for (const screenshot of pageScreenshots) {
    if (screenshot.path) paths.add(screenshot.path)
    if (screenshot.thumbnailPath) paths.add(screenshot.thumbnailPath)
  }
  addEvidenceAssets(paths, evidence)
  return [...paths]
}

export function collectStoredAnalysisAssets(record: Record<string, unknown>): string[] {
  const paths = new Set(
    collectAnalysisAssets(
      readPageScreenshots(record.page_screenshots_json),
      readDesignEvidence(record.design_evidence_json),
    ),
  )
  if (typeof record.preview_path === 'string' && record.preview_path) paths.add(record.preview_path)
  if (typeof record.screenshot_path === 'string' && record.screenshot_path) paths.add(record.screenshot_path)
  return [...paths]
}

function isInsideGeneratedAssetDirectory(userDataDir: string, candidatePath: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath)
  return GENERATED_ASSET_DIRECTORIES.some((directory) => {
    const root = path.resolve(userDataDir, directory)
    const relative = path.relative(root, resolvedCandidate)
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  })
}

export async function removeGeneratedAssets(userDataDir: string, candidates: Iterable<string>): Promise<void> {
  await Promise.all(
    [...new Set(candidates)].map(async (candidate) => {
      if (!isInsideGeneratedAssetDirectory(userDataDir, candidate)) return
      await fs.rm(candidate, { force: true }).catch(() => {})
    }),
  )
}

export async function clearGeneratedAssetDirectories(userDataDir: string): Promise<void> {
  await Promise.all(
    GENERATED_ASSET_DIRECTORIES.map((directory) =>
      fs.rm(path.resolve(userDataDir, directory), { force: true, recursive: true }).catch(() => {}),
    ),
  )
}
