import { describe, expect, it } from 'vitest'

import { buildCaptureManifest } from '../../src/core/analyzer/capture-manifest.js'
import { mobileUserAgent } from '../../src/core/analyzer/viewport-emulation.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'

const runtimeUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/128.0.0.0 Safari/537.36'

function evidence(): DesignEvidence {
  return {
    pages: [
      { url: 'https://example.com/', viewport: 'desktop', health: { issues: [] } },
      { url: 'https://example.com/', viewport: 'mobile', health: { issues: [] } },
    ],
    coverage: {
      pageCoverage: 'complete',
      limitations: [],
      captureCoverage: { expected: 2, captured: 2, status: 'complete' },
    },
    limitations: [],
  } as DesignEvidence
}

describe('capture manifest', () => {
  it('separates the runtime browser identity from effective viewport emulation', () => {
    const manifest = buildCaptureManifest({
      capturedAt: '2026-08-17T00:00:00.000Z',
      toolVersion: '0.0.3',
      viewports: [{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }],
      maxPages: 1,
      accessMode: 'anonymous',
      executablePath: '/Applications/chrome-headless-shell',
      headless: true,
      environment: {
        userAgent: runtimeUserAgent,
        locale: 'en-US',
        languages: ['en-US'],
        timezone: 'UTC',
        colorScheme: 'light',
        reducedMotion: 'no-preference',
        deviceScaleFactor: 2,
      },
      viewportEnvironments: [
        {
          name: 'desktop',
          width: 1440,
          height: 900,
          deviceScaleFactor: 2,
          mobile: false,
          source: 'requested',
          emulationProfile: 'browser-default',
          userAgent: runtimeUserAgent,
        },
        {
          name: 'mobile',
          width: 375,
          height: 812,
          deviceScaleFactor: 1,
          mobile: true,
          source: 'adaptive',
          emulationProfile: 'pixel-7-android-13',
          userAgent: mobileUserAgent(runtimeUserAgent),
        },
      ],
      animationFreezeAttempts: [{ url: 'https://example.com/', viewport: 'desktop', succeeded: true }],
      evidence: evidence(),
      pageCoverage: { requested: 1, discovered: 0, selected: 0, analyzed: 1, pages: [] },
    })

    expect(manifest.environment.browser).toMatchObject({
      product: 'chromium',
      version: '128.0.0.0',
      userAgent: runtimeUserAgent,
    })
    expect(manifest.request.schemaVersion).toBe('1')
    expect(manifest.environment.viewports[1]).toMatchObject({
      name: 'mobile',
      source: 'adaptive',
      emulationProfile: 'pixel-7-android-13',
      userAgent: expect.stringContaining('Android 13'),
    })
    expect(manifest.stabilization.animationFreeze).toEqual({
      eligibleCaptures: 2,
      attemptedCaptures: 1,
      succeededCaptures: 1,
      failedCaptures: 0,
      coverage: 'partial',
    })
  })

  it('records no animation-freeze coverage when no captured page was attempted', () => {
    const baseEvidence = evidence()
    baseEvidence.pages = [baseEvidence.pages[0]]
    const manifest = buildCaptureManifest({
      capturedAt: '2026-08-17T00:00:00.000Z',
      viewports: [{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }],
      maxPages: 1,
      accessMode: 'anonymous',
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      environment: {
        userAgent: runtimeUserAgent,
        locale: 'en-US',
        languages: ['en-US'],
        timezone: 'UTC',
        colorScheme: 'light',
        reducedMotion: 'no-preference',
        deviceScaleFactor: 1,
      },
      viewportEnvironments: [
        {
          name: 'desktop',
          width: 1440,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
          source: 'requested',
          emulationProfile: 'browser-default',
          userAgent: runtimeUserAgent,
        },
      ],
      animationFreezeAttempts: [],
      evidence: baseEvidence,
      pageCoverage: { requested: 1, discovered: 0, selected: 0, analyzed: 1, pages: [] },
    })

    expect(manifest.stabilization.animationFreeze).toEqual({
      eligibleCaptures: 1,
      attemptedCaptures: 0,
      succeededCaptures: 0,
      failedCaptures: 0,
      coverage: 'none',
    })
  })
})
