import { describe, expect, test, vi } from 'vitest'

import { configurePageViewport, mobileUserAgent } from '../../src/core/analyzer/viewport-emulation.js'

describe('viewport emulation', () => {
  test('builds a mobile user agent while preserving the installed Chromium version', () => {
    expect(
      mobileUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.7339.0 Safari/537.36',
      ),
    ).toContain('Android 13; Pixel 7')
    expect(mobileUserAgent('Chrome/140.0.7339.0')).toContain('Chrome/140.0.7339.0 Mobile')
  })

  test('enables mobile metrics, touch, user agent, and client hints before navigation', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const setViewportSize = vi.fn().mockResolvedValue(undefined)
    const page = {
      setViewportSize,
      evaluate: vi.fn().mockResolvedValue('Chrome/140.0.7339.0'),
      context: () => ({ newCDPSession: vi.fn().mockResolvedValue({ send }) }),
    }

    await configurePageViewport(page as never, 'mobile', { width: 375, height: 812 })

    expect(setViewportSize).toHaveBeenCalledWith({ width: 375, height: 812 })
    expect(send).toHaveBeenCalledWith(
      'Emulation.setDeviceMetricsOverride',
      expect.objectContaining({ width: 375, height: 812, mobile: true }),
    )
    expect(send).toHaveBeenCalledWith('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5,
    })
    expect(send).toHaveBeenCalledWith(
      'Network.setUserAgentOverride',
      expect.objectContaining({ platform: 'Android', userAgent: expect.stringContaining(' Mobile ') }),
    )
  })

  test('keeps desktop captures on regular viewport sizing', async () => {
    const setViewportSize = vi.fn().mockResolvedValue(undefined)
    const evaluate = vi.fn()
    const page = { setViewportSize, evaluate }

    await configurePageViewport(page as never, 'desktop', { width: 1440, height: 900 })

    expect(setViewportSize).toHaveBeenCalledWith({ width: 1440, height: 900 })
    expect(evaluate).not.toHaveBeenCalled()
  })
})
