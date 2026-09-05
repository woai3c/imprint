import type { Frame, Page, Response } from 'playwright-core'

export const NAVIGATION_RECOVERY_GRACE_MS = 2_000
export const NAVIGATION_RETRY_TIMEOUT_CAP_MS = 20_000

export interface NavigationOptions {
  timeoutMs?: number
  retry?: boolean
  retryTimeoutMs?: number
  recoveryGraceMs?: number
}

export interface NavigationResult {
  status: number | undefined
  attempts: number
  recoveredAfterTimeout: boolean
}

export function isNavigationTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'TimeoutError' || /(?:page|frame)\.goto:\s*Timeout\b/i.test(error.message)
}

function isHttpDocumentUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

async function hasCommittedUsableDocument(page: Page, graceMs: number): Promise<boolean> {
  if (page.isClosed()) return false

  const inspect = async () => {
    if (page.isClosed() || !isHttpDocumentUrl(page.url())) return false
    return page
      .evaluate(() => {
        const htmlDocument = document.contentType === 'text/html' || document.contentType === 'application/xhtml+xml'
        // DOMContentLoaded can remain blocked by a slow subresource after the document body is already usable.
        // Page preparation and health checks below navigation still decide whether the content is complete enough.
        return htmlDocument && Boolean(document.body?.childElementCount)
      })
      .catch(() => false)
  }

  if (await inspect()) return true
  await page.waitForLoadState('domcontentloaded', { timeout: graceMs }).catch(() => {})
  return inspect()
}

/**
 * Navigates once, recovers a document that committed just after the timeout, and otherwise retries once.
 * Downstream page-health checks remain responsible for rejecting redirects, access walls, and incomplete content.
 */
export async function navigateWithRecovery(
  page: Page,
  url: string,
  options: NavigationOptions = {},
): Promise<NavigationResult> {
  const timeoutMs = options.timeoutMs ?? 60_000
  const retryEnabled = options.retry ?? true
  const retryTimeoutMs = options.retryTimeoutMs ?? Math.min(Math.max(1, timeoutMs), NAVIGATION_RETRY_TIMEOUT_CAP_MS)
  const recoveryGraceMs = options.recoveryGraceMs ?? NAVIGATION_RECOVERY_GRACE_MS

  const navigate = async (timeout: number) => {
    const startedAt = Date.now()
    const requestedUrl = new URL(url)
    requestedUrl.hash = ''
    const observed = { response: undefined as Response | undefined, committed: false }
    let notifyCommit: (() => void) | undefined
    const onResponse = (response: Response) => {
      let request = response.request()
      if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return
      while (request.redirectedFrom()) request = request.redirectedFrom()!
      if (request.url() === requestedUrl.href) observed.response = response
    }
    const onFrameNavigated = (frame: Frame) => {
      if (frame !== page.mainFrame() || !observed.response) return
      observed.committed = true
      notifyCommit?.()
    }
    page.on('response', onResponse)
    page.on('framenavigated', onFrameNavigated)
    let response: Response | null
    try {
      response = await page.goto(url, { waitUntil: 'commit' as const, timeout })
    } catch (error) {
      // Full Chrome may reject an empty HTTP error document after emitting its response, unlike headless shell.
      // Preserve only an observed failure from this navigation chain; never infer a status from a network error.
      if (
        error instanceof Error &&
        /\bnet::ERR_HTTP_RESPONSE_CODE_FAILURE\b/.test(error.message) &&
        observed.response &&
        observed.response.status() >= 400
      ) {
        // The rejection can arrive before Chrome replaces the old document with its error page. Do not hand
        // downstream inspection the previous document or leave an unbounded navigation waiter behind.
        if (!observed.committed) {
          const committed = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(
              () => resolve(false),
              Math.min(recoveryGraceMs, Math.max(1, timeout - (Date.now() - startedAt))),
            )
            notifyCommit = () => {
              clearTimeout(timer)
              resolve(true)
            }
          })
          if (!committed) throw error
        }
        await page.waitForLoadState('domcontentloaded', { timeout: recoveryGraceMs }).catch(() => {})
        return observed.response
      }
      throw error
    } finally {
      page.off('response', onResponse)
      page.off('framenavigated', onFrameNavigated)
    }
    if (response && response.status() >= 400) {
      const headers = response.headers()
      const contentType = headers['content-type']?.split(';')[0].trim().toLowerCase()
      const nonHtml = contentType && !['text/html', 'application/xhtml+xml'].includes(contentType)
      // An empty or non-HTML HTTP error cannot grow an HTML body. Preserve its status for auth and health gates.
      if (headers['content-length'] === '0' || nonHtml) return response
    }
    const remainingMs = Math.max(1, timeout - (Date.now() - startedAt))
    await page.waitForFunction(
      () => {
        const htmlDocument = document.contentType === 'text/html' || document.contentType === 'application/xhtml+xml'
        return htmlDocument && Boolean(document.body?.childElementCount)
      },
      undefined,
      { timeout: remainingMs },
    )
    return response
  }

  try {
    const response = await navigate(timeoutMs)
    return { status: response?.status(), attempts: 1, recoveredAfterTimeout: false }
  } catch (firstError) {
    if (!isNavigationTimeout(firstError)) throw firstError
    if (await hasCommittedUsableDocument(page, recoveryGraceMs)) {
      return { status: undefined, attempts: 1, recoveredAfterTimeout: true }
    }
    if (!retryEnabled) throw firstError

    try {
      const response = await navigate(retryTimeoutMs)
      return { status: response?.status(), attempts: 2, recoveredAfterTimeout: false }
    } catch (retryError) {
      if (!isNavigationTimeout(retryError)) throw retryError
      if (await hasCommittedUsableDocument(page, recoveryGraceMs)) {
        return { status: undefined, attempts: 2, recoveredAfterTimeout: true }
      }
      throw retryError
    }
  }
}
