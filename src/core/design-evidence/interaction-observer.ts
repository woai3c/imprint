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
  return new Promise<T>((resolve) => {
    let settled = false
    const finish = (value: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(fallback), remaining)
    void operation.then(finish, () => finish(fallback))
  })
}

async function readTargetState(
  page: Page,
  candidate: PageInteractionCandidateSnapshot,
  deadline = Number.POSITIVE_INFINITY,
): Promise<Record<string, string> | null> {
  return settleBeforeDeadline(
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
    deadline,
    null,
  )
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
  let mainFrameNavigated = false
  const handleRequest = (request: { method(): string }) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) unsafeSideEffect = true
  }
  const blockWriteRequest = async (route: Route) => {
    const request = route.request()
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      unsafeSideEffect = true
      await route.abort().catch(() => {})
      return
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      unsafeSideEffect = true
      await route.abort().catch(() => {})
      return
    }
    await route.continue().catch(() => {})
  }
  const handleDownload = () => {
    unsafeSideEffect = true
  }
  const handlePopup = (popup: Page) => {
    unsafeSideEffect = true
    void popup.close().catch(() => {})
  }
  const handleDialog = (dialog: { dismiss(): Promise<void> }) => {
    unsafeSideEffect = true
    void dialog.dismiss().catch(() => {})
  }
  const handleFrameNavigation = (frame: ReturnType<Page['mainFrame']>) => {
    if (frame === page.mainFrame()) mainFrameNavigated = true
  }
  page.on('request', handleRequest)
  page.on('download', handleDownload)
  page.on('popup', handlePopup)
  page.on('dialog', handleDialog)
  page.on('framenavigated', handleFrameNavigation)
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
    page.off('framenavigated', handleFrameNavigation)
    if (routeRegistered) {
      await settleBeforeDeadline(page.unroute('**/*', blockWriteRequest), deadline, undefined)
    }
  }

  if (page.url() !== originalUrl || mainFrameNavigated || unsafeSideEffect) {
    if ((page.url() !== originalUrl || mainFrameNavigated) && !page.isClosed()) {
      const recoveryBudget = Math.min(1_500, Math.max(1, deadline - Date.now()))
      // History is not a reliable recovery primitive here. A script can replace the current entry, and an aborted
      // main-frame navigation can leave the previous entry as about:blank. Reload the exact observed document so a
      // rejected probe cannot change the identity used by later capture stages.
      await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: recoveryBudget }).catch(() => {})
    }
    return false
  }
  return true
}

function statesMatch(first: Record<string, string>, second: Record<string, string> | null): boolean {
  if (!second) return false
  return [...new Set([...Object.keys(first), ...Object.keys(second)])].every((key) => first[key] === second[key])
}

async function readPageGeometry(
  page: Page,
  deadline: number,
): Promise<{ width: number; height: number; url: string } | null> {
  return settleBeforeDeadline(
    page.evaluate(() => ({
      width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, innerWidth),
      height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, innerHeight),
      url: location.href,
    })),
    deadline,
    null,
  )
}

function pageGeometryMatches(
  first: { width: number; height: number; url: string } | null,
  second: { width: number; height: number; url: string } | null,
): boolean {
  return Boolean(
    first &&
    second &&
    first.url === second.url &&
    Math.abs(first.width - second.width) <= 4 &&
    Math.abs(first.height - second.height) <= 8,
  )
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
  await settleBeforeDeadline(page.mouse.move(0, 0), deadline, undefined)
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
  const observedUrl = page.url()

  for (const candidate of snapshot.interactionCandidates.slice(0, maxActions)) {
    if (page.isClosed() || page.url() !== observedUrl) break
    if (deadline - Date.now() < 1_500) break
    const candidateDeadline = Math.min(deadline, Date.now() + 1_800)
    const before = await readTargetState(page, candidate, candidateDeadline)
    const pageGeometryBefore = await readPageGeometry(page, candidateDeadline)
    if (!before) continue
    if (!(await clickCandidate(page, candidate, candidateDeadline))) continue
    await settleBeforeDeadline(page.mouse.move(0, 0), candidateDeadline, undefined)
    await waitForTargetMotion(page, candidate, candidateDeadline)
    const after = await readTargetState(page, candidate, candidateDeadline)
    if (!after) continue
    const changedProperties = diffProperties(before, after)

    let observation: InteractionObservationSnapshot | undefined
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
      observation = {
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
      }
    }

    const targetRestored = await restoreCandidate(page, candidate, before, candidateDeadline)
    const geometryRestored = pageGeometryMatches(
      pageGeometryBefore,
      await readPageGeometry(page, Math.min(deadline, Date.now() + 250)),
    )
    if (!targetRestored || !geometryRestored) {
      const reloadBudget = Math.min(3_000, Math.max(1, deadline - Date.now()))
      await page.reload({ waitUntil: 'domcontentloaded', timeout: reloadBudget }).catch(() => {})
      break
    }
    if (observation) observations.push(observation)
    if (Date.now() >= deadline) break
  }

  return observations
}
