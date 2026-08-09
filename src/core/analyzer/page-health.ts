import type { Page } from 'playwright-core'

import { preparePageForExtraction } from './page-preparer.js'

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
  issues: PageHealthIssue[]
}

interface PageHealthOptions {
  expectedUrl: string
  responseStatus?: number
}

function sameOrigin(first: string, second: string): boolean {
  try {
    return new URL(first).origin === new URL(second).origin
  } catch {
    return first === second
  }
}

export async function inspectPageHealth(page: Page, options: PageHealthOptions): Promise<PageHealthReport> {
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
    const pageIdentity = `${document.title} ${bodyText.slice(0, 4_000)}`
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      contentWidth: Math.max(root.scrollWidth, document.documentElement.scrollWidth),
      contentHeight: Math.max(root.scrollHeight, document.documentElement.scrollHeight),
      overlayAreaRatio,
      mutationCount,
      mainContentEmpty: mainText.length < 30 && bodyText.length < 80 && meaningfulMedia === 0,
      skeletonRatio: skeletonElements / Math.max(visibleElements, 1),
      fontsReady: !document.fonts || document.fonts.status === 'loaded',
      authWall: !!document.querySelector('input[type="password"], input[autocomplete="current-password"]'),
      captcha: bodyText.length < 2_000 && /captcha|recaptcha|hcaptcha|验证码|人机验证|robot check/i.test(pageIdentity),
      rateLimited:
        bodyText.length < 2_000 && /too many requests|rate limit|访问过于频繁|请求过多|稍后再试/i.test(pageIdentity),
      errorPage:
        bodyText.length < 2_000 &&
        /page not found|server error|service unavailable|页面不存在|系统错误|服务不可用/i.test(pageIdentity),
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
  if (facts.rateLimited || responseStatus === 429) add({ code: 'rate-limited', severity: 'error', recoverable: false })
  if (facts.errorPage || (responseStatus !== undefined && responseStatus >= 400)) {
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
  return {
    status,
    checkedAt: new Date().toISOString(),
    recovered: false,
    attempts: 1,
    viewport: { width: facts.viewportWidth, height: facts.viewportHeight },
    content: { width: facts.contentWidth, height: facts.contentHeight },
    overlayAreaRatio: facts.overlayAreaRatio,
    mutationCount: facts.mutationCount,
    issues,
  }
}

export async function ensurePageHealth(page: Page, options: PageHealthOptions): Promise<PageHealthReport> {
  const initial = await inspectPageHealth(page, options)
  if (!initial.issues.some((issue) => issue.recoverable)) return initial

  await preparePageForExtraction(page, { recovery: true })
  const recovered = await inspectPageHealth(page, options)
  return { ...recovered, recovered: recovered.issues.length < initial.issues.length, attempts: 2 }
}
