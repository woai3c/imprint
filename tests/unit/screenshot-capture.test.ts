import { afterEach, describe, expect, it, vi } from 'vitest'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { Page } from 'playwright-core'

import { captureValidatedOverview, captureValidatedViewport } from '../../src/core/analyzer/screenshot-capture.js'

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
})
