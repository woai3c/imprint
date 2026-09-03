import { afterEach, describe, expect, it, vi } from 'vitest'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { Page } from 'playwright-core'

import {
  captureValidatedOverview,
  captureValidatedViewport,
  inspectPngDimensions,
} from '../../src/core/analyzer/screenshot-capture.js'

const temporaryDirectories: string[] = []

function temporaryPngPath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-screenshot-'))
  temporaryDirectories.push(directory)
  return path.join(directory, 'capture.png')
}

function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24)
  buffer.set(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

afterEach(() => {
  vi.useRealTimers()
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('validated screenshots', () => {
  it('falls back to Chromium capture when the full-page screenshot times out', async () => {
    const filePath = temporaryPngPath()
    const detach = vi.fn(async () => {})
    const page = {
      context: () => ({
        newCDPSession: vi.fn(async () => ({
          send: vi.fn(async () => ({ data: pngHeader(1440, 1800).toString('base64') })),
          detach,
        })),
      }),
      evaluate: vi.fn(async () => {}),
      screenshot: vi.fn().mockRejectedValue(new Error('Timeout exceeded while waiting for fonts')),
      waitForTimeout: vi.fn(async () => {}),
    } as unknown as Page

    await expect(captureValidatedOverview(page, filePath, 1440, 1800)).resolves.toEqual({
      dimensions: { width: 1440, height: 1800 },
      valid: true,
    })
    expect(detach).toHaveBeenCalledOnce()
  })

  it('returns an invalid result instead of throwing when every viewport capture method fails', async () => {
    const filePath = temporaryPngPath()
    const page = {
      context: () => ({ newCDPSession: vi.fn().mockRejectedValue(new Error('CDP unavailable')) }),
      screenshot: vi.fn().mockRejectedValue(new Error('Screenshot timed out')),
    } as unknown as Page

    await expect(captureValidatedViewport(page, filePath, 375, 812)).resolves.toEqual({
      dimensions: null,
      valid: false,
    })
  })

  it('bounds a CDP screenshot command that never settles', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const filePath = temporaryPngPath()
    const detach = vi.fn(async () => {})
    const page = {
      context: () => ({
        newCDPSession: vi.fn(async () => ({
          send: vi.fn(() => new Promise(() => {})),
          detach,
        })),
      }),
      screenshot: vi.fn().mockRejectedValue(new Error('Screenshot unavailable')),
    } as unknown as Page

    const capture = captureValidatedViewport(page, filePath, 375, 812, 5)
    await vi.runAllTimersAsync()
    await expect(capture).resolves.toEqual({
      dimensions: null,
      valid: false,
    })
    expect(detach).toHaveBeenCalledOnce()
    expect(page.screenshot).toHaveBeenCalledOnce()
  })

  it('bounds CDP session creation that never settles', async () => {
    const filePath = temporaryPngPath()
    const page = {
      context: () => ({ newCDPSession: vi.fn(() => new Promise(() => {})) }),
      screenshot: vi.fn().mockRejectedValue(new Error('Screenshot unavailable')),
    } as unknown as Page

    await expect(captureValidatedViewport(page, filePath, 375, 812, 5)).resolves.toEqual({
      dimensions: null,
      valid: false,
    })
  })

  it('detaches a CDP session that resolves after its creation deadline', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const filePath = temporaryPngPath()
    const detach = vi.fn(async () => {})
    let resolveSession: ((session: { send: ReturnType<typeof vi.fn>; detach: typeof detach }) => void) | undefined
    const newCDPSession = vi.fn(
      () =>
        new Promise<{ send: ReturnType<typeof vi.fn>; detach: typeof detach }>((resolve) => {
          resolveSession = resolve
        }),
    )
    const page = {
      context: () => ({ newCDPSession }),
      screenshot: vi.fn().mockRejectedValue(new Error('Screenshot unavailable')),
    } as unknown as Page

    const capture = captureValidatedViewport(page, filePath, 375, 812, 5)
    await vi.advanceTimersByTimeAsync(2)
    await expect(capture).resolves.toEqual({ dimensions: null, valid: false })

    resolveSession?.({ send: vi.fn(), detach })
    await vi.advanceTimersByTimeAsync(0)
    expect(detach).toHaveBeenCalledOnce()
  })

  it('uses the viewport fallback when a CDP result arrives at its attempt deadline', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const filePath = temporaryPngPath()
    const screenshot = vi.fn(async (options: { path: string }) => {
      fs.writeFileSync(options.path, pngHeader(375, 812))
    })
    const page = {
      context: () => ({
        newCDPSession: vi.fn(async () => ({
          send: vi.fn(() => {
            vi.setSystemTime(2)
            return Promise.resolve({ data: pngHeader(375, 812).toString('base64') })
          }),
          detach: vi.fn(async () => {}),
        })),
      }),
      screenshot,
    } as unknown as Page

    await expect(captureValidatedViewport(page, filePath, 375, 812, 5)).resolves.toEqual({
      dimensions: { width: 375, height: 812 },
      valid: true,
    })
    expect(screenshot).toHaveBeenCalledOnce()
  })

  it('bounds asynchronous CDP screenshot persistence and uses the viewport fallback', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const filePath = temporaryPngPath()
    const writeFile = vi.spyOn(fs.promises, 'writeFile').mockImplementation(() => new Promise<void>(() => {}))
    const screenshot = vi.fn(async (options: { path: string }) => {
      fs.writeFileSync(options.path, pngHeader(375, 812))
    })
    const page = {
      context: () => ({
        newCDPSession: vi.fn(async () => ({
          send: vi.fn(async () => ({ data: pngHeader(375, 812).toString('base64') })),
          detach: vi.fn(async () => {}),
        })),
      }),
      screenshot,
    } as unknown as Page

    try {
      const capture = captureValidatedViewport(page, filePath, 375, 812, 30)
      await vi.advanceTimersByTimeAsync(15)

      await expect(capture).resolves.toEqual({ dimensions: { width: 375, height: 812 }, valid: true })
      expect(screenshot).toHaveBeenCalledOnce()
    } finally {
      writeFile.mockRestore()
    }
  })

  it('handles a rejection when creating an operation reaches its deadline', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const filePath = temporaryPngPath()
    const newCDPSession = vi.fn(() => {
      vi.setSystemTime(2)
      return Promise.reject(new Error('Context closed while creating CDP session'))
    })
    const page = {
      context: () => ({ newCDPSession }),
      screenshot: vi.fn().mockRejectedValue(new Error('Screenshot unavailable')),
    } as unknown as Page

    await expect(captureValidatedViewport(page, filePath, 375, 812, 5)).resolves.toEqual({
      dimensions: null,
      valid: false,
    })
    expect(newCDPSession).toHaveBeenCalledOnce()
  })

  it('bounds CDP session cleanup that never settles', async () => {
    const filePath = temporaryPngPath()
    const page = {
      context: () => ({
        newCDPSession: vi.fn(async () => ({
          send: vi.fn(async () => ({})),
          detach: vi.fn(() => new Promise(() => {})),
        })),
      }),
      screenshot: vi.fn().mockRejectedValue(new Error('Screenshot unavailable')),
    } as unknown as Page

    await expect(captureValidatedViewport(page, filePath, 375, 812, 5)).resolves.toEqual({
      dimensions: null,
      valid: false,
    })
  })

  it('absorbs a CDP cleanup rejection after the operation deadline expires', async () => {
    vi.useFakeTimers()
    const filePath = temporaryPngPath()
    const detach = vi.fn().mockRejectedValue(new Error('Context already closed'))
    const page = {
      context: () => ({
        newCDPSession: vi.fn(async () => ({
          send: vi.fn(() => new Promise(() => {})),
          detach,
        })),
      }),
      screenshot: vi.fn().mockRejectedValue(new Error('Screenshot unavailable')),
    } as unknown as Page

    const capture = captureValidatedViewport(page, filePath, 375, 812, 5)
    await vi.advanceTimersByTimeAsync(5)

    await expect(capture).resolves.toEqual({ dimensions: null, valid: false })
    expect(detach).toHaveBeenCalledOnce()
  })

  it('shares one timeout budget across overview capture fallbacks', async () => {
    vi.useFakeTimers()
    const filePath = temporaryPngPath()
    const evaluate = vi.fn(async () => {})
    const page = {
      context: () => ({
        newCDPSession: vi.fn(async () => ({
          send: vi.fn(() => new Promise(() => {})),
          detach: vi.fn(async () => {}),
        })),
      }),
      evaluate,
      screenshot: vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error('Screenshot unavailable')), 6)
          }),
      ),
      waitForTimeout: vi.fn(async () => {}),
    } as unknown as Page

    const capture = captureValidatedOverview(page, filePath, 1440, 1800, 10)
    await vi.advanceTimersByTimeAsync(10)

    await expect(capture).resolves.toEqual({ dimensions: null, valid: false })
    expect(page.screenshot).toHaveBeenCalledTimes(2)
    expect(evaluate).toHaveBeenCalledOnce()
  })

  it.each([
    { name: 'horizontal', actualWidth: 375, actualHeight: 1600, expectedWidth: 1032, expectedHeight: 1600 },
    { name: 'vertical', actualWidth: 1440, actualHeight: 900, expectedWidth: 1440, expectedHeight: 1600 },
    { name: 'horizontal oversize', actualWidth: 1445, actualHeight: 1600, expectedWidth: 1440, expectedHeight: 1600 },
    { name: 'vertical oversize', actualWidth: 1440, actualHeight: 1609, expectedWidth: 1440, expectedHeight: 1600 },
  ])('returns readable dimensions for a $name overview mismatch', async (geometry) => {
    const filePath = temporaryPngPath()
    const page = {
      context: () => ({ newCDPSession: vi.fn().mockRejectedValue(new Error('CDP unavailable')) }),
      evaluate: vi.fn(async () => {}),
      screenshot: vi.fn(async (options: { path: string }) => {
        fs.writeFileSync(options.path, pngHeader(geometry.actualWidth, geometry.actualHeight))
      }),
      waitForTimeout: vi.fn(async () => {}),
    } as unknown as Page

    await expect(
      captureValidatedOverview(page, filePath, geometry.expectedWidth, geometry.expectedHeight),
    ).resolves.toEqual({
      dimensions: { width: geometry.actualWidth, height: geometry.actualHeight },
      valid: false,
    })
  })

  it('reserves time for the CDP fallback when the initial overview capture stalls', async () => {
    vi.useFakeTimers()
    const filePath = temporaryPngPath()
    const send = vi.fn(async () => ({ data: pngHeader(1440, 1800).toString('base64') }))
    const page = {
      context: () => ({
        newCDPSession: vi.fn(async () => ({ send, detach: vi.fn(async () => {}) })),
      }),
      screenshot: vi.fn(() => new Promise(() => {})),
    } as unknown as Page

    const capture = captureValidatedOverview(page, filePath, 1440, 1800, 100)
    await vi.advanceTimersByTimeAsync(40)

    await expect(capture).resolves.toEqual({ dimensions: { width: 1440, height: 1800 }, valid: true })
    expect(page.screenshot).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledOnce()
  })

  it('does not let a late Playwright attempt overwrite a validated CDP fallback', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const filePath = temporaryPngPath()
    let latePath: string | undefined
    let finishLateCapture: (() => void) | undefined
    const screenshot = vi.fn(
      (options: { path: string }) =>
        new Promise<void>((resolve) => {
          latePath = options.path
          finishLateCapture = () => {
            fs.writeFileSync(options.path, pngHeader(320, 240))
            resolve()
          }
        }),
    )
    const page = {
      context: () => ({
        newCDPSession: vi.fn(async () => ({
          send: vi.fn(async () => ({ data: pngHeader(1440, 1800).toString('base64') })),
          detach: vi.fn(async () => {}),
        })),
      }),
      screenshot,
    } as unknown as Page

    const capture = captureValidatedOverview(page, filePath, 1440, 1800, 100)
    await vi.advanceTimersByTimeAsync(40)
    await expect(capture).resolves.toEqual({ dimensions: { width: 1440, height: 1800 }, valid: true })
    expect(latePath).not.toBe(filePath)
    expect(latePath).toMatch(/\.png$/)

    finishLateCapture?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(inspectPngDimensions(filePath)).toEqual({ width: 1440, height: 1800 })
  })
})
