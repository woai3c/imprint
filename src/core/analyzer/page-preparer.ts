import type { Page } from 'playwright-core'

export interface PagePreparationIssue {
  stage: 'fonts' | 'lazy-content' | 'obstructions' | 'settle' | 'animations'
  reason: string
}

export interface PagePreparationResult {
  hiddenObstructions: number
  issues: PagePreparationIssue[]
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

async function hideConsentObstructions(page: Page): Promise<number> {
  return page.evaluate(() => {
    const knownSelectors = [
      '#onetrust-banner-sdk',
      '#onetrust-consent-sdk',
      '.qc-cmp2-container',
      '.fc-consent-root',
      '[data-testid*="cookie" i]',
      '[data-testid*="consent" i]',
      '[aria-label*="cookie" i]',
      '[aria-label*="consent" i]',
      '[id*="cookie" i]',
      '[class*="cookie" i]',
      '[id*="consent" i]',
      '[class*="consent" i]',
    ]
    const consentText =
      /\b(?:cookie|cookies|consent|privacy preferences|privacy choices|accept all|manage preferences)\b|隐私|私隱|同意|쿠키|クッキー|confidentialité/i
    const candidates = new Set<Element>()

    for (const selector of knownSelectors) {
      try {
        document.querySelectorAll(selector).forEach((element) => candidates.add(element))
      } catch {
        // A hostile page can replace selector APIs. Other selectors still remain useful.
      }
    }
    document.querySelectorAll('[role="dialog"], [aria-modal="true"]').forEach((element) => {
      if (consentText.test((element.textContent || '').slice(0, 2_000))) candidates.add(element)
    })

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
  })
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
export async function preparePageForExtraction(page: Page): Promise<PagePreparationResult> {
  const issues: PagePreparationIssue[] = []
  let hiddenObstructions = 0

  try {
    await waitForFonts(page, 5_000)
  } catch (error) {
    issues.push({ stage: 'fonts', reason: reasonFrom(error) })
  }
  try {
    hiddenObstructions = await hideConsentObstructions(page)
  } catch (error) {
    issues.push({ stage: 'obstructions', reason: reasonFrom(error) })
  }
  try {
    await triggerLazyContent(page)
  } catch (error) {
    issues.push({ stage: 'lazy-content', reason: reasonFrom(error) })
  }
  try {
    await waitForDomQuiet(page)
  } catch (error) {
    issues.push({ stage: 'settle', reason: reasonFrom(error) })
  }

  return { hiddenObstructions, issues }
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
