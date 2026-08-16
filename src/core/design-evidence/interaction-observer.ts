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

async function settleBeforeDeadline<T>(operation: Promise<T>, deadline: number, fallback: T): Promise<T> {
  const remaining = deadline - Date.now()
  if (remaining <= 0) return fallback
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), remaining)
      }),
    ])
  } catch {
    return fallback
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function readTargetState(
  page: Page,
  candidate: PageInteractionCandidateSnapshot,
  deadline = Number.POSITIVE_INFINITY,
): Promise<Record<string, string> | null> {
  const remaining = deadline - Date.now()
  if (remaining <= 0) return null
  return Promise.race([
    page.evaluate((input) => {
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
    }, candidate),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining)),
  ])
}

async function waitForTargetMotion(
  page: Page,
  candidate: PageInteractionCandidateSnapshot,
  deadline: number,
): Promise<void> {
  const motionDeadline = Math.min(deadline, Date.now() + 600)
  await settleBeforeDeadline(
    page.evaluate(async (input) => {
      const target = document.querySelector(input.locator)
      if (!(target instanceof HTMLElement)) return
      const controlledId = target.getAttribute('aria-controls')
      const controlled = controlledId ? document.getElementById(controlledId) : null
      const animations = [
        ...new Set([target, controlled].flatMap((element) => element?.getAnimations({ subtree: true }) || [])),
      ].filter((animation) => animation.pending || animation.playState === 'running')
      await Promise.allSettled(animations.map((animation) => animation.finished))
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    }, candidate),
    motionDeadline,
    undefined,
  )
}

async function clickCandidate(
  page: Page,
  candidate: PageInteractionCandidateSnapshot,
  deadline = Number.POSITIVE_INFINITY,
): Promise<boolean> {
  const originalUrl = page.url()
  const locator = page.locator(candidate.locator)
  if ((await settleBeforeDeadline(locator.count(), deadline, 0)) !== 1) return false
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
  let routeRegistered = false

  try {
    routeRegistered = await settleBeforeDeadline(
      page.route('**/*', blockWriteRequest).then(() => true),
      deadline,
      false,
    )
    if (!routeRegistered) return false
    const clickBudget = Math.min(700, deadline - Date.now())
    if (clickBudget <= 0) return false
    await locator.click({ timeout: clickBudget })
    await page.waitForTimeout(Math.min(120, Math.max(0, deadline - Date.now())))
  } catch {
    return false
  } finally {
    page.off('request', handleRequest)
    page.off('download', handleDownload)
    page.off('popup', handlePopup)
    page.off('dialog', handleDialog)
    if (routeRegistered) {
      await settleBeforeDeadline(page.unroute('**/*', blockWriteRequest), deadline, undefined)
    }
  }

  if (page.url() !== originalUrl || unsafeSideEffect) {
    const recoveryBudget = Math.min(750, Math.max(1, deadline - Date.now()))
    if (page.url() !== originalUrl) {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: recoveryBudget }).catch(() => {})
    } else {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: recoveryBudget }).catch(() => {})
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
  deadline: number,
): Promise<boolean> {
  if (Date.now() >= deadline) return false
  if (candidate.kind === 'tab' && candidate.restoreLocator) {
    await page
      .locator(candidate.restoreLocator)
      .click({ timeout: Math.min(600, Math.max(1, deadline - Date.now())) })
      .catch(() => {})
  } else if (candidate.kind === 'dialog') {
    await settleBeforeDeadline(page.keyboard.press('Escape'), deadline, undefined)
  } else {
    await clickCandidate(page, candidate, deadline)
  }
  await waitForTargetMotion(page, candidate, deadline)
  return statesMatch(before, await readTargetState(page, candidate, deadline))
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
    if (deadline - Date.now() < 1_500) break
    const candidateDeadline = Math.min(deadline, Date.now() + 1_500)
    const before = await readTargetState(page, candidate, candidateDeadline)
    if (!before) continue
    if (!(await clickCandidate(page, candidate, candidateDeadline))) continue
    await waitForTargetMotion(page, candidate, candidateDeadline)
    const after = await readTargetState(page, candidate, candidateDeadline)
    if (!after) continue
    const changedProperties = diffProperties(before, after)

    if (changedProperties.length > 0) {
      const transition = await settleBeforeDeadline(
        page.evaluate((input) => {
          const target = document.querySelector(input.locator)
          if (!(target instanceof HTMLElement)) return undefined
          const style = getComputedStyle(target)
          return {
            duration: style.transitionDuration,
            easing: style.transitionTimingFunction,
            properties: style.transitionProperty.split(',').map((value) => value.trim()),
          }
        }, candidate),
        candidateDeadline,
        undefined,
      )
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

    if (!(await restoreCandidate(page, candidate, before, candidateDeadline))) {
      const reloadBudget = Math.min(750, Math.max(1, deadline - Date.now()))
      const reloaded = await page
        .reload({ waitUntil: 'domcontentloaded', timeout: reloadBudget })
        .then(() => true)
        .catch(() => false)
      if (!reloaded) break
    }
    if (Date.now() >= deadline) break
  }

  return observations
}
