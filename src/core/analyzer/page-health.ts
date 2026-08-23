import type { Page } from 'playwright-core'

import { preparePageForExtraction, resetPageScroll } from './page-preparer.js'

export type PageHealthStatus = 'healthy' | 'degraded' | 'unusable'

export interface PageHealthIssue {
  code:
    | 'large-overlay'
    | 'main-content-empty'
    | 'skeleton-heavy'
    | 'fonts-not-ready'
    | 'dom-still-mutating'
    | 'horizontal-overflow'
    | 'auth-wall'
    | 'captcha'
    | 'error-page'
    | 'rate-limited'
    | 'unexpected-navigation'
    | 'health-recovery-failed'
    | 'health-recovery-timeout'
  severity: 'warning' | 'error'
  recoverable: boolean
  detail?: string
}

export interface PageHealthReport {
  status: PageHealthStatus
  checkedAt: string
  recovered: boolean
  attempts: number
  viewport: { width: number; height: number }
  content: { width: number; height: number }
  overlayAreaRatio: number
  mutationCount: number
  evidenceEligible: boolean
  issues: PageHealthIssue[]
}

interface PageHealthOptions {
  expectedUrl: string
  responseStatus?: number
}

const HEALTH_RECOVERY_TIMEOUT_MS = 14_000
const EMPTY_CONTENT_RELOAD_TIMEOUT_MS = 6_000

function sameOrigin(first: string, second: string): boolean {
  try {
    return new URL(first).origin === new URL(second).origin
  } catch {
    return first === second
  }
}

const EVIDENCE_UNSAFE_HEALTH_CODES = new Set<PageHealthIssue['code']>([
  'large-overlay',
  'main-content-empty',
  'skeleton-heavy',
  'fonts-not-ready',
  'dom-still-mutating',
  'auth-wall',
  'captcha',
  'error-page',
  'rate-limited',
  'unexpected-navigation',
  'health-recovery-failed',
  'health-recovery-timeout',
])

export function isPageHealthEvidenceEligible(report: Pick<PageHealthReport, 'status' | 'issues'>): boolean {
  return report.status !== 'unusable' && !report.issues.some((issue) => EVIDENCE_UNSAFE_HEALTH_CODES.has(issue.code))
}

export async function inspectPageHealth(page: Page, options: PageHealthOptions): Promise<PageHealthReport> {
  await resetPageScroll(page)
  const currentUrl = page.url()
  const responseStatus = options.responseStatus
  const facts = await page.evaluate(async () => {
    const root = document.scrollingElement || document.documentElement
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight)
    let overlayAreaRatio = 0
    let visibleElements = 0
    let skeletonElements = 0

    for (const element of [...document.querySelectorAll('*')].slice(0, 5_000)) {
      if (!(element instanceof HTMLElement)) continue
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number.parseFloat(style.opacity || '1') > 0.02
      if (!visible) continue
      visibleElements += 1
      const identity = `${element.id} ${typeof element.className === 'string' ? element.className : ''}`
      if (/skeleton|placeholder|shimmer|loading/i.test(identity)) skeletonElements += 1
      const semanticOverlay = element.matches(
        '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]',
      )
      const fixedOverlay = ['fixed', 'sticky'].includes(style.position)
      const area =
        Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0)) *
        Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
      const ratio = area / viewportArea
      if ((semanticOverlay || fixedOverlay) && ratio >= 0.08) overlayAreaRatio = Math.max(overlayAreaRatio, ratio)
    }

    let mutationCount = 0
    const target = document.body || document.documentElement
    const observer = new MutationObserver((records) => {
      mutationCount += records.length
    })
    if (target) observer.observe(target, { attributes: true, childList: true, characterData: true, subtree: true })
    await new Promise((resolve) => setTimeout(resolve, 300))
    observer.disconnect()

    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim()
    const main = document.querySelector('main, [role="main"]')
    const mainText = (main?.textContent || bodyText).replace(/\s+/g, ' ').trim()
    const meaningfulMedia = document.querySelectorAll('img[src], video, canvas, svg').length
    const captcha = Boolean(
      document.querySelector(
        'iframe[src*="recaptcha" i], iframe[src*="hcaptcha" i], iframe[src*="captcha" i], [data-sitekey], [id*="recaptcha" i], [class*="recaptcha" i], [id*="hcaptcha" i], [class*="hcaptcha" i], input[name*="captcha" i]',
      ),
    )
    const viewportWidth = Math.max(window.visualViewport?.width || window.innerWidth, 1)
    let contentWidth = viewportWidth
    const overflowStyleCache = new WeakMap<Element, CSSStyleDeclaration>()
    const overflowStyleFor = (element: Element): CSSStyleDeclaration => {
      const cached = overflowStyleCache.get(element)
      if (cached) return cached
      const style = getComputedStyle(element)
      overflowStyleCache.set(element, style)
      return style
    }
    const isInsideHorizontalContainer = (element: Element): boolean => {
      let ancestor = element.parentElement
      while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
        const style = overflowStyleFor(ancestor)
        if (
          ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX) &&
          (['hidden', 'clip'].includes(style.overflowX) || ancestor.scrollWidth > ancestor.clientWidth + 4)
        ) {
          return true
        }
        ancestor = ancestor.parentElement
      }
      return false
    }
    const fixedLayerCache = new WeakMap<Element, boolean>()
    fixedLayerCache.set(document.documentElement, overflowStyleFor(document.documentElement).position === 'fixed')
    for (const element of [document.body, ...[...document.body.querySelectorAll('*')].slice(0, 5_000)]) {
      const rect = element.getBoundingClientRect()
      const style = overflowStyleFor(element)
      const insideFixedLayer =
        style.position === 'fixed' || Boolean(element.parentElement && fixedLayerCache.get(element.parentElement))
      fixedLayerCache.set(element, insideFixedLayer)
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        insideFixedLayer ||
        Number.parseFloat(style.opacity || '1') <= 0 ||
        element.closest('[hidden], [aria-hidden="true"], [inert]') ||
        isInsideHorizontalContainer(element)
      ) {
        continue
      }
      if (rect.left < -4 || rect.right > viewportWidth + 4) {
        contentWidth = Math.max(contentWidth, rect.right, viewportWidth - rect.left)
      }
    }
    return {
      viewportWidth,
      viewportHeight: Math.max(window.visualViewport?.height || window.innerHeight, 1),
      contentWidth: Math.ceil(contentWidth),
      contentHeight: Math.max(root.scrollHeight, document.documentElement.scrollHeight),
      overlayAreaRatio,
      mutationCount,
      mainContentEmpty: mainText.length < 30 && bodyText.length < 80 && meaningfulMedia === 0,
      skeletonRatio: skeletonElements / Math.max(visibleElements, 1),
      fontsReady: !document.fonts || document.fonts.status === 'loaded',
      authWall: !!document.querySelector('input[type="password"], input[autocomplete="current-password"]'),
      captcha,
    }
  })

  const issues: PageHealthIssue[] = []
  const add = (issue: PageHealthIssue) => issues.push(issue)
  if (facts.overlayAreaRatio >= 0.08) {
    add({ code: 'large-overlay', severity: facts.overlayAreaRatio >= 0.45 ? 'error' : 'warning', recoverable: true })
  }
  if (facts.mainContentEmpty) add({ code: 'main-content-empty', severity: 'error', recoverable: true })
  if (facts.skeletonRatio >= 0.12) add({ code: 'skeleton-heavy', severity: 'warning', recoverable: true })
  if (!facts.fontsReady) add({ code: 'fonts-not-ready', severity: 'warning', recoverable: true })
  if (facts.mutationCount >= 30) {
    add({ code: 'dom-still-mutating', severity: 'warning', recoverable: true, detail: String(facts.mutationCount) })
  }
  if (facts.contentWidth > facts.viewportWidth + 4) {
    add({
      code: 'horizontal-overflow',
      severity: 'warning',
      recoverable: false,
      detail: `${facts.viewportWidth}/${facts.contentWidth}`,
    })
  }
  if (facts.authWall) add({ code: 'auth-wall', severity: 'error', recoverable: false })
  if (facts.captcha) add({ code: 'captcha', severity: 'error', recoverable: false })
  if (responseStatus === 429) add({ code: 'rate-limited', severity: 'error', recoverable: false })
  if (responseStatus !== undefined && responseStatus >= 400) {
    add({ code: 'error-page', severity: 'error', recoverable: false, detail: responseStatus?.toString() })
  }
  if (!sameOrigin(options.expectedUrl, currentUrl)) {
    add({ code: 'unexpected-navigation', severity: 'error', recoverable: false, detail: currentUrl })
  }

  const unusableCodes = new Set([
    'large-overlay',
    'main-content-empty',
    'auth-wall',
    'captcha',
    'error-page',
    'rate-limited',
    'unexpected-navigation',
  ])
  const status: PageHealthStatus = issues.some((issue) => issue.severity === 'error' && unusableCodes.has(issue.code))
    ? 'unusable'
    : issues.length > 0
      ? 'degraded'
      : 'healthy'
  const report: PageHealthReport = {
    status,
    checkedAt: new Date().toISOString(),
    recovered: false,
    attempts: 1,
    viewport: { width: facts.viewportWidth, height: facts.viewportHeight },
    content: { width: facts.contentWidth, height: facts.contentHeight },
    overlayAreaRatio: facts.overlayAreaRatio,
    mutationCount: facts.mutationCount,
    evidenceEligible: false,
    issues,
  }
  report.evidenceEligible = isPageHealthEvidenceEligible(report)
  return report
}

export async function ensurePageHealth(page: Page, options: PageHealthOptions): Promise<PageHealthReport> {
  const initial = await inspectPageHealth(page, options)
  if (!initial.issues.some((issue) => issue.recoverable)) return initial

  const controller = new AbortController()
  let forcedPageClose: Promise<void> | undefined
  const timeout = setTimeout(() => {
    controller.abort(new Error(`page health recovery exceeded ${HEALTH_RECOVERY_TIMEOUT_MS}ms`))
    // Playwright reload/evaluate calls do not consume our AbortSignal. Closing this capture page is the only
    // reliable way to cancel those operations and prevents them from changing state after this function returns.
    forcedPageClose = (async () => {
      if (page.isClosed()) return
      try {
        await page.close({ runBeforeUnload: false })
      } catch {
        // A concurrent browser/context shutdown has already made the page unusable.
      }
    })()
  }, HEALTH_RECOVERY_TIMEOUT_MS)
  try {
    const recovery = (async () => {
      await preparePageForExtraction(page, { recovery: true, signal: controller.signal })
      if (controller.signal.aborted) throw controller.signal.reason
      let recovered = await inspectPageHealth(page, options)
      let attempts = 2
      // A committed document can still be an empty transient shell. One ordinary reload is a bounded, site-agnostic
      // recovery for that state; access walls, HTTP errors, and unexpected navigation are never reloaded here.
      if (recovered.issues.some((issue) => issue.code === 'main-content-empty')) {
        const response = await page.reload({ waitUntil: 'commit', timeout: EMPTY_CONTENT_RELOAD_TIMEOUT_MS })
        await page
          .waitForFunction(
            () =>
              (document.contentType === 'text/html' || document.contentType === 'application/xhtml+xml') &&
              Boolean(document.body?.childElementCount),
            undefined,
            { timeout: EMPTY_CONTENT_RELOAD_TIMEOUT_MS },
          )
          .catch(() => {})
        if (controller.signal.aborted) throw controller.signal.reason
        await preparePageForExtraction(page, { recovery: true, signal: controller.signal })
        if (controller.signal.aborted) throw controller.signal.reason
        recovered = await inspectPageHealth(page, {
          ...options,
          responseStatus: response?.status() ?? options.responseStatus,
        })
        attempts = 3
      }
      return { ...recovered, attempts }
    })()
    // Do not race the recovery promise. On timeout the page is closed above; awaiting the promise guarantees that
    // reload/prepare work has settled before the caller can continue with another capture.
    const recovered = await recovery
    return { ...recovered, recovered: recovered.issues.length < initial.issues.length }
  } catch (error) {
    const timedOut = controller.signal.aborted
    if (forcedPageClose) await forcedPageClose
    const issues: PageHealthIssue[] = [
      ...initial.issues,
      {
        code: timedOut ? 'health-recovery-timeout' : 'health-recovery-failed',
        severity: 'warning',
        recoverable: false,
        detail: timedOut ? `${HEALTH_RECOVERY_TIMEOUT_MS}ms` : error instanceof Error ? error.message : String(error),
      },
    ]
    return {
      ...initial,
      ...(timedOut ? { status: 'unusable' as const } : {}),
      evidenceEligible: false,
      attempts: 2,
      issues,
    }
  } finally {
    clearTimeout(timeout)
  }
}
