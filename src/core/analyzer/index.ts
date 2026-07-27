import fs from 'node:fs'
import path from 'node:path'

import { type Browser, type BrowserContext, type Page, chromium } from 'playwright-core'

import { isMacOS, isWindows } from '../../shared/platform.js'
import { type AuthWallDetection, detectAuthWall } from './auth-wall.js'
import { getManagedProfileDir, hasManagedProfile, markManagedSession } from './browser-session.js'
import { clusterColors } from './color-cluster.js'
import { type ComponentPattern, detectComponents } from './component-detect.js'
import { type DarkModeResult, extractDarkMode } from './dark-mode-detect.js'
import { generateFeatureTags } from './feature-tags.js'
import { type MotionToken, type ResponsiveBreakpoint, detectBreakpoints, detectMotion } from './responsive-motion.js'
import { type InteractionStyles, extractInteractionStyles, extractStyles } from './style-extractor.js'
import { buildDesignTokens } from './token-builder.js'

export type { DarkModeResult } from './dark-mode-detect.js'
export type { InteractionStyles } from './style-extractor.js'
export type { ComponentPattern } from './component-detect.js'
export type { MotionToken, ResponsiveBreakpoint } from './responsive-motion.js'
export type { AuthWallDetection, AuthWallReason } from './auth-wall.js'

export interface AnalysisOptions {
  viewports?: string[]
  maxPages?: number
  useSession?: boolean
  authMode?: AuthMode
  extractDarkMode?: boolean
  dataDir: string
  onLoginRequired?: (request: LoginRequest, signal: AbortSignal) => Promise<LoginDecision>
}

export type AuthMode = 'auto' | 'anonymous' | 'managed'
export type LoginDecision = 'continue' | 'anonymous' | 'cancel'

export interface LoginRequest {
  detection: AuthWallDetection
  retry: boolean
}

export interface AnalysisResult {
  tokens: DesignToken
  screenshots: string[]
  pageScreenshots: PageScreenshot[]
  rawStyles: ExtractedStyles
  interactions: InteractionStyles
  darkMode: DarkModeResult | null
  featureTags: string[]
  components: ComponentPattern[]
  breakpoints: ResponsiveBreakpoint[]
  motion: MotionToken[]
  duration: number
  accessMode: 'anonymous' | 'managed'
  authWallDetected: boolean
  finalUrl: string
}

export interface PageScreenshot {
  url: string
  path: string
  viewport: string
}

export class AuthenticationRequiredError extends Error {
  readonly code = 'AUTH_REQUIRED'

  constructor(readonly detection: AuthWallDetection) {
    super('Authentication is required to access the target page')
    this.name = 'AuthenticationRequiredError'
  }
}

export class AuthenticationCancelledError extends Error {
  readonly code = 'AUTH_CANCELLED'

  constructor() {
    super('Authentication was cancelled')
    this.name = 'AuthenticationCancelledError'
  }
}

export class AuthenticationBrowserClosedError extends Error {
  readonly code = 'AUTH_BROWSER_CLOSED'

  constructor() {
    super('The sign-in browser was closed before analysis could continue. Your saved sign-in may still be available.')
    this.name = 'AuthenticationBrowserClosedError'
  }
}

export interface ExtractedStyles {
  colors: string[]
  fontFamilies: string[]
  fontSizes: string[]
  fontWeights: string[]
  lineHeights: string[]
  letterSpacings: string[]
  spacings: string[]
  radii: string[]
  shadows: string[]
  borders: string[]
  cssVariables: Record<string, string>
  backgroundColors: string[]
  textColors: string[]
  zIndices: string[]
  transitions: string[]
  usageCount: Record<string, number>
}

export interface DesignToken {
  colors: Record<string, string>
  typography: {
    fontFamilies: string[]
    fontStacks: string[]
    fontSizes: string[]
    fontWeights: string[]
    lineHeights: string[]
    letterSpacings: string[]
  }
  spacing: string[]
  radii: string[]
  shadows: string[]
  borders: string[]
  zIndices: string[]
  transitions: string[]
  usageCount?: Record<string, number>
}

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
}

export function findBrowser(): string | undefined {
  if (isWindows(process.platform)) {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    for (const p of paths) {
      if (fs.existsSync(p)) return p
    }
  }

  if (isMacOS(process.platform)) {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]
    for (const p of paths) {
      if (fs.existsSync(p)) return p
    }
  }

  return undefined
}

interface BrowserRuntime {
  browser: Browser | null
  context: BrowserContext
}

async function launchRuntime(
  executablePath: string,
  mode: 'anonymous' | 'managed',
  dataDir: string,
  url: string,
  headless: boolean,
): Promise<BrowserRuntime> {
  if (mode === 'managed') {
    const profileDir = getManagedProfileDir(dataDir, url)
    fs.mkdirSync(profileDir, { recursive: true })
    const context = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless,
      args: ['--disable-blink-features=AutomationControlled', '--no-default-browser-check', '--no-first-run'],
      viewport: VIEWPORTS.desktop,
    })
    return { browser: null, context }
  }

  const browser = await chromium.launch({
    executablePath,
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const context = await browser.newContext()
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
  const viewportNames = options.viewports || ['desktop']
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
    runtime = await launchRuntime(executablePath, accessMode, options.dataDir, url, true)
    initialPage = runtime.context.pages()[0] || (await runtime.context.newPage())
    await initialPage.setViewportSize(initialViewport)

    onProgress?.('progress.checkingAccess', 7)
    let responseStatus = await navigatePage(initialPage, url)
    let authDetection = await detectAuthWall(initialPage, responseStatus)
    authWallDetected = authDetection.detected
    finalUrl = authDetection.finalUrl

    if (authMode === 'auto' && authDetection.detected && hasManagedProfile(options.dataDir, url)) {
      const visitorDetection = authDetection
      await closeRuntime(runtime)
      runtime = null
      initialPage = null
      try {
        runtime = await launchRuntime(executablePath, 'managed', options.dataDir, url, true)
      } catch {
        throw new AuthenticationRequiredError(visitorDetection)
      }
      initialPage = runtime.context.pages()[0] || (await runtime.context.newPage())
      await initialPage.setViewportSize(initialViewport)
      responseStatus = await navigatePage(initialPage, url)
      authDetection = await detectAuthWall(initialPage, responseStatus)
      finalUrl = authDetection.finalUrl

      if (!authDetection.detected) accessMode = 'managed'
    }

    if (authMode === 'auto' && authDetection.detected) {
      throw new AuthenticationRequiredError(authDetection)
    }

    if (accessMode === 'managed' && authDetection.detected && options.onLoginRequired) {
      await closeRuntime(runtime)
      runtime = null
      initialPage = null

      onProgress?.('progress.openingLoginBrowser', 7)
      runtime = await launchRuntime(executablePath, 'managed', options.dataDir, url, false)
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
        runtime = await launchRuntime(executablePath, 'anonymous', options.dataDir, url, true)
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
    let allInteractions: InteractionStyles = { hover: [], focus: [], active: [] }
    let darkModeResult: DarkModeResult | null = null
    let components: ComponentPattern[] = []
    let breakpoints: ResponsiveBreakpoint[] = []
    let motion: MotionToken[] = []

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

      if (i === 0) {
        allInteractions = await extractInteractionStyles(page)
      }

      if (i === 0 && options.extractDarkMode !== false) {
        darkModeResult = await extractDarkMode(page)
      }

      // Detect components, breakpoints, motion (first viewport only)
      if (i === 0) {
        components = await detectComponents(page)
        breakpoints = await detectBreakpoints(page)
        motion = await detectMotion(page)
      }

      const screenshotPath = path.join(screenshotDir, `${Date.now()}-page-1-${vpName}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      screenshots.push(screenshotPath)
      pageScreenshots.push({
        url: page.url(),
        path: screenshotPath,
        viewport: vpName,
      })

      if (page !== initialPage) await page.close()
    }

    // Multi-page analysis: discover and visit sub-pages for richer token extraction
    const subPageLimit = pageLimit - 1
    if (subPageLimit > 0) {
      const mainViewport = VIEWPORTS[viewportNames[0]] || VIEWPORTS.desktop
      const mainViewportName = viewportNames[0] || 'desktop'
      const discoveryPage = await runtime.context.newPage()
      await discoveryPage.setViewportSize(mainViewport)
      await navigatePage(discoveryPage, url)
      onProgress?.('progress.discoveringPages', 75)

      const subPages = await discoverSubPages(discoveryPage, url, subPageLimit)
      await discoveryPage.close()

      for (let i = 0; i < subPages.length; i++) {
        const subUrl = subPages[i]
        onProgress?.(
          `progress.analyzingPage::${i + 2}::${subPages.length + 1}`,
          Math.round(76 + ((i + 1) / Math.max(subPages.length, 1)) * 8),
        )

        const subPage = await runtime.context.newPage()
        await subPage.setViewportSize(mainViewport)

        try {
          await navigatePage(subPage, subUrl, 15000)
          const subStyles = await extractStyles(subPage)
          allStyles.push(subStyles)

          const screenshotPath = path.join(screenshotDir, `${Date.now()}-page-${i + 2}-${mainViewportName}.png`)
          await subPage.screenshot({ path: screenshotPath, fullPage: true })
          screenshots.push(screenshotPath)
          pageScreenshots.push({
            url: subPage.url(),
            path: screenshotPath,
            viewport: mainViewportName,
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
    const clusteredColors = clusterColors(mergedStyles.colors)

    onProgress?.('progress.generatingTokens', 95)
    const tokens = buildDesignTokens(mergedStyles, clusteredColors)
    const featureTags = generateFeatureTags(tokens, mergedStyles)

    onProgress?.('progress.done', 100)

    return {
      tokens,
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

function mergeStyles(stylesList: ExtractedStyles[]): ExtractedStyles {
  const merged: ExtractedStyles = {
    colors: [],
    fontFamilies: [],
    fontSizes: [],
    fontWeights: [],
    lineHeights: [],
    letterSpacings: [],
    spacings: [],
    radii: [],
    shadows: [],
    borders: [],
    cssVariables: {},
    backgroundColors: [],
    textColors: [],
    zIndices: [],
    transitions: [],
    usageCount: {},
  }

  for (const styles of stylesList) {
    merged.colors.push(...styles.colors)
    merged.fontFamilies.push(...styles.fontFamilies)
    merged.fontSizes.push(...styles.fontSizes)
    merged.fontWeights.push(...styles.fontWeights)
    merged.lineHeights.push(...styles.lineHeights)
    merged.letterSpacings.push(...(styles.letterSpacings || []))
    merged.spacings.push(...styles.spacings)
    merged.radii.push(...styles.radii)
    merged.shadows.push(...styles.shadows)
    merged.borders.push(...styles.borders)
    merged.backgroundColors.push(...styles.backgroundColors)
    merged.textColors.push(...styles.textColors)
    merged.zIndices.push(...(styles.zIndices || []))
    merged.transitions.push(...(styles.transitions || []))
    Object.assign(merged.cssVariables, styles.cssVariables)
    for (const [key, count] of Object.entries(styles.usageCount)) {
      merged.usageCount[key] = (merged.usageCount[key] || 0) + count
    }
  }

  merged.colors = [...new Set(merged.colors)]
  merged.fontFamilies = [...new Set(merged.fontFamilies)]
  merged.fontSizes = [...new Set(merged.fontSizes)]
  merged.fontWeights = [...new Set(merged.fontWeights)]
  merged.lineHeights = [...new Set(merged.lineHeights)]
  merged.spacings = [...new Set(merged.spacings)]
  merged.radii = [...new Set(merged.radii)]
  merged.shadows = [...new Set(merged.shadows)]
  merged.borders = [...new Set(merged.borders)]
  merged.backgroundColors = [...new Set(merged.backgroundColors)]
  merged.textColors = [...new Set(merged.textColors)]

  return merged
}

async function discoverSubPages(page: Page, baseUrl: string, max: number): Promise<string[]> {
  const origin = new URL(baseUrl).origin
  const links: string[] = await page.evaluate((orig: string) => {
    const anchors = Array.from(
      document.querySelectorAll('nav a, header a, [role="navigation"] a, .nav a, .sidebar a, a'),
    )
    const hrefs = anchors
      .map((a) => a.getAttribute('href'))
      .filter(Boolean)
      .map((href) => {
        try {
          return new URL(href!, orig).href
        } catch {
          return null
        }
      })
      .filter((h): h is string => h !== null && h.startsWith(orig))
      .filter(
        (h) =>
          !h.includes('#') &&
          !h.includes('logout') &&
          !h.includes('signout') &&
          !h.includes('/api/') &&
          !h.includes('/auth/') &&
          !h.endsWith('.pdf') &&
          !h.endsWith('.zip'),
      )
    return [...new Set(hrefs)]
  }, origin)

  return links.filter((l) => l !== baseUrl && l !== baseUrl + '/').slice(0, max)
}
