import type { Page } from 'playwright-core'

export interface AnalysisViewport {
  width: number
  height: number
}

export function mobileUserAgent(browserUserAgent: string): string {
  const chromeVersion = /(?:Chrome|Chromium)\/([\d.]+)/i.exec(browserUserAgent)?.[1] || '120.0.0.0'
  return `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Mobile Safari/537.36`
}

export async function configurePageViewport(
  page: Page,
  viewportName: string,
  viewport: AnalysisViewport,
): Promise<void> {
  await page.setViewportSize(viewport)
  if (viewportName !== 'mobile') return

  const browserUserAgent = await page.evaluate(() => navigator.userAgent)
  const userAgent = mobileUserAgent(browserUserAgent)
  const fullVersion = /Chrome\/([\d.]+)/.exec(userAgent)?.[1] || '120.0.0.0'
  const majorVersion = fullVersion.split('.')[0]
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  })
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await session.send('Network.setUserAgentOverride', {
    userAgent,
    platform: 'Android',
    userAgentMetadata: {
      brands: [
        { brand: 'Chromium', version: majorVersion },
        { brand: 'Not_A Brand', version: '99' },
      ],
      fullVersionList: [
        { brand: 'Chromium', version: fullVersion },
        { brand: 'Not_A Brand', version: '99.0.0.0' },
      ],
      fullVersion,
      platform: 'Android',
      platformVersion: '13.0.0',
      architecture: '',
      model: 'Pixel 7',
      mobile: true,
      bitness: '',
      wow64: false,
    },
  })
}
