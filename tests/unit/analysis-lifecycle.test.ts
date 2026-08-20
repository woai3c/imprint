import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ActiveAnalysisDeadline,
  AnalysisActiveTimeoutError,
  closePageWithin,
  settleWithin,
} from '../../src/core/analyzer/analysis-lifecycle.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('analysis lifecycle bounds', () => {
  it('reports a page that closes normally as settled', async () => {
    const page = {
      isClosed: () => false,
      close: vi.fn(async () => {}),
    }

    await expect(closePageWithin(page)).resolves.toBe(true)
    expect(page.close).toHaveBeenCalledOnce()
  })

  it('stops waiting when page.close never settles', async () => {
    vi.useFakeTimers()
    const page = {
      isClosed: () => false,
      close: vi.fn(() => new Promise<void>(() => {})),
    }

    const result = closePageWithin(page, 100)
    await vi.advanceTimersByTimeAsync(100)

    await expect(result).resolves.toBe(false)
  })

  it('swallows a late close rejection after the timeout', async () => {
    vi.useFakeTimers()
    let rejectClose: ((reason?: unknown) => void) | undefined
    const operation = new Promise<void>((_resolve, reject) => {
      rejectClose = reject
    })

    const result = settleWithin(operation, 100)
    await vi.advanceTimersByTimeAsync(100)
    await expect(result).resolves.toBe(false)
    rejectClose?.(new Error('late close failure'))
    await Promise.resolve()
  })

  it('excludes paused login time from the active deadline', async () => {
    vi.useFakeTimers()
    const deadline = new ActiveAnalysisDeadline(100)

    await vi.advanceTimersByTimeAsync(40)
    deadline.pause()
    await vi.advanceTimersByTimeAsync(500)
    expect(deadline.signal.aborted).toBe(false)

    deadline.resume()
    await vi.advanceTimersByTimeAsync(59)
    expect(deadline.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(deadline.signal.aborted).toBe(true)
    expect(deadline.signal.reason).toBeInstanceOf(AnalysisActiveTimeoutError)

    deadline.dispose()
  })
})
