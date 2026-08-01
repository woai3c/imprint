import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { type Browser, type BrowserContext, type Page, chromium } from 'playwright-core'

import {
  type CapturedPageEvidence,
  buildDesignEvidence,
  extractPageEvidence,
  observeSafeInteractions,
} from '../design-evidence/index.js'
import { detectAuthWall } from './auth-wall.js'
import { findBrowser } from './browser-finder.js'
import { getManagedProfileDir, hasManagedProfile, markManagedSession } from './browser-session.js'
import { clusterColors } from './color-cluster.js'
import { type ComponentPattern, detectComponents } from './component-detect.js'
import { extractDarkMode } from './dark-mode-detect.js'
import {
  AuthenticationBrowserClosedError,
  AuthenticationCancelledError,
  AuthenticationRequiredError,
} from './errors.js'
import { generateFeatureTags } from './feature-tags.js'
import { discoverSubPages } from './page-discovery.js'
import { type MotionToken, type ResponsiveBreakpoint, detectBreakpoints, detectMotion } from './responsive-motion.js'
import { detectTechStack, extractInteractionStyles, extractStyles } from './style-extractor.js'
import { mergeStyles } from './style-merge.js'
import { buildDesignTokens } from './token-builder.js'
import type {
  AnalysisOptions,
  AnalysisResult,
  DarkModeResult,
  ExtractedStyles,
  InteractionStyles,
  PageScreenshot,
} from './types.js'

export type { ComponentPattern } from './component-detect.js'
export type { MotionToken, ResponsiveBreakpoint } from './responsive-motion.js'
export type { AuthWallDetection, AuthWallReason } from './auth-wall.js'
export type { DesignEvidence } from '../design-evidence/types.js'
export { findBrowser } from './browser-finder.js'
export {
  AuthenticationBrowserClosedError,
  AuthenticationCancelledError,
  AuthenticationRequiredError,
} from './errors.js'
export type {
  AnalysisOptions,
  AnalysisResult,
  AuthMode,
  DarkModeResult,
  DesignToken,
  ExtractedStyles,
  InteractionStyles,
  LoginDecision,
  LoginRequest,
  PageScreenshot,
} from './types.js'

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
}

interface BrowserRuntime {
  browser: Browser | null
  context: BrowserContext
}

function detectSystemProxy(): string | undefined {
  const envProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  if (envProxy) return envProxy

  if (process.platform === 'win32') {
    try {
      const raw = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
        { encoding: 'utf8', timeout: 3000 },
      )
      if (/ProxyEnable\s+REG_DWORD\s+0x1/i.test(raw)) {
        const serverRaw = execSync(
          'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
          { encoding: 'utf8', timeout: 3000 },
        )
        const match = serverRaw.match(/ProxyServer\s+REG_SZ\s+(.+)/i)
        if (match?.[1]) {
          const server = match[1].trim()
          return server.includes('://') ? server : `http://${server}`
        }
      }
    } catch {
      /* registry read failed — no proxy */
    }
  }

  return undefined
}

async function launchRuntime(
  executablePath: string,
  mode: 'anonymous' | 'managed',
  dataDir: string,
  url: string,
  headless: boolean,
  explicitProxy?: string,
): Promise<BrowserRuntime> {
  const proxyServer = explicitProxy || detectSystemProxy()
  const proxyConfig = proxyServer ? { proxy: { server: proxyServer } } : {}
  if (proxyServer) console.log('[imprint] using proxy:', proxyServer)

  if (mode === 'managed') {
    const profileDir = getManagedProfileDir(dataDir, url)
    fs.mkdirSync(profileDir, { recursive: true })
    const context = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless,
      args: ['--disable-blink-features=AutomationControlled', '--no-default-browser-check', '--no-first-run'],
      viewport: VIEWPORTS.desktop,
      ...proxyConfig,
    })
    return { browser: null, context }
  }

  const browser = await chromium.launch({
    executablePath,
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const context = await browser.newContext(proxyConfig)
  return { browser, context }
}

async function closeRuntime(runtime: BrowserRuntime | null): Promise<void> {
  if (!runtime) return
  const closeWithin = async (operation: Promise<unknown>, timeout: number) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      operation.catch(() => {}),
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(resolve, timeout)
      }),
    ])
    if (timeoutId) clearTimeout(timeoutId)
  }

  await closeWithin(runtime.context.close(), 5000)
  if (runtime.browser) await closeWithin(runtime.browser.close(), 5000)
}

async function navigatePage(page: Page, url: string, timeout = 30000): Promise<number | undefined> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  return response?.status()
}

function mergeInteractionStyles(target: InteractionStyles, source: InteractionStyles): void {
  for (const kind of ['hover', 'focus', 'active'] as const) {
    const seen = new Set(target[kind].map((styles) => JSON.stringify(styles)))
    for (const styles of source[kind]) {
      const fingerprint = JSON.stringify(styles)
      if (seen.has(fingerprint)) continue
      target[kind].push(styles)
      seen.add(fingerprint)
    }
  }
}

/**
 * Core analysis engine — no Electron dependency.
 * Accepts a `dataDir` for file output (screenshots, session cache).
 */
export async function analyze(
  url: string,
  options: AnalysisOptions,
  onProgress?: (step: string, percent: number) => void,
): Promise<AnalysisResult> {
  const startTime = Date.now()
  const analysisId = randomUUID()
  const viewportNames = options.viewports || ['desktop', 'mobile']
  const pageLimit = Math.min(5, Math.max(1, Math.floor(options.maxPages ?? 3)))
  const screenshotDir = path.join(options.dataDir, 'screenshots')
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true })
  }

  onProgress?.('progress.launchingBrowser', 5)

  const executablePath = findBrowser()
  if (!executablePath) {
    throw new Error('Chrome/Edge not found. Please install Google Chrome or Microsoft Edge.')
  }
  console.log('[imprint] findBrowser resolved:', executablePath)

  const authMode = options.authMode ?? (options.useSession === false ? 'anonymous' : 'managed')
  let accessMode: 'anonymous' | 'managed' = authMode === 'managed' ? 'managed' : 'anonymous'
  const initialViewport = VIEWPORTS[viewportNames[0]] || VIEWPORTS.desktop

  let runtime: BrowserRuntime | null = null
  let initialPage: Page | null = null
  let authWallDetected = false
  let finalUrl = url

  try {
    runtime = await launchRuntime(executablePath, accessMode, options.dataDir, url, true, options.proxyServer)
    initialPage = runtime.context.pages()[0] || (await runtime.context.newPage())
    await initialPage.setViewportSize(initialViewport)

    onProgress?.('progress.checkingAccess', 7)
    let responseStatus = await navigatePage(initialPage, url)
    let authDetection = await detectAuthWall(initialPage, responseStatus)
    authWallDetected = authDetection.detected
    finalUrl = authDetection.finalUrl

    if (authMode === 'auto' && hasManagedProfile(options.dataDir, url)) {
      const visitorRuntime = runtime
      const visitorPage = initialPage
      const visitorDetection = authDetection
      let managedRuntime: BrowserRuntime | null = null

      onProgress?.('progress.preparingAuthenticatedAnalysis', 8)
      try {
        managedRuntime = await launchRuntime(executablePath, 'managed', options.dataDir, url, true, options.proxyServer)
        const managedPage = managedRuntime.context.pages()[0] || (await managedRuntime.context.newPage())
        await managedPage.setViewportSize(initialViewport)
        const managedResponseStatus = await navigatePage(managedPage, url)
        const managedDetection = await detectAuthWall(managedPage, managedResponseStatus)

        if (!managedDetection.detected) {
          runtime = managedRuntime
          initialPage = managedPage
          responseStatus = managedResponseStatus
          authDetection = managedDetection
          finalUrl = managedDetection.finalUrl
          accessMode = 'managed'
          managedRuntime = null
          await closeRuntime(visitorRuntime)
        }
      } catch {
        // A locked or unusable saved profile falls back to the already-loaded visitor page.
      } finally {
        if (managedRuntime) await closeRuntime(managedRuntime)
      }

      if (accessMode !== 'managed') {
        runtime = visitorRuntime
        initialPage = visitorPage
        authDetection = visitorDetection
        finalUrl = visitorDetection.finalUrl
      }
    }

    if (authMode === 'auto' && authDetection.detected) {
      throw new AuthenticationRequiredError(authDetection)
    }

    if (accessMode === 'managed' && authDetection.detected && options.onLoginRequired) {
      await closeRuntime(runtime)
      runtime = null
      initialPage = null

      onProgress?.('progress.openingLoginBrowser', 7)
      runtime = await launchRuntime(executablePath, 'managed', options.dataDir, url, false, options.proxyServer)
      let loginPage = runtime.context.pages()[0] || (await runtime.context.newPage())
      await loginPage.setViewportSize(initialViewport)
      responseStatus = await navigatePage(loginPage, url)
      authDetection = await detectAuthWall(loginPage, responseStatus)

      const loginAbortController = new AbortController()
      runtime.context.once('close', () => loginAbortController.abort())
      let retry = false
      let continueAnonymously = false

      while (authDetection.detected) {
        onProgress?.(retry ? 'progress.loginIncomplete' : 'progress.waitingForLogin', 8)
        const decision = await options.onLoginRequired({ detection: authDetection, retry }, loginAbortController.signal)
        if (loginAbortController.signal.aborted) {
          throw new AuthenticationBrowserClosedError()
        }
        if (decision === 'cancel') {
          throw new AuthenticationCancelledError()
        }
        if (decision === 'anonymous') {
          continueAnonymously = true
          break
        }

        onProgress?.('progress.verifyingLogin', 9)
        if (loginPage.isClosed()) {
          const openPages = runtime.context.pages()
          loginPage = openPages[openPages.length - 1] || (await runtime.context.newPage())
        }
        responseStatus = await navigatePage(loginPage, url)
        authDetection = await detectAuthWall(loginPage, responseStatus)
        retry = true
      }

      if (continueAnonymously) {
        await closeRuntime(runtime)
        runtime = await launchRuntime(executablePath, 'anonymous', options.dataDir, url, true, options.proxyServer)
        accessMode = 'anonymous'
        initialPage = runtime.context.pages()[0] || (await runtime.context.newPage())
        await initialPage.setViewportSize(initialViewport)
        responseStatus = await navigatePage(initialPage, url)
        authDetection = await detectAuthWall(initialPage, responseStatus)
      } else {
        initialPage = loginPage
      }
      finalUrl = authDetection.finalUrl
    }

    if (!runtime) throw new Error('Browser session is not available')
    if (accessMode === 'managed' && !authDetection.detected) markManagedSession(options.dataDir, url)

    const allStyles: ExtractedStyles[] = []
    const screenshots: string[] = []
    const pageScreenshots: PageScreenshot[] = []
    const capturedPageEvidence: CapturedPageEvidence[] = []
    const allInteractions: InteractionStyles = { hover: [], focus: [], active: [] }
    let darkModeResult: DarkModeResult | null = null
    let components: ComponentPattern[] = []
    let breakpoints: ResponsiveBreakpoint[] = []
    let motion: MotionToken[] = []
    let techStack: import('../design-evidence/types.js').TechStackInfo | undefined

    for (let i = 0; i < viewportNames.length; i++) {
      const vpName = viewportNames[i]
      const viewport = VIEWPORTS[vpName] || VIEWPORTS.desktop
      const progress = 10 + (i / viewportNames.length) * 70

      onProgress?.(`progress.analyzingViewport::${vpName}`, Math.round(progress))

      const page: Page =
        i === 0 && initialPage && !initialPage.isClosed() ? initialPage : await runtime.context.newPage()
      await page.setViewportSize(viewport)
      if (page !== initialPage) await navigatePage(page, url)
      if (i === 0) finalUrl = page.url()

      await page.waitForFunction(() => document.fonts.ready, { timeout: 5000 }).catch(() => {})

      const styles = await extractStyles(page)
      allStyles.push(styles)

      const pageInteractionStyles = await extractInteractionStyles(page)
      mergeInteractionStyles(allInteractions, pageInteractionStyles)

      if (i === 0 && options.extractDarkMode !== false) {
        darkModeResult = await extractDarkMode(page)
      }

      if (i === 0) {
        components = await detectComponents(page)
        breakpoints = await detectBreakpoints(page)
        motion = await detectMotion(page)
        techStack = await detectTechStack(page)
      }

      const screenshotPath = path.join(screenshotDir, `${Date.now()}-page-1-${vpName}.png`)
      const evidenceSnapshot = await extractPageEvidence(page, vpName)
      const interactionObservations =
        i === 0 && accessMode === 'anonymous' && !authDetection.detected
          ? await observeSafeInteractions(page, evidenceSnapshot, options.depth === 'deep' ? 12 : 6)
          : []
      const supplementalImages: NonNullable<CapturedPageEvidence['supplementalImages']> = []
      if (i === 0 || vpName !== 'desktop') {
        const viewportPath = path.join(screenshotDir, `${Date.now()}-page-1-${vpName}-viewport.png`)
        await page.screenshot({ path: viewportPath, fullPage: false })
        supplementalImages.push({
          kind: 'viewport-crop',
          path: viewportPath,
          width: viewport.width,
          height: viewport.height,
          sourceRect: {
            x: 0,
            y: 0,
            width: Math.min(1, viewport.width / evidenceSnapshot.width),
            height: Math.min(1, viewport.height / evidenceSnapshot.height),
          },
        })
      }
      if (i === 0) {
        const representativeSections = [...evidenceSnapshot.sections]
          .sort((first, second) => {
            const priority = (role: string) => (role === 'hero' ? 3 : role === 'media' ? 2 : role === 'action' ? 1 : 0)
            return (
              priority(second.role) - priority(first.role) ||
              second.rect.width * second.rect.height - first.rect.width * first.rect.height
            )
          })
          .slice(0, 2)
        for (let sectionIndex = 0; sectionIndex < representativeSections.length; sectionIndex += 1) {
          const section = representativeSections[sectionIndex]
          const clip = {
            x: Math.max(0, section.rect.x * evidenceSnapshot.width),
            y: Math.max(0, section.rect.y * evidenceSnapshot.height),
            width: Math.max(1, section.rect.width * evidenceSnapshot.width),
            height: Math.max(1, section.rect.height * evidenceSnapshot.height),
          }
          const regionPath = path.join(screenshotDir, `${Date.now()}-page-1-${vpName}-region-${sectionIndex + 1}.png`)
          try {
            await page.screenshot({ path: regionPath, clip })
            supplementalImages.push({
              kind: 'region-crop',
              path: regionPath,
              width: Math.round(clip.width),
              height: Math.round(clip.height),
              sourceRect: section.rect,
              sectionKey: section.key,
            })
          } catch {
            // Full-page evidence remains available when a dynamic region cannot be clipped reliably.
          }
        }
      }
      await page.screenshot({ path: screenshotPath, fullPage: true })
      screenshots.push(screenshotPath)
      const pageScreenshot = {
        url: page.url(),
        path: screenshotPath,
        viewport: vpName,
      }
      pageScreenshots.push(pageScreenshot)
      capturedPageEvidence.push({
        screenshot: pageScreenshot,
        snapshot: evidenceSnapshot,
        interactionStyles: pageInteractionStyles,
        interactionObservations,
        supplementalImages,
      })

      if (page !== initialPage) await page.close()
    }

    // Multi-page analysis: discover and visit sub-pages for richer token extraction
    const subPageLimit = pageLimit - 1
    if (subPageLimit > 0 && !authDetection.detected) {
      const mainViewport = VIEWPORTS[viewportNames[0]] || VIEWPORTS.desktop
      const mainViewportName = viewportNames[0] || 'desktop'
      const canReuseInitialPage = initialPage && !initialPage.isClosed()
      const discoveryPage = canReuseInitialPage ? initialPage : await runtime.context.newPage()
      if (!canReuseInitialPage) {
        await discoveryPage.setViewportSize(mainViewport)
        await navigatePage(discoveryPage, url)
      }
      onProgress?.('progress.discoveringPages', 75)

      const subPages = await discoverSubPages(discoveryPage, url, subPageLimit)
      if (!canReuseInitialPage) await discoveryPage.close()

      for (let i = 0; i < subPages.length; i++) {
        const subUrl = subPages[i]
        onProgress?.(
          `progress.analyzingPage::${i + 2}::${subPages.length + 1}`,
          Math.round(76 + ((i + 1) / Math.max(subPages.length, 1)) * 8),
        )

        const subPage = await runtime.context.newPage()
        await subPage.setViewportSize(mainViewport)

        try {
          const subPageStatus = await navigatePage(subPage, subUrl, 15000)
          if (subPageStatus && subPageStatus >= 400) continue

          const isHtmlDocument = await subPage.evaluate(
            () => document.contentType === 'text/html' || document.contentType === 'application/xhtml+xml',
          )
          if (!isHtmlDocument) continue

          const subPageAuthDetection = await detectAuthWall(subPage, subPageStatus)
          if (subPageAuthDetection.detected) continue

          const subStyles = await extractStyles(subPage)
          allStyles.push(subStyles)
          const pageInteractionStyles = await extractInteractionStyles(subPage)
          mergeInteractionStyles(allInteractions, pageInteractionStyles)

          const screenshotPath = path.join(screenshotDir, `${Date.now()}-page-${i + 2}-${mainViewportName}.png`)
          const evidenceSnapshot = await extractPageEvidence(subPage, mainViewportName)
          await subPage.screenshot({ path: screenshotPath, fullPage: true })
          screenshots.push(screenshotPath)
          const pageScreenshot = {
            url: subPage.url(),
            path: screenshotPath,
            viewport: mainViewportName,
          }
          pageScreenshots.push(pageScreenshot)
          capturedPageEvidence.push({
            screenshot: pageScreenshot,
            snapshot: evidenceSnapshot,
            interactionStyles: pageInteractionStyles,
          })
        } catch {
          // Sub-page failed to load, skip it
        } finally {
          await subPage.close()
        }
      }
    }

    onProgress?.('progress.analyzingPatterns', 85)
    const mergedStyles = mergeStyles(allStyles)

    onProgress?.('progress.clusteringColors', 90)
    const clusteredColors = clusterColors(mergedStyles.colors, mergedStyles.usageCount)

    onProgress?.('progress.generatingTokens', 95)
    const tokens = buildDesignTokens(mergedStyles, clusteredColors)
    const featureTags = generateFeatureTags(tokens, mergedStyles)
    const designEvidence = buildDesignEvidence({
      analysisId,
      requestedUrl: url,
      finalUrl,
      accessMode,
      authWallDetected,
      expectedPageCount: pageLimit,
      tokens,
      featureTags,
      interactionStyles: allInteractions,
      breakpoints,
      motion,
      captures: capturedPageEvidence,
      techStack,
    })

    onProgress?.('progress.done', 100)

    return {
      analysisId,
      tokens,
      designEvidence,
      screenshots,
      pageScreenshots,
      rawStyles: mergedStyles,
      interactions: allInteractions,
      darkMode: darkModeResult,
      featureTags,
      components,
      breakpoints,
      motion,
      duration: Date.now() - startTime,
      accessMode,
      authWallDetected,
      finalUrl,
    }
  } finally {
    await closeRuntime(runtime)
  }
}
