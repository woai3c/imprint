import type { Page, Route } from 'playwright-core'

import type { PageEvidenceSnapshot, PageInteractionCandidateSnapshot } from './page-extractor.js'

export interface InteractionObservationSnapshot {
  key: string
  sectionKey: string
  targetKey: string
  targetComponentKey?: string
  driver: 'click'
  triggerKind: 'tab' | 'disclosure' | 'dialog'
  before: Record<string, string>
  after: Record<string, string>
  changedProperties: string[]
  transition?: {
    duration?: string
    easing?: string
    properties?: string[]
  }
}

function diffProperties(before: Record<string, string>, after: Record<string, string>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key])
}

async function readTargetState(
  page: Page,
  candidate: PageInteractionCandidateSnapshot,
): Promise<Record<string, string> | null> {
  return page.evaluate((input) => {
    const target = document.querySelector(input.locator)
    if (!(target instanceof HTMLElement)) return null
    const controlledId = target.getAttribute('aria-controls')
    const controlled = controlledId ? document.getElementById(controlledId) : null
    const targetStyle = getComputedStyle(target)
    const controlledStyle = controlled ? getComputedStyle(controlled) : null
    return {
      ariaExpanded: target.getAttribute('aria-expanded') || '',
      ariaSelected: target.getAttribute('aria-selected') || '',
      ariaPressed: target.getAttribute('aria-pressed') || '',
      color: targetStyle.color,
      backgroundColor: targetStyle.backgroundColor,
      borderColor: targetStyle.borderTopColor,
      opacity: targetStyle.opacity,
      transform: targetStyle.transform,
      controlledHidden: controlled?.hasAttribute('hidden') ? 'true' : 'false',
      controlledAriaHidden: controlled?.getAttribute('aria-hidden') || '',
      controlledDisplay: controlledStyle?.display || '',
      controlledVisibility: controlledStyle?.visibility || '',
      controlledOpacity: controlledStyle?.opacity || '',
    }
  }, candidate)
}

async function clickCandidate(page: Page, candidate: PageInteractionCandidateSnapshot): Promise<boolean> {
  const originalUrl = page.url()
  const locator = page.locator(candidate.locator)
  if ((await locator.count()) !== 1) return false
  let unsafeSideEffect = false
  const handleRequest = (request: { method(): string }) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) unsafeSideEffect = true
  }
  const blockWriteRequest = async (route: Route) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      unsafeSideEffect = true
      await route.abort()
      return
    }
    await route.continue()
  }
  const handleDownload = () => {
    unsafeSideEffect = true
  }
  const handlePopup = (popup: Page) => {
    unsafeSideEffect = true
    void popup.close()
  }
  const handleDialog = (dialog: { dismiss(): Promise<void> }) => {
    unsafeSideEffect = true
    void dialog.dismiss()
  }
  page.on('request', handleRequest)
  page.on('download', handleDownload)
  page.on('popup', handlePopup)
  page.on('dialog', handleDialog)
  await page.route('**/*', blockWriteRequest)

  try {
    await locator.click({ timeout: 1500 })
    await page.waitForTimeout(120)
  } catch {
    return false
  } finally {
    page.off('request', handleRequest)
    page.off('download', handleDownload)
    page.off('popup', handlePopup)
    page.off('dialog', handleDialog)
    await page.unroute('**/*', blockWriteRequest)
  }

  if (page.url() !== originalUrl || unsafeSideEffect) {
    if (page.url() !== originalUrl) {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 3000 }).catch(() => {})
    } else {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 3000 }).catch(() => {})
    }
    return false
  }
  return true
}

function statesMatch(first: Record<string, string>, second: Record<string, string> | null): boolean {
  if (!second) return false
  return [...new Set([...Object.keys(first), ...Object.keys(second)])].every((key) => first[key] === second[key])
}

async function restoreCandidate(
  page: Page,
  candidate: PageInteractionCandidateSnapshot,
  before: Record<string, string>,
): Promise<boolean> {
  if (candidate.kind === 'tab' && candidate.restoreLocator) {
    await page
      .locator(candidate.restoreLocator)
      .click({ timeout: 1500 })
      .catch(() => {})
  } else if (candidate.kind === 'dialog') {
    await page.keyboard.press('Escape').catch(() => {})
  } else {
    await clickCandidate(page, candidate)
  }
  await page.waitForTimeout(120)
  return statesMatch(before, await readTargetState(page, candidate))
}

export async function observeSafeInteractions(
  page: Page,
  snapshot: PageEvidenceSnapshot,
  maxActions = 4,
  totalBudgetMs = 6_000,
): Promise<InteractionObservationSnapshot[]> {
  const observations: InteractionObservationSnapshot[] = []
  const deadline = Date.now() + totalBudgetMs

  for (const candidate of snapshot.interactionCandidates.slice(0, maxActions)) {
    if (Date.now() >= deadline) break
    const before = await readTargetState(page, candidate)
    if (!before) continue
    if (!(await clickCandidate(page, candidate))) continue
    const after = await readTargetState(page, candidate)
    if (!after) continue
    const changedProperties = diffProperties(before, after)

    if (changedProperties.length > 0) {
      const transition = await page.evaluate((input) => {
        const target = document.querySelector(input.locator)
        if (!(target instanceof HTMLElement)) return undefined
        const style = getComputedStyle(target)
        return {
          duration: style.transitionDuration,
          easing: style.transitionTimingFunction,
          properties: style.transitionProperty.split(',').map((value) => value.trim()),
        }
      }, candidate)
      observations.push({
        key: candidate.key,
        sectionKey: candidate.sectionKey,
        targetKey: candidate.key,
        targetComponentKey: candidate.componentKey,
        driver: 'click',
        triggerKind: candidate.kind,
        before,
        after,
        changedProperties,
        transition,
      })
    }

    if (!(await restoreCandidate(page, candidate, before))) {
      const reloaded = await page
        .reload({ waitUntil: 'domcontentloaded', timeout: 3000 })
        .then(() => true)
        .catch(() => false)
      if (!reloaded) break
    }
    if (Date.now() >= deadline) break
  }

  return observations
}
