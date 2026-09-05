import { describe, expect, test, vi } from 'vitest'

import type { Page } from 'playwright-core'

import { isNavigationTimeout, navigateWithRecovery } from '../../src/core/analyzer/navigation.js'

function timeoutError(message = 'page.goto: Timeout 15000ms exceeded.') {
  const error = new Error(message)
  error.name = 'TimeoutError'
  return error
}

function pageStub(options?: {
  goto?: ReturnType<typeof vi.fn>
  url?: string
  ready?: boolean
  waitForLoadState?: ReturnType<typeof vi.fn>
  waitForFunction?: ReturnType<typeof vi.fn>
}) {
  const goto = options?.goto || vi.fn().mockResolvedValue({ status: () => 200 })
  const waitForLoadState = options?.waitForLoadState || vi.fn().mockResolvedValue(undefined)
  const waitForFunction = options?.waitForFunction || vi.fn().mockResolvedValue(undefined)
  const page = {
    goto,
    waitForLoadState,
    waitForFunction,
    url: vi.fn(() => options?.url || 'https://example.test/product'),
    isClosed: vi.fn(() => false),
    evaluate: vi.fn().mockResolvedValue(options?.ready ?? true),
  } as unknown as Page
  return { page, goto, waitForLoadState, waitForFunction }
}

describe('navigation recovery', () => {
  test.each([
    { status: 502, headers: { 'content-type': 'text/plain', 'content-length': '0' } },
    { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    { status: 403, headers: { 'content-type': 'text/html', 'content-length': '0' } },
  ])('preserves committed HTTP $status failures without waiting for an impossible HTML body', async (response) => {
    const goto = vi.fn().mockResolvedValue({ status: () => response.status, headers: () => response.headers })
    const { page, waitForFunction } = pageStub({ goto })

    expect(await navigateWithRecovery(page, 'https://example.test/product')).toEqual({
      status: response.status,
      attempts: 1,
      recoveredAfterTimeout: false,
    })
    expect(goto).toHaveBeenCalledTimes(1)
    expect(waitForFunction).not.toHaveBeenCalled()
  })

  test.each([401, 403])('still waits for an HTML access page returned with HTTP %s', async (status) => {
    const goto = vi.fn().mockResolvedValue({ status: () => status, headers: () => ({ 'content-type': 'text/html' }) })
    const { page, waitForFunction } = pageStub({ goto })

    expect((await navigateWithRecovery(page, 'https://example.test/product')).status).toBe(status)
    expect(waitForFunction).toHaveBeenCalledTimes(1)
  })

  test('returns the first response without retrying', async () => {
    const { page, goto } = pageStub()

    const result = await navigateWithRecovery(page, 'https://example.test/product', { timeoutMs: 15_000 })

    expect(result).toEqual({ status: 200, attempts: 1, recoveredAfterTimeout: false })
    expect(goto).toHaveBeenCalledTimes(1)
    expect(goto).toHaveBeenCalledWith('https://example.test/product', {
      waitUntil: 'commit',
      timeout: 15_000,
    })
  })

  test('uses a committed usable document after the first timeout', async () => {
    const goto = vi.fn().mockRejectedValue(timeoutError())
    const { page } = pageStub({ goto })

    const result = await navigateWithRecovery(page, 'https://example.test/product', {
      timeoutMs: 15_000,
      recoveryGraceMs: 1,
    })

    expect(result).toEqual({ status: undefined, attempts: 1, recoveredAfterTimeout: true })
    expect(goto).toHaveBeenCalledTimes(1)
  })

  test('uses an existing HTML body even when DOMContentLoaded remains blocked', async () => {
    const goto = vi.fn().mockRejectedValue(timeoutError())
    const waitForLoadState = vi.fn().mockRejectedValue(timeoutError())
    const { page } = pageStub({ goto, ready: true, waitForLoadState })

    const result = await navigateWithRecovery(page, 'https://example.test/product', {
      timeoutMs: 15_000,
      recoveryGraceMs: 1,
    })

    expect(result).toEqual({ status: undefined, attempts: 1, recoveredAfterTimeout: true })
    expect(waitForLoadState).not.toHaveBeenCalled()
    expect(goto).toHaveBeenCalledTimes(1)
  })

  test('retries once when no usable document committed', async () => {
    const goto = vi
      .fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce({ status: () => 204 })
    const waitForLoadState = vi.fn().mockRejectedValue(timeoutError())
    const { page } = pageStub({ goto, url: 'about:blank', ready: false, waitForLoadState })

    const result = await navigateWithRecovery(page, 'https://example.test/product', {
      timeoutMs: 15_000,
      retryTimeoutMs: 10_000,
      recoveryGraceMs: 1,
    })

    expect(result).toEqual({ status: 204, attempts: 2, recoveredAfterTimeout: false })
    expect(goto).toHaveBeenNthCalledWith(1, 'https://example.test/product', {
      waitUntil: 'commit',
      timeout: 15_000,
    })
    expect(goto).toHaveBeenNthCalledWith(2, 'https://example.test/product', {
      waitUntil: 'commit',
      timeout: 10_000,
    })
  })

  test('retries when a response commits but never produces an HTML body', async () => {
    const goto = vi
      .fn()
      .mockResolvedValueOnce({ status: () => 200 })
      .mockResolvedValueOnce({ status: () => 200 })
    const waitForFunction = vi.fn().mockRejectedValueOnce(timeoutError()).mockResolvedValueOnce(undefined)
    const { page } = pageStub({ goto, ready: false, waitForFunction })

    const result = await navigateWithRecovery(page, 'https://example.test/product', {
      timeoutMs: 15_000,
      retryTimeoutMs: 10_000,
      recoveryGraceMs: 1,
    })

    expect(result).toEqual({ status: 200, attempts: 2, recoveredAfterTimeout: false })
    expect(goto).toHaveBeenCalledTimes(2)
    expect(waitForFunction).toHaveBeenCalledTimes(2)
  })

  test('recovers a usable document after the retry times out', async () => {
    const goto = vi.fn().mockRejectedValue(timeoutError())
    const waitForLoadState = vi.fn().mockRejectedValueOnce(timeoutError()).mockResolvedValueOnce(undefined)
    let currentUrl = 'about:blank'
    const { page } = pageStub({ goto, waitForLoadState })
    vi.mocked(page.url).mockImplementation(() => currentUrl)
    goto.mockImplementationOnce(async () => {
      throw timeoutError()
    })
    goto.mockImplementationOnce(async () => {
      currentUrl = 'https://example.test/product'
      throw timeoutError()
    })

    const result = await navigateWithRecovery(page, 'https://example.test/product', {
      recoveryGraceMs: 1,
    })

    expect(result).toEqual({ status: undefined, attempts: 2, recoveredAfterTimeout: true })
  })

  test('fails after one retry when neither attempt commits a usable document', async () => {
    const firstError = timeoutError('page.goto: Timeout on first attempt')
    const retryError = timeoutError('page.goto: Timeout on retry')
    const goto = vi.fn().mockRejectedValueOnce(firstError).mockRejectedValueOnce(retryError)
    const waitForLoadState = vi.fn().mockRejectedValue(timeoutError())
    const { page } = pageStub({ goto, url: 'about:blank', ready: false, waitForLoadState })

    await expect(navigateWithRecovery(page, 'https://example.test/product', { recoveryGraceMs: 1 })).rejects.toBe(
      retryError,
    )
    expect(goto).toHaveBeenCalledTimes(2)
  })

  test('does not retry permanent navigation failures', async () => {
    const failure = new Error('page.goto: net::ERR_NAME_NOT_RESOLVED')
    const goto = vi.fn().mockRejectedValue(failure)
    const { page } = pageStub({ goto })

    await expect(navigateWithRecovery(page, 'https://example.test/product')).rejects.toBe(failure)
    expect(goto).toHaveBeenCalledTimes(1)
  })

  test('recognizes Playwright timeout errors without treating network errors as timeouts', () => {
    expect(isNavigationTimeout(timeoutError())).toBe(true)
    expect(isNavigationTimeout(new Error('page.goto: Timeout 15000ms exceeded.'))).toBe(true)
    expect(isNavigationTimeout(new Error('page.goto: net::ERR_CONNECTION_REFUSED'))).toBe(false)
  })
})
