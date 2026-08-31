import fs from 'node:fs'

import type { BrowserContext, Page } from 'playwright-core'

import type { ExtractionIssue } from './types.js'

export const SCREENSHOT_CAPTURE_TIMEOUT_MS = 10_000

export interface ScreenshotCaptureResult {
  dimensions: { width: number; height: number } | null
  valid: boolean
}

export function inspectPngDimensions(filePath: string): { width: number; height: number } | null {
  try {
    const header = Buffer.alloc(24)
    const descriptor = fs.openSync(filePath, 'r')
    try {
      if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length) return null
    } finally {
      fs.closeSync(descriptor)
    }
    if (header.toString('ascii', 1, 4) !== 'PNG') return null
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
  } catch {
    return null
  }
}

export function recordScreenshotDimensionIssue(
  issues: ExtractionIssue[],
  stage: string,
  filePath: string,
  expectedWidth: number,
  expectedHeight: number,
): boolean {
  const actual = inspectPngDimensions(filePath)
  if (!actual) {
    issues.push({ stage, reason: 'screenshot-dimensions-unreadable' })
    return false
  }
  if (Math.abs(actual.width - expectedWidth) > 4 || Math.abs(actual.height - expectedHeight) > 8) {
    issues.push({
      stage,
      reason: `screenshot-dimensions-mismatch expected=${Math.round(expectedWidth)}x${Math.round(expectedHeight)} actual=${actual.width}x${actual.height}`,
    })
    return false
  }
  return true
}

function screenshotDimensionsMatch(
  filePath: string,
  expectedWidth: number,
  expectedHeight: number,
): { width: number; height: number } | null {
  const actual = inspectPngDimensions(filePath)
  if (!actual) return null
  return Math.abs(actual.width - expectedWidth) <= 4 && Math.abs(actual.height - expectedHeight) <= 8 ? actual : null
}

async function captureBeyondViewportClip(
  page: Page,
  filePath: string,
  width: number,
  height: number,
): Promise<boolean> {
  let session: Awaited<ReturnType<BrowserContext['newCDPSession']>> | undefined
  try {
    session = await page.context().newCDPSession(page)
    const result = (await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    })) as { data?: string }
    if (!result.data) return false
    fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'))
    return true
  } catch {
    return false
  } finally {
    await session?.detach().catch(() => {})
  }
}

export async function captureValidatedOverview(
  page: Page,
  filePath: string,
  expectedWidth: number,
  expectedHeight: number,
  timeout?: number,
  preferExactClip = false,
): Promise<ScreenshotCaptureResult> {
  if (preferExactClip && (await captureBeyondViewportClip(page, filePath, expectedWidth, expectedHeight))) {
    const dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
    if (dimensions) return { dimensions, valid: true }
  }

  try {
    await page.screenshot({
      path: filePath,
      fullPage: true,
      timeout: timeout ?? SCREENSHOT_CAPTURE_TIMEOUT_MS,
    })
  } catch {
    // Playwright waits for web fonts before taking a screenshot. A stalled font must not discard otherwise usable
    // DOM and computed-style evidence; the Chromium and clip fallbacks below do not depend on that wait.
  }
  let dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
  if (dimensions) return { dimensions, valid: true }
  const initialDimensions = inspectPngDimensions(filePath)

  // Dynamic or horizontally overflowing pages can make a nominal full-page request return the viewport or the full
  // overflow width. Chromium's document-space capture keeps the requested visible width without changing page layout.
  if (await captureBeyondViewportClip(page, filePath, expectedWidth, expectedHeight)) {
    dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
    if (dimensions) return { dimensions, valid: true }
  }

  // Keep Playwright's clip as a final compatibility fallback for Chromium builds where CDP capture is unavailable.
  try {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(100)
    await page.screenshot({
      path: filePath,
      clip: { x: 0, y: 0, width: expectedWidth, height: expectedHeight },
      timeout: timeout ?? SCREENSHOT_CAPTURE_TIMEOUT_MS,
    })
  } catch {
    return { dimensions: inspectPngDimensions(filePath) || initialDimensions, valid: false }
  }
  dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
  return { dimensions: dimensions || inspectPngDimensions(filePath), valid: Boolean(dimensions) }
}

export async function captureValidatedViewport(
  page: Page,
  filePath: string,
  expectedWidth: number,
  expectedHeight: number,
  timeout?: number,
): Promise<ScreenshotCaptureResult> {
  if (await captureBeyondViewportClip(page, filePath, expectedWidth, expectedHeight)) {
    const dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
    if (dimensions) return { dimensions, valid: true }
  }

  try {
    await page.screenshot({
      path: filePath,
      fullPage: false,
      timeout: timeout ?? SCREENSHOT_CAPTURE_TIMEOUT_MS,
    })
  } catch {
    return { dimensions: inspectPngDimensions(filePath), valid: false }
  }
  const dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
  return { dimensions: dimensions || inspectPngDimensions(filePath), valid: Boolean(dimensions) }
}
