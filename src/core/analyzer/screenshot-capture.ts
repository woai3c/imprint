import fs from 'node:fs'

import type { BrowserContext, Page } from 'playwright-core'

import type { ExtractionIssue } from './types.js'

export const SCREENSHOT_CAPTURE_TIMEOUT_MS = 10_000
const BASE64_WRITE_CHUNK_LENGTH = 256 * 1024
const MINIMUM_PERSIST_BUDGET_MS = 10
let screenshotTemporaryFileCounter = 0

type CdpSession = Awaited<ReturnType<BrowserContext['newCDPSession']>>

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

async function withinDeadline<T>(operation: () => Promise<T>, deadline: number): Promise<T> {
  if (deadline - Date.now() <= 0) throw new Error('screenshot-operation-timeout')
  const promise = operation()
  const remaining = deadline - Date.now()
  if (remaining <= 0) {
    // The operation may have returned an already-rejecting promise after synchronous setup crossed the deadline.
    // Observe that rejection even though there is no time left to await the operation.
    void promise.catch(() => {})
    throw new Error('screenshot-operation-timeout')
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('screenshot-operation-timeout')), remaining)
      }),
    ])
    if (Date.now() >= deadline) throw new Error('screenshot-operation-timeout')
    return result
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function nextScreenshotTemporaryPath(filePath: string): string {
  // Playwright infers the screenshot format from the final extension, so isolation paths must still end in `.png`.
  return `${filePath}.partial-${process.pid}-${(screenshotTemporaryFileCounter += 1)}.png`
}

function removeTemporaryFile(filePath: string): Promise<void> {
  return fs.promises.rm(filePath, { force: true }).catch(() => {})
}

function detachCdpSession(session: CdpSession): Promise<void> {
  return Promise.resolve()
    .then(() => session.detach())
    .catch(() => {})
}

async function createCdpSessionWithinDeadline(page: Page, deadline: number): Promise<CdpSession | undefined> {
  if (Date.now() >= deadline) return undefined
  let creation: Promise<CdpSession>
  try {
    creation = page.context().newCDPSession(page)
  } catch {
    return undefined
  }
  // A synchronous setup delay can consume the remaining budget before withinDeadline observes this promise.
  // Attach a rejection observer immediately, then release any session that resolves after the timeout race was lost.
  void creation.catch(() => {})
  try {
    return await withinDeadline(() => creation, deadline)
  } catch {
    void creation.then((lateSession) => detachCdpSession(lateSession)).catch(() => {})
    return undefined
  }
}

async function persistBase64Screenshot(data: string, filePath: string, deadline: number): Promise<boolean> {
  if (!data || deadline - Date.now() < MINIMUM_PERSIST_BUDGET_MS) return false
  const temporaryPath = nextScreenshotTemporaryPath(filePath)
  let pendingWrite: Promise<void> | undefined
  const removeTemporary = () => removeTemporaryFile(temporaryPath)

  try {
    for (let offset = 0; offset < data.length; offset += BASE64_WRITE_CHUNK_LENGTH) {
      if (Date.now() >= deadline) throw new Error('screenshot-operation-timeout')
      const encoded = data.slice(offset, Math.min(data.length, offset + BASE64_WRITE_CHUNK_LENGTH))
      const decoded = Buffer.from(encoded, 'base64')
      if (Date.now() >= deadline) throw new Error('screenshot-operation-timeout')
      const write = fs.promises.writeFile(temporaryPath, decoded, { flag: offset === 0 ? 'w' : 'a' })
      pendingWrite = write
      await withinDeadline(() => write, deadline)
      pendingWrite = undefined
    }
    if (Date.now() >= deadline) throw new Error('screenshot-operation-timeout')
    fs.renameSync(temporaryPath, filePath)
    return true
  } catch {
    void removeTemporary()
    if (pendingWrite) void pendingWrite.then(removeTemporary, removeTemporary).catch(() => {})
    return false
  }
}

async function capturePlaywrightScreenshotWithinDeadline(
  operation: (temporaryPath: string) => Promise<unknown>,
  filePath: string,
  deadline: number,
): Promise<boolean> {
  if (Date.now() >= deadline) return false
  const temporaryPath = nextScreenshotTemporaryPath(filePath)
  const removeTemporary = () => removeTemporaryFile(temporaryPath)
  let capture: Promise<unknown> | undefined

  try {
    await withinDeadline(() => {
      capture = operation(temporaryPath)
      // Observe an immediate rejection even if synchronous setup consumes the remaining deadline.
      void capture.catch(() => {})
      return capture
    }, deadline)
    if (Date.now() >= deadline) throw new Error('screenshot-operation-timeout')
    fs.renameSync(temporaryPath, filePath)
    return true
  } catch {
    void removeTemporary()
    // A timed-out screenshot cannot be cancelled. It writes only to its isolated path, which is removed again after
    // any late settlement so it can never overwrite a newer validated fallback.
    if (capture) void capture.then(removeTemporary, removeTemporary).catch(() => {})
    return false
  }
}

function nextAttemptDeadline(deadline: number, attemptsRemaining: number): number {
  const now = Date.now()
  const remaining = deadline - now
  if (remaining <= 0) return deadline
  return Math.min(deadline, now + Math.max(1, Math.floor(remaining / Math.max(1, attemptsRemaining))))
}

async function captureBeyondViewportClip(
  page: Page,
  filePath: string,
  width: number,
  height: number,
  deadline: number,
): Promise<boolean> {
  if (Date.now() >= deadline) return false
  let session: CdpSession | undefined
  try {
    session = await createCdpSessionWithinDeadline(page, deadline)
    if (!session) return false
    const activeSession = session
    const result = (await withinDeadline(
      () =>
        activeSession.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width, height, scale: 1 },
        }),
      deadline,
    )) as { data?: string }
    if (!result.data) return false
    return await persistBase64Screenshot(result.data, filePath, deadline)
  } catch {
    return false
  } finally {
    if (session) {
      // Attach rejection handling before checking the deadline. When the CDP command exhausts its budget, calling
      // withinDeadline first would leave a rejecting detach promise unobserved in CLI and MCP processes.
      const detach = detachCdpSession(session)
      await withinDeadline(() => detach, deadline).catch(() => {})
    }
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
  const captureTimeout = Math.max(1, timeout ?? SCREENSHOT_CAPTURE_TIMEOUT_MS)
  const deadline = Date.now() + captureTimeout
  let attemptsRemaining = preferExactClip ? 4 : 3
  if (preferExactClip) {
    const exactClipDeadline = nextAttemptDeadline(deadline, attemptsRemaining)
    attemptsRemaining -= 1
    if (await captureBeyondViewportClip(page, filePath, expectedWidth, expectedHeight, exactClipDeadline)) {
      const dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
      if (dimensions) return { dimensions, valid: true }
    }
  }

  const fullPageDeadline = nextAttemptDeadline(deadline, attemptsRemaining)
  attemptsRemaining -= 1
  // Playwright waits for web fonts before taking a screenshot. A stalled font must not discard otherwise usable DOM
  // and computed-style evidence; the Chromium and clip fallbacks below do not depend on that wait.
  await capturePlaywrightScreenshotWithinDeadline(
    (temporaryPath) =>
      page.screenshot({
        path: temporaryPath,
        fullPage: true,
        timeout: Math.max(1, fullPageDeadline - Date.now()),
      }),
    filePath,
    fullPageDeadline,
  )
  let dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
  if (dimensions) return { dimensions, valid: true }
  const initialDimensions = inspectPngDimensions(filePath)
  if (Date.now() >= deadline) return { dimensions: initialDimensions, valid: false }

  // Dynamic or horizontally overflowing pages can make a nominal full-page request return the viewport or the full
  // overflow width. Chromium's document-space capture keeps the requested visible width without changing page layout.
  const cdpDeadline = nextAttemptDeadline(deadline, attemptsRemaining)
  if (await captureBeyondViewportClip(page, filePath, expectedWidth, expectedHeight, cdpDeadline)) {
    dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
    if (dimensions) return { dimensions, valid: true }
  }
  if (Date.now() >= deadline) return { dimensions: inspectPngDimensions(filePath) || initialDimensions, valid: false }

  // Keep Playwright's clip as a final compatibility fallback for Chromium builds where CDP capture is unavailable.
  try {
    await withinDeadline(() => page.evaluate(() => window.scrollTo(0, 0)), deadline)
    await withinDeadline(() => page.waitForTimeout(100), deadline)
    const captured = await capturePlaywrightScreenshotWithinDeadline(
      (temporaryPath) =>
        page.screenshot({
          path: temporaryPath,
          clip: { x: 0, y: 0, width: expectedWidth, height: expectedHeight },
          timeout: Math.max(1, deadline - Date.now()),
        }),
      filePath,
      deadline,
    )
    if (!captured) return { dimensions: inspectPngDimensions(filePath) || initialDimensions, valid: false }
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
  const captureTimeout = Math.max(1, timeout ?? SCREENSHOT_CAPTURE_TIMEOUT_MS)
  const deadline = Date.now() + captureTimeout
  const cdpDeadline = nextAttemptDeadline(deadline, 2)
  if (await captureBeyondViewportClip(page, filePath, expectedWidth, expectedHeight, cdpDeadline)) {
    const dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
    if (dimensions) return { dimensions, valid: true }
  }
  if (Date.now() >= deadline) return { dimensions: inspectPngDimensions(filePath), valid: false }

  const captured = await capturePlaywrightScreenshotWithinDeadline(
    (temporaryPath) =>
      page.screenshot({
        path: temporaryPath,
        fullPage: false,
        timeout: Math.max(1, deadline - Date.now()),
      }),
    filePath,
    deadline,
  )
  if (!captured) return { dimensions: inspectPngDimensions(filePath), valid: false }
  const dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
  return { dimensions: dimensions || inspectPngDimensions(filePath), valid: Boolean(dimensions) }
}
