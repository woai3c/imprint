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

export interface DocumentObstructionInspection {
  dismissedObstructions: number
  overlayAreaRatio: number
  blockingOverlayAreaRatio: number
  partialOverlayAreaRatio: number
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function resetPageScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const root = document.documentElement
    if (!root) return
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

/**
 * Classify viewport obstructions inside a browser document. Keep this function self-contained because Playwright
 * serializes it for page evaluation. Health inspection and preparation intentionally share this exact classifier.
 */
export function inspectDocumentObstructionsInBrowser(options: { dismiss: boolean }): DocumentObstructionInspection {
  const candidateSelectors = ['[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]', 'dialog[open]']
  const contentSelectors = 'main, [role="main"], article, [role="article"], [role="document"], section'
  const chromeSelectors = 'header, nav, [role="banner"], [role="navigation"], footer, [role="contentinfo"]'
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
        if (style.position === 'fixed') candidates.add(element)
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
  const composedContains = (container: Element, target: Node): boolean => {
    let current: Node | null = target
    while (current) {
      if (current === container) return true
      if (current instanceof Element && current.assignedSlot) {
        current = current.assignedSlot
        continue
      }
      if (current.parentNode) {
        current = current.parentNode
        continue
      }
      const root = current.getRootNode()
      current = root instanceof ShadowRoot ? root.host : null
    }
    return false
  }
  const hasComposedMatch = (element: Element, selector: string): boolean => {
    let current: Element | null = element
    while (current) {
      if (current.matches(selector)) return true
      if (current.assignedSlot) {
        current = current.assignedSlot
        continue
      }
      if (current.parentElement) {
        current = current.parentElement
        continue
      }
      const root = current.getRootNode()
      current = root instanceof ShadowRoot ? root.host : null
    }
    return false
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

  const meaningfulContent = new Set<HTMLElement>()
  const visibleChrome = new Set<HTMLElement>()
  for (const root of roots) {
    for (const element of root.querySelectorAll(contentSelectors)) {
      if (!isVisible(element)) continue
      const textLength = (element.textContent || '').replace(/\s+/g, ' ').trim().length
      const minimumLength = element.matches('main, [role="main"], [role="document"]') ? 30 : 80
      if (textLength >= minimumLength) meaningfulContent.add(element)
    }
    for (const element of root.querySelectorAll(chromeSelectors)) {
      if (isVisible(element)) visibleChrome.add(element)
    }
  }
  const meaningfulTextOutside = (container: HTMLElement, excluded: HTMLElement): number => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let length = 0
    for (let node = walker.nextNode(); node && length < 80; node = walker.nextNode()) {
      if (composedContains(excluded, node)) continue
      const parent = node.parentElement
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
      if (!parent || !text || parent.matches('script, style, template, noscript') || !isVisible(parent)) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      const rect = range.getBoundingClientRect()
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight
      ) {
        length += text.length
      }
    }
    return length
  }
  const hasMeaningfulMediaOutside = (container: HTMLElement, excluded: HTMLElement): boolean =>
    [...container.querySelectorAll('img[src], video, canvas, svg')].some((element) => {
      if (composedContains(excluded, element)) return false
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number.parseFloat(style.opacity || '1') > 0.02 &&
        rect.width * rect.height >= 4_096 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight
      )
    })

  let dismissed = 0
  let overlayAreaRatio = 0
  let blockingOverlayAreaRatio = 0
  let partialOverlayAreaRatio = 0
  for (const candidate of [...candidates].slice(0, 80)) {
    if (!isVisible(candidate)) continue
    const style = getComputedStyle(candidate)
    const rect = candidate.getBoundingClientRect()
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight)
    const area =
      Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0)) *
      Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
    const areaRatio = area / viewportArea
    const semanticModal = candidate.matches('[aria-modal="true"], dialog:modal')
    const semanticDialog = candidate.matches('[role="dialog"], [role="alertdialog"], dialog[open]')
    const fixedLayer = style.position === 'fixed'
    const centerX = window.innerWidth / 2
    const centerY = window.innerHeight / 2
    const coversCenter = rect.left <= centerX && rect.right >= centerX && rect.top <= centerY && rect.bottom >= centerY
    const root = candidate.getRootNode()
    const centerHit =
      coversCenter && 'elementFromPoint' in root
        ? (root as Document | ShadowRoot).elementFromPoint(centerX, centerY)
        : coversCenter
          ? document.elementFromPoint(centerX, centerY)
          : null
    const ownsCenterHit = Boolean(centerHit && composedContains(candidate, centerHit))
    const semanticPageChrome = hasComposedMatch(candidate, chromeSelectors)
    const ownedMeaningfulContent = [...meaningfulContent].filter((element) => composedContains(candidate, element))
    const ownsPrimaryDocumentContent = ownedMeaningfulContent.some((element) =>
      element.matches('main, [role="main"], [role="document"]'),
    )
    const ownsArticleWithChrome =
      ownedMeaningfulContent.some((element) => element.matches('article, [role="article"]')) &&
      [...visibleChrome].some((element) => composedContains(candidate, element))
    const hasComparableContentOutside = [...meaningfulContent].some((element) => {
      if (composedContains(candidate, element)) return false
      if (!composedContains(element, candidate)) return true
      return meaningfulTextOutside(element, candidate) >= 80 || hasMeaningfulMediaOutside(element, candidate)
    })
    const fixedPageLayoutShell =
      fixedLayer &&
      areaRatio >= 0.8 &&
      (ownsPrimaryDocumentContent || ownsArticleWithChrome) &&
      !hasComparableContentOutside &&
      !semanticDialog &&
      !semanticModal
    const touchesHorizontalEdge = rect.left <= 2 || rect.right >= window.innerWidth - 2
    const touchesVerticalEdge = rect.top <= 2 || rect.bottom >= window.innerHeight - 2
    const edgeAnchoredChrome =
      (touchesVerticalEdge && rect.width >= window.innerWidth * 0.75 && rect.height <= window.innerHeight * 0.28) ||
      (touchesHorizontalEdge && rect.height >= window.innerHeight * 0.75 && rect.width <= window.innerWidth * 0.28)
    const semanticEdgeChrome = semanticPageChrome && edgeAnchoredChrome
    // Non-modal dialogs and fixed application shells may contain legitimate close controls. Only explicit modals or
    // large, center-blocking generic fixed layers are safe enough to mutate during preparation.
    const blocking =
      semanticModal ||
      (!semanticDialog &&
        !fixedPageLayoutShell &&
        !semanticEdgeChrome &&
        coversCenter &&
        ownsCenterHit &&
        fixedLayer &&
        areaRatio >= 0.3)

    if (blocking) {
      blockingOverlayAreaRatio = Math.max(blockingOverlayAreaRatio, areaRatio)
    } else if (!fixedPageLayoutShell && areaRatio >= 0.08 && !semanticEdgeChrome) {
      partialOverlayAreaRatio = Math.max(partialOverlayAreaRatio, areaRatio)
    }
    if (!fixedPageLayoutShell) overlayAreaRatio = Math.max(overlayAreaRatio, areaRatio)
    if (!options.dismiss || !blocking) continue

    const candidateRoots = rootsWithin(candidate)
    const containsSensitiveForm = candidateRoots.some((root) =>
      Boolean(
        root.querySelector(
          'input[type="password"], input[autocomplete="username"], input[autocomplete="current-password"], input[autocomplete="new-password"], input[autocomplete="one-time-code"]',
        ),
      ),
    )
    if (containsSensitiveForm) continue

    const closeCandidates = new Set<Element>()
    for (const root of candidateRoots) {
      root
        .querySelectorAll('form[method="dialog"] button, button[command="close"], [role="button"][command="close"]')
        .forEach((element) => closeCandidates.add(element))
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
  return {
    dismissedObstructions: dismissed,
    overlayAreaRatio,
    blockingOverlayAreaRatio,
    partialOverlayAreaRatio,
  }
}

async function dismissTransientObstructions(page: Page): Promise<number> {
  let dismissed = 0
  for (const frame of page.frames()) {
    try {
      const inspection = await frame.evaluate(inspectDocumentObstructionsInBrowser, { dismiss: true })
      dismissed += inspection.dismissedObstructions
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
  const hiddenObstructions = 0
  const active = () => !options.signal?.aborted
  const clearObstructions = async () => {
    if (!active()) throw options.signal?.reason
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
    const dismissedAfterSettle = await dismissTransientObstructions(page)
    dismissedObstructions += dismissedAfterSettle
    if (dismissedAfterSettle > 0) await waitForDomQuiet(page, 1_000, 250)
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
