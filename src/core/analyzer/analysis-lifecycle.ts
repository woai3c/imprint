import type { BrowserContext, Page } from 'playwright-core'

export const PAGE_CLOSE_TIMEOUT_MS = 3_000
export const RUNTIME_CLOSE_TIMEOUT_MS = 5_000

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
