import type { Page } from 'playwright-core'

export interface PagePreparationIssue {
  stage: 'fonts' | 'lazy-content' | 'obstructions' | 'settle' | 'animations'
  reason: string
}

export interface PagePreparationResult {
  dismissedObstructions: number
  hiddenObstructions: number
  issues: PagePreparationIssue[]
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function resetPageScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const root = document.documentElement
    const previousBehavior = root.style.getPropertyValue('scroll-behavior')
    const previousPriority = root.style.getPropertyPriority('scroll-behavior')
    root.style.setProperty('scroll-behavior', 'auto', 'important')
    window.scrollTo(0, 0)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    if (previousBehavior) root.style.setProperty('scroll-behavior', previousBehavior, previousPriority)
    else root.style.removeProperty('scroll-behavior')
  })
}

async function waitForFonts(page: Page, timeoutMs: number): Promise<void> {
  await Promise.race([
    page.evaluate(() => document.fonts?.ready ?? Promise.resolve()),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

async function triggerLazyContent(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const root = document.scrollingElement || document.documentElement
    const startX = window.scrollX
    const startY = window.scrollY
    const viewportStep = Math.max(400, Math.floor(window.innerHeight * 0.8))
    const maximumY = Math.min(Math.max(0, root.scrollHeight - window.innerHeight), 20_000)

    for (let y = 0; y < maximumY; y += viewportStep) {
      window.scrollTo(startX, Math.min(y + viewportStep, maximumY))
      await new Promise((resolve) => setTimeout(resolve, 35))
    }

    window.scrollTo(startX, startY)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

function hideConsentObstructionsInDocument(): number {
  const knownSelectors = [
    '#onetrust-banner-sdk',
    '#onetrust-consent-sdk',
    '.qc-cmp2-container',
    '.fc-consent-root',
    '[data-testid*="cookie" i]',
    '[data-testid*="consent" i]',
    '[id*="cookie" i]',
    '[class*="cookie" i]',
    '[id*="consent" i]',
    '[class*="consent" i]',
  ]
  const candidates = new Set<Element>()
  const roots: Array<Document | ShadowRoot> = [document]

  for (let index = 0; index < roots.length && roots.length < 24; index += 1) {
    const root = roots[index]
    for (const element of [...root.querySelectorAll('*')].slice(0, 4_000)) {
      if (element.shadowRoot) roots.push(element.shadowRoot)
      if (roots.length >= 24) break
    }
  }

  for (const root of roots) {
    for (const selector of knownSelectors) {
      try {
        root.querySelectorAll(selector).forEach((element) => candidates.add(element))
      } catch {
        // A hostile page can replace selector APIs. Other selectors still remain useful.
      }
    }
  }

  let hidden = 0
  for (const element of [...candidates].slice(0, 12)) {
    if (!(element instanceof HTMLElement)) continue
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const overlayLike =
      style.position === 'fixed' ||
      style.position === 'sticky' ||
      element.getAttribute('role') === 'dialog' ||
      element.getAttribute('aria-modal') === 'true' ||
      rect.width * rect.height >= window.innerWidth * window.innerHeight * 0.2
    if (!overlayLike || style.display === 'none' || style.visibility === 'hidden') continue
    element.dataset.imprintHiddenObstruction = 'true'
    element.style.setProperty('display', 'none', 'important')
    hidden += 1
  }

  if (hidden > 0) {
    document.documentElement.style.setProperty('overflow', 'auto', 'important')
    document.body?.style.setProperty('overflow', 'auto', 'important')
  }
  return hidden
}

async function hideConsentObstructions(page: Page): Promise<number> {
  let hidden = 0
  for (const frame of page.frames()) {
    try {
      hidden += await frame.evaluate(hideConsentObstructionsInDocument)
    } catch {
      // Cross-origin and navigating frames are allowed to disappear during preparation.
    }
  }
  return hidden
}

function dismissTransientObstructionsInDocument(): number {
  const candidateSelectors = [
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[aria-modal="true"]',
    'dialog[open]',
    '[class*="modal" i]',
    '[class*="popup" i]',
    '[class*="overlay" i]',
    '[class*="interstitial" i]',
    '[class*="campaign" i]',
    '[class*="promotion" i]',
    '[class*="activity" i]',
    '[id*="modal" i]',
    '[id*="popup" i]',
    '[id*="interstitial" i]',
    '[id*="campaign" i]',
    '[id*="promotion" i]',
    '[id*="activity" i]',
  ]
  const closeSelectors = [
    '[data-modal-close]',
    '[data-close]',
    '[data-dismiss="modal" i]',
    '[class*="close" i]',
    '[class*="dismiss" i]',
  ]
  const excludedIdentity =
    /(?:^|[\s_-])(?:auth|login|signin|signup|password|checkout|payment|paywall|cookie|consent|privacy)(?:$|[\s_-])/i
  const exactCloseSymbol = /^(?:×|✕|✖|x)$/i
  const inlineDismissalOperation =
    /(?:\.remove\s*\(|\.close\s*\(|style\.(?:display|visibility)\s*=|setAttribute\s*\(\s*['"](?:hidden|aria-hidden|open)['"]|removeAttribute\s*\(\s*['"]open['"])/i
  const roots: Array<Document | ShadowRoot> = [document]
  const candidates = new Set<Element>()

  for (let index = 0; index < roots.length && roots.length < 24; index += 1) {
    const root = roots[index]
    const elements = [...root.querySelectorAll('*')].slice(0, 4_000)
    for (const element of elements) {
      if (element.shadowRoot) roots.push(element.shadowRoot)
      if (roots.length >= 24) break
    }
    for (const selector of candidateSelectors) {
      try {
        root.querySelectorAll(selector).forEach((element) => candidates.add(element))
      } catch {
        // Continue with the remaining selectors when a page patches selector APIs.
      }
    }
    for (const element of elements) {
      try {
        const style = getComputedStyle(element)
        if (style.position === 'fixed' || style.position === 'sticky') candidates.add(element)
      } catch {
        // Detached elements can disappear while the page is settling.
      }
    }
  }

  const isVisible = (element: Element): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number.parseFloat(style.opacity || '1') > 0.01 &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight
    )
  }
  const rootsWithin = (container: HTMLElement): Array<HTMLElement | ShadowRoot> => {
    const nestedRoots: Array<HTMLElement | ShadowRoot> = [container]
    for (let index = 0; index < nestedRoots.length && nestedRoots.length < 16; index += 1) {
      for (const element of [...nestedRoots[index].querySelectorAll('*')].slice(0, 2_000)) {
        if (element.shadowRoot) nestedRoots.push(element.shadowRoot)
        if (nestedRoots.length >= 16) break
      }
    }
    return nestedRoots
  }

  let dismissed = 0
  for (const candidate of [...candidates].slice(0, 80)) {
    if (!isVisible(candidate)) continue
    const style = getComputedStyle(candidate)
    const rect = candidate.getBoundingClientRect()
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight)
    const areaRatio = (rect.width * rect.height) / viewportArea
    const semanticModal = candidate.matches('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]')
    const positionedOverlay = (style.position === 'fixed' || style.position === 'sticky') && areaRatio >= 0.08
    if (!semanticModal && !positionedOverlay) continue

    const candidateRoots = rootsWithin(candidate)
    const surfaceIdentity = [
      candidate.id,
      typeof candidate.className === 'string' ? candidate.className : '',
      candidate.getAttribute('data-variant') || '',
      candidate.getAttribute('data-intent') || '',
    ].join(' ')
    const containsSensitiveForm = candidateRoots.some((root) =>
      Boolean(
        root.querySelector(
          'input[type="password"], input[autocomplete="current-password"], input[autocomplete="one-time-code"], form[action*="auth" i], form[action*="login" i], form[action*="signin" i], form[action*="checkout" i], form[action*="payment" i]',
        ),
      ),
    )
    if (excludedIdentity.test(surfaceIdentity) || containsSensitiveForm) continue

    const closeCandidates = new Set<Element>()
    for (const root of candidateRoots) {
      for (const selector of closeSelectors) {
        try {
          root.querySelectorAll(selector).forEach((element) => closeCandidates.add(element))
        } catch {
          // Keep searching other close affordances.
        }
      }
      root.querySelectorAll('button, [role="button"]').forEach((element) => {
        if (exactCloseSymbol.test((element.textContent || '').trim())) closeCandidates.add(element)
      })
      root.querySelectorAll('button[onclick], [role="button"][onclick], input[onclick]').forEach((element) => {
        if (inlineDismissalOperation.test(element.getAttribute('onclick') || '')) closeCandidates.add(element)
      })
    }

    const closeButton = [...closeCandidates].find((element) => isVisible(element))
    if (!closeButton) continue
    try {
      closeButton.click()
      dismissed += 1
    } catch {
      // Never let a hostile or rapidly changing DOM abort extraction.
    }
    if (dismissed >= 4) break
  }

  if (dismissed > 0) {
    document.documentElement.style.setProperty('overflow', 'auto', 'important')
    document.body?.style.setProperty('overflow', 'auto', 'important')
  }
  return dismissed
}

async function dismissTransientObstructions(page: Page): Promise<number> {
  let dismissed = 0
  for (const frame of page.frames()) {
    try {
      dismissed += await frame.evaluate(dismissTransientObstructionsInDocument)
    } catch {
      // Cross-origin and navigating frames are allowed to disappear during preparation.
    }
  }
  return dismissed
}

async function waitForDomQuiet(page: Page, maximumMs = 1_800, quietMs = 250): Promise<void> {
  await page.evaluate(
    ({ maximumMs, quietMs }) =>
      new Promise<void>((resolve) => {
        const target = document.body || document.documentElement
        if (!target) {
          resolve()
          return
        }

        let finished = false
        let quietTimer: number | undefined
        const observer = new MutationObserver(() => {
          if (quietTimer !== undefined) window.clearTimeout(quietTimer)
          quietTimer = window.setTimeout(finish, quietMs)
        })
        const finish = () => {
          if (finished) return
          finished = true
          observer.disconnect()
          if (quietTimer !== undefined) window.clearTimeout(quietTimer)
          if (maximumTimer !== undefined) window.clearTimeout(maximumTimer)
          resolve()
        }

        observer.observe(target, { attributes: true, childList: true, characterData: true, subtree: true })
        quietTimer = window.setTimeout(finish, quietMs)
        const maximumTimer = window.setTimeout(finish, maximumMs)
      }),
    { maximumMs, quietMs },
  )
}

/**
 * Prepare a loaded page for deterministic extraction without accepting consent
 * or otherwise persisting changes to the target website.
 */
export async function preparePageForExtraction(
  page: Page,
  options: { recovery?: boolean; signal?: AbortSignal } = {},
): Promise<PagePreparationResult> {
  const issues: PagePreparationIssue[] = []
  let dismissedObstructions = 0
  let hiddenObstructions = 0
  const active = () => !options.signal?.aborted
  const clearObstructions = async () => {
    if (!active()) throw options.signal?.reason
    hiddenObstructions += await hideConsentObstructions(page)
    dismissedObstructions += await dismissTransientObstructions(page)
  }

  try {
    if (!active()) throw options.signal?.reason
    await waitForFonts(page, options.recovery ? 1_500 : 5_000)
  } catch (error) {
    issues.push({ stage: 'fonts', reason: reasonFrom(error) })
  }
  try {
    await clearObstructions()
  } catch (error) {
    issues.push({ stage: 'obstructions', reason: reasonFrom(error) })
  }
  try {
    if (!active()) throw options.signal?.reason
    if (!options.recovery) await triggerLazyContent(page)
  } catch (error) {
    issues.push({ stage: 'lazy-content', reason: reasonFrom(error) })
  }
  try {
    await clearObstructions()
  } catch (error) {
    issues.push({ stage: 'obstructions', reason: reasonFrom(error) })
  }
  try {
    if (!active()) throw options.signal?.reason
    await waitForDomQuiet(page, options.recovery ? 1_000 : 1_800, options.recovery ? 250 : 500)
  } catch (error) {
    issues.push({ stage: 'settle', reason: reasonFrom(error) })
  }

  try {
    if (!active()) throw options.signal?.reason
    const hiddenAfterSettle = await hideConsentObstructions(page)
    const dismissedAfterSettle = await dismissTransientObstructions(page)
    hiddenObstructions += hiddenAfterSettle
    dismissedObstructions += dismissedAfterSettle
    if (hiddenAfterSettle + dismissedAfterSettle > 0) await waitForDomQuiet(page, 1_000, 250)
  } catch (error) {
    issues.push({ stage: 'obstructions', reason: reasonFrom(error) })
  }

  return { dismissedObstructions, hiddenObstructions, issues }
}

/** Freeze CSS animations after motion tokens have been observed. Transitions are
 * intentionally left intact so their durations remain available to extraction. */
export async function freezePageAnimations(page: Page): Promise<PagePreparationIssue | null> {
  try {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-delay: 0ms !important;
          animation-duration: 1ms !important;
          animation-fill-mode: forwards !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
        }
      `,
    })
    await page.waitForTimeout(30)
    return null
  } catch (error) {
    return { stage: 'animations', reason: reasonFrom(error) }
  }
}
