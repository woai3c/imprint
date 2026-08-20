import type { BrowserContext, Page } from 'playwright-core'

export const ANALYSIS_ACTIVE_TIMEOUT_MS = 120_000
export const PAGE_CLOSE_TIMEOUT_MS = 3_000
export const RUNTIME_CLOSE_TIMEOUT_MS = 5_000

export class AnalysisActiveTimeoutError extends Error {
  readonly code = 'ANALYSIS_ACTIVE_TIMEOUT'

  constructor(readonly timeoutMs = ANALYSIS_ACTIVE_TIMEOUT_MS) {
    super('analysis-active-timeout')
    this.name = 'AnalysisActiveTimeoutError'
  }
}

export class ActiveAnalysisDeadline {
  readonly controller = new AbortController()

  private readonly startedAt = Date.now()
  private pausedAt: number | null = null
  private pausedMs = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly timeoutMs = ANALYSIS_ACTIVE_TIMEOUT_MS) {
    this.arm()
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  activeElapsedMs(): number {
    const now = this.pausedAt ?? Date.now()
    return Math.max(0, now - this.startedAt - this.pausedMs)
  }

  pause(): void {
    if (this.pausedAt !== null || this.signal.aborted) return
    this.pausedAt = Date.now()
    this.clearTimer()
  }

  resume(): void {
    if (this.pausedAt === null || this.signal.aborted) return
    this.pausedMs += Date.now() - this.pausedAt
    this.pausedAt = null
    this.arm()
  }

  dispose(): void {
    this.clearTimer()
  }

  private arm(): void {
    this.clearTimer()
    const remaining = this.timeoutMs - this.activeElapsedMs()
    if (remaining <= 0) {
      this.controller.abort(new AnalysisActiveTimeoutError(this.timeoutMs))
      return
    }
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.controller.abort(new AnalysisActiveTimeoutError(this.timeoutMs))
    }, remaining)
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
  }
}

export async function settleWithin(operation: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let settled = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  const guardedOperation = operation.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )

  try {
    await Promise.race([
      guardedOperation,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs)
      }),
    ])
    return settled
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function closePageWithin(page: Pick<Page, 'close' | 'isClosed'>, timeoutMs = PAGE_CLOSE_TIMEOUT_MS) {
  if (page.isClosed()) return true
  return settleWithin(page.close(), timeoutMs)
}

export async function closeContextWithin(context: Pick<BrowserContext, 'close'>, timeoutMs = RUNTIME_CLOSE_TIMEOUT_MS) {
  return settleWithin(context.close(), timeoutMs)
}
