import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { type Browser, type BrowserContext, type Page, chromium } from 'playwright-core'

import {
  AI_IMAGE_FINGERPRINT_CANDIDATE_COUNT,
  prepareEvidenceImageFingerprints,
  prepareEvidenceImageSummaries,
} from '../ai/image-summary.js'
import {
  type CapturedPageEvidence,
  buildDesignEvidence,
  extractPageEvidence,
  observeSafeInteractions,
} from '../design-evidence/index.js'
import { selectEvidencePackage } from '../design-intelligence/evidence-selector.js'
import { detectAuthWall } from './auth-wall.js'
import { findBrowser, findHeadlessBrowser } from './browser-finder.js'
import {
  getManagedProfileDir,
  getManagedStorageStatePath,
  hasManagedProfile,
  hasManagedStorageState,
  markManagedSession,
} from './browser-session.js'
import { clusterColors } from './color-cluster.js'
import { type ComponentPattern, detectComponents, mergeComponentPatterns } from './component-detect.js'
import { extractDarkMode } from './dark-mode-detect.js'
import {
  AuthenticationBrowserClosedError,
  AuthenticationCancelledError,
  AuthenticationRequiredError,
} from './errors.js'
import { buildEvidenceBackedClaims, generateFeatureTags } from './feature-tags.js'
import { type DiscoveredPage, discoverPages } from './page-discovery.js'
import { ensurePageHealth } from './page-health.js'
import { freezePageAnimations, preparePageForExtraction } from './page-preparer.js'
import {
  type MotionToken,
  type ResponsiveBreakpoint,
  detectBreakpoints,
  detectMotion,
  mergeMotionTokens,
  mergeResponsiveBreakpoints,
} from './responsive-motion.js'
import { detectTechStack, extractInteractionStyles, extractStyles } from './style-extractor.js'
import { mergeStyles, mergeStylesWithNormalizedUsage } from './style-merge.js'
import { buildDesignTokens, normalizeDesignTokenUsageCount } from './token-builder.js'
import { type TokenEvidenceCapture, buildTokenEvidence } from './token-evidence.js'
import type {
  AnalysisOptions,
  AnalysisResult,
  AnalysisTiming,
  DarkModeResult,
  DesignToken,
  ExtractedStyles,
  ExtractionIssue,
  InteractionStyles,
  LoginDecision,
  PageScreenshot,
} from './types.js'
import { configurePageViewport } from './viewport-emulation.js'

export type { ComponentPattern } from './component-detect.js'
export type { MotionToken, ResponsiveBreakpoint } from './responsive-motion.js'
export type { AuthWallDetection, AuthWallReason } from './auth-wall.js'
export type { DesignEvidence } from '../design-evidence/types.js'
export { findBrowser, findHeadlessBrowser } from './browser-finder.js'
export {
  AuthenticationBrowserClosedError,
  AuthenticationCancelledError,
  AuthenticationRequiredError,
} from './errors.js'
export type {
  AnalysisOptions,
  AnalysisResult,
  AnalysisTiming,
  AuthMode,
  DarkModeResult,
  DesignToken,
  ExtractionIssue,
  ExtractedStyles,
  InteractionStyles,
  LoginDecision,
  LoginRequest,
  PageCoverage,
  PageScreenshot,
  TokenConfidence,
  TokenEvidence,
} from './types.js'
export type { PageDiscoveryMode, PageKind } from './page-discovery.js'

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
}

function emptyDesignTokens(): DesignToken {
  return {
    colors: {},
    typography: {
      fontFamilies: [],
      fontStacks: [],
      fontSizes: [],
      fontWeights: [],
      lineHeights: [],
      letterSpacings: [],
    },
    spacing: [],
    radii: [],
    shadows: [],
    borders: [],
    zIndices: [],
    transitions: [],
    usageCount: {},
    evidence: {},
  }
}

function pageStructureTraits(snapshot: Awaited<ReturnType<typeof extractPageEvidence>>): Set<string> {
  return new Set([
    ...snapshot.sections.map((section, index) => `section:${index}:${section.role}:${section.layoutMode}`),
    ...snapshot.components.map((component) => `component:${component.type}`),
    ...snapshot.layoutNodes.map((node) => `layout:${node.role}`),
  ])
}

function pageStructureDistance(first: Set<string>, second: Set<string>): number {
  const union = new Set([...first, ...second])
  if (union.size === 0) return 0
  const intersection = [...first].filter((trait) => second.has(trait)).length
  return 1 - intersection / union.size
}

async function runWithinDeadline<T>(deadline: number, run: () => Promise<T>): Promise<T> {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new Error('adaptive-mobile-budget-exceeded')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('adaptive-mobile-budget-exceeded')), remaining)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

interface BrowserRuntime {
  browser: Browser | null
  context: BrowserContext
  kind: 'ephemeral' | 'managed-profile' | 'managed-state'
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
      const serverRaw = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
        { encoding: 'utf8', timeout: 3000 },
      )
      const match = serverRaw.match(/ProxyServer\s+REG_SZ\s+(.+)/i)
      if (match?.[1]) {
        const server = match[1].trim()
        if (server) return server.includes('://') ? server : `http://${server}`
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
    const storageStatePath = getManagedStorageStatePath(dataDir, url)
    if (headless && hasManagedStorageState(dataDir, url)) {
      const browser = await chromium.launch({
        executablePath,
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
        ...proxyConfig,
      })
      const context = await browser.newContext({
        storageState: storageStatePath,
        ...proxyConfig,
      })
      return { browser, context, kind: 'managed-state' }
    }

    const profileDir = getManagedProfileDir(dataDir, url)
    fs.mkdirSync(profileDir, { recursive: true })
    const context = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless,
      args: ['--disable-blink-features=AutomationControlled', '--no-default-browser-check', '--no-first-run'],
      viewport: VIEWPORTS.desktop,
      ...proxyConfig,
    })
    return { browser: null, context, kind: 'managed-profile' }
  }

  const browser = await chromium.launch({
    executablePath,
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
    ...proxyConfig,
  })
  const context = await browser.newContext(proxyConfig)
  return { browser, context, kind: 'ephemeral' }
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

async function navigatePage(page: Page, url: string, timeout = 60000): Promise<number | undefined> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  return response?.status()
}

async function saveManagedStorageState(context: BrowserContext, dataDir: string, url: string): Promise<void> {
  const storageStatePath = getManagedStorageStatePath(dataDir, url)
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true })
  const storageState = await context.storageState({ indexedDB: true })
  fs.writeFileSync(storageStatePath, JSON.stringify(storageState), { encoding: 'utf8', mode: 0o600 })
  fs.chmodSync(storageStatePath, 0o600)
}

async function switchManagedRuntimeToHeadless(
  runtime: BrowserRuntime,
  page: Page,
  responseStatus: number | undefined,
  detection: Awaited<ReturnType<typeof detectAuthWall>>,
  executablePath: string,
  dataDir: string,
  url: string,
  viewportName: string,
  viewport: { width: number; height: number },
  proxyServer?: string,
): Promise<{
  runtime: BrowserRuntime
  page: Page
  responseStatus: number | undefined
  detection: Awaited<ReturnType<typeof detectAuthWall>>
}> {
  if (runtime.kind !== 'managed-profile' || detection.detected) {
    return { runtime, page, responseStatus, detection }
  }

  try {
    await saveManagedStorageState(runtime.context, dataDir, url)
  } catch {
    return { runtime, page, responseStatus, detection }
  }

  let headlessRuntime: BrowserRuntime | null = null
  try {
    headlessRuntime = await launchRuntime(executablePath, 'managed', dataDir, url, true, proxyServer)
    const headlessPage = headlessRuntime.context.pages()[0] || (await headlessRuntime.context.newPage())
    await configurePageViewport(headlessPage, viewportName, viewport)
    const headlessResponseStatus = await navigatePage(headlessPage, url)
    const headlessDetection = await detectAuthWall(headlessPage, headlessResponseStatus)
    if (headlessDetection.detected) {
      await closeRuntime(headlessRuntime)
      return { runtime, page, responseStatus, detection }
    }

    await closeRuntime(runtime)
    return {
      runtime: headlessRuntime,
      page: headlessPage,
      responseStatus: headlessResponseStatus,
      detection: headlessDetection,
    }
  } catch {
    if (headlessRuntime) await closeRuntime(headlessRuntime)
    return { runtime, page, responseStatus, detection }
  }
}

function mergeInteractionStyles(target: InteractionStyles, source: InteractionStyles): void {
  for (const kind of ['hover', 'focus', 'active', 'disabled'] as const) {
    const targetEntries = target[kind] || []
    const seen = new Set(targetEntries.map((styles) => JSON.stringify(styles)))
    for (const styles of source[kind] || []) {
      const fingerprint = JSON.stringify(styles)
      if (seen.has(fingerprint)) continue
      targetEntries.push(styles)
      seen.add(fingerprint)
    }
    if (kind === 'disabled') target.disabled = targetEntries
  }
}

function extractionReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isPageHealthExtractionIssue(issue: ExtractionIssue): boolean {
  return /:health:/.test(issue.stage)
}

function publicExtractionIssueReason(reason: string): string {
  return (
    reason
      .replace(/https?:\/\/[^\s]+/gi, (value) => {
        try {
          const url = new URL(value)
          return `${url.origin}${url.pathname}`
        } catch {
          return '[url]'
        }
      })
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'unknown reason'
  )
}

function extractionIssueLimitation(issue: ExtractionIssue): string {
  return `extraction-issue:${encodeURIComponent(issue.stage.slice(0, 120))}:${encodeURIComponent(publicExtractionIssueReason(issue.reason))}`
}

function appendExtractionIssueLimitation(limitations: string[], issue: ExtractionIssue): void {
  if (isPageHealthExtractionIssue(issue)) return
  const limitation = extractionIssueLimitation(issue)
  if (!limitations.includes(limitation)) limitations.push(limitation)
}

function inspectPngDimensions(filePath: string): { width: number; height: number } | null {
  try {
    const header = Buffer.alloc(24)
    const descriptor = fs.openSync(filePath, 'r')
    try {
      if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length) return null
    } finally {
      fs.closeSync(descriptor)
    }
    if (header.toString('ascii', 1, 4) !== 'PNG') return null
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
  } catch {
    return null
  }
}

function recordScreenshotDimensionIssue(
  issues: ExtractionIssue[],
  stage: string,
  filePath: string,
  expectedWidth: number,
  expectedHeight: number,
): void {
  const actual = inspectPngDimensions(filePath)
  if (!actual) {
    issues.push({ stage, reason: 'screenshot-dimensions-unreadable' })
    return
  }
  if (Math.abs(actual.width - expectedWidth) > 4 || Math.abs(actual.height - expectedHeight) > 8) {
    issues.push({
      stage,
      reason: `screenshot-dimensions-mismatch expected=${Math.round(expectedWidth)}x${Math.round(expectedHeight)} actual=${actual.width}x${actual.height}`,
    })
  }
}

function pageIdentityUrl(value: string): string {
  try {
    const pageUrl = new URL(value)
    pageUrl.username = ''
    pageUrl.password = ''
    pageUrl.search = ''
    pageUrl.hash = ''
    return pageUrl.href
  } catch {
    return value.split(/[?#]/, 1)[0]
  }
}

async function guardExtractionStage<T>(
  issues: ExtractionIssue[],
  stage: string,
  fallback: T,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    issues.push({ stage, reason: extractionReason(error) })
    return fallback
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
  let userWaitMs = 0
  const activeElapsedMs = () => Math.max(0, Date.now() - startTime - userWaitMs)
  const timing: AnalysisTiming = {
    browserMs: 0,
    preparationMs: 0,
    extractionMs: 0,
    healthGateMs: 0,
    screenshotCaptureMs: 0,
    imageFingerprintMs: 0,
    digestMs: 0,
    imageSummaryMs: 0,
    aiQueueMs: 0,
    aiNetworkMs: 0,
    aiTransportAttempts: 0,
    aiInvokeMs: 0,
    validationMs: 0,
    totalMs: 0,
    imageCount: 0,
    cacheHit: false,
    budgetExceeded: [],
  }
  const measure = async <T>(
    key: 'preparationMs' | 'extractionMs' | 'healthGateMs' | 'screenshotCaptureMs' | 'imageSummaryMs',
    run: () => Promise<T>,
  ) => {
    const startedAt = Date.now()
    try {
      return await run()
    } finally {
      timing[key] = (timing[key] || 0) + (Date.now() - startedAt)
    }
  }
  const analysisId = randomUUID()
  const viewportNames = options.viewports || ['desktop', 'mobile']
  const pageLimit = Math.min(5, Math.max(1, Math.floor(options.maxPages ?? 3)))
  const screenshotDir = path.join(options.dataDir, 'screenshots')
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true })
  }

  onProgress?.('progress.launchingBrowser', 5)

  const interactiveExecutablePath = findBrowser()
  if (!interactiveExecutablePath) {
    throw new Error('Chrome/Edge not found. Please install Google Chrome or Microsoft Edge.')
  }
  const headlessExecutablePath = findHeadlessBrowser(options.browserResourcesDir) || interactiveExecutablePath
  console.log('[imprint] interactive browser resolved:', interactiveExecutablePath)
  console.log('[imprint] headless browser resolved:', headlessExecutablePath)

  const authMode = options.authMode ?? (options.useSession === false ? 'anonymous' : 'managed')
  let accessMode: 'anonymous' | 'managed' = authMode === 'managed' ? 'managed' : 'anonymous'
  const initialViewport = VIEWPORTS[viewportNames[0]] || VIEWPORTS.desktop

  let runtime: BrowserRuntime | null = null
  let initialPage: Page | null = null
  let authWallDetected = false
  let finalUrl = url

  try {
    const initialExecutablePath =
      accessMode === 'managed' && !hasManagedStorageState(options.dataDir, url)
        ? interactiveExecutablePath
        : headlessExecutablePath
    runtime = await launchRuntime(initialExecutablePath, accessMode, options.dataDir, url, true, options.proxyServer)
    initialPage = runtime.context.pages()[0] || (await runtime.context.newPage())
    await configurePageViewport(initialPage, viewportNames[0], initialViewport)

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
        const managedExecutablePath = hasManagedStorageState(options.dataDir, url)
          ? headlessExecutablePath
          : interactiveExecutablePath
        managedRuntime = await launchRuntime(
          managedExecutablePath,
          'managed',
          options.dataDir,
          url,
          true,
          options.proxyServer,
        )
        const managedPage = managedRuntime.context.pages()[0] || (await managedRuntime.context.newPage())
        await configurePageViewport(managedPage, viewportNames[0], initialViewport)
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
      runtime = await launchRuntime(
        interactiveExecutablePath,
        'managed',
        options.dataDir,
        url,
        false,
        options.proxyServer,
      )
      let loginPage = runtime.context.pages()[0] || (await runtime.context.newPage())
      await configurePageViewport(loginPage, viewportNames[0], initialViewport)
      responseStatus = await navigatePage(loginPage, url)
      authDetection = await detectAuthWall(loginPage, responseStatus)

      const loginAbortController = new AbortController()
      runtime.context.once('close', () => loginAbortController.abort())
      let retry = false
      let continueAnonymously = false

      while (authDetection.detected) {
        onProgress?.(retry ? 'progress.loginIncomplete' : 'progress.waitingForLogin', 8)
        const waitStartedAt = Date.now()
        let decision: LoginDecision
        try {
          decision = await options.onLoginRequired({ detection: authDetection, retry }, loginAbortController.signal)
        } finally {
          userWaitMs += Date.now() - waitStartedAt
        }
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
        runtime = await launchRuntime(
          headlessExecutablePath,
          'anonymous',
          options.dataDir,
          url,
          true,
          options.proxyServer,
        )
        accessMode = 'anonymous'
        initialPage = runtime.context.pages()[0] || (await runtime.context.newPage())
        await configurePageViewport(initialPage, viewportNames[0], initialViewport)
        responseStatus = await navigatePage(initialPage, url)
        authDetection = await detectAuthWall(initialPage, responseStatus)
      } else {
        initialPage = loginPage
      }
      finalUrl = authDetection.finalUrl
    }

    if (!runtime) throw new Error('Browser session is not available')
    if (accessMode === 'managed' && initialPage && !authDetection.detected) {
      const switchedRuntime = await switchManagedRuntimeToHeadless(
        runtime,
        initialPage,
        responseStatus,
        authDetection,
        headlessExecutablePath,
        options.dataDir,
        url,
        viewportNames[0],
        initialViewport,
        options.proxyServer,
      )
      runtime = switchedRuntime.runtime
      initialPage = switchedRuntime.page
      responseStatus = switchedRuntime.responseStatus
      authDetection = switchedRuntime.detection
      finalUrl = authDetection.finalUrl
    }
    if (accessMode === 'managed' && !authDetection.detected) markManagedSession(options.dataDir, url)
    timing.browserMs = activeElapsedMs()

    const allStyles: ExtractedStyles[] = []
    const aiEligibleStyles: ExtractedStyles[] = []
    const styleCaptures: TokenEvidenceCapture[] = []
    const aiEligibleStyleCaptures: TokenEvidenceCapture[] = []
    const screenshots: string[] = []
    const pageScreenshots: PageScreenshot[] = []
    const capturedPageEvidence: CapturedPageEvidence[] = []
    const allInteractions: InteractionStyles = { hover: [], focus: [], active: [], disabled: [] }
    const extractionIssues: ExtractionIssue[] = []
    const analysisLimitations: string[] = []
    const analyzedPages = new Map<
      string,
      { source: 'requested' | 'dom' | 'sitemap'; kind: 'entry' | DiscoveredPage['kind'] }
    >()
    let discoveredPages: DiscoveredPage[] = []
    let discoveredPageCount = 0
    let darkModeResult: DarkModeResult | null = null
    let components: ComponentPattern[] = []
    let breakpoints: ResponsiveBreakpoint[] = []
    let evidenceBreakpoints: ResponsiveBreakpoint[] = []
    let entryBreakpointWidths = new Set<number>()
    let entryStructure = new Set<string>()
    let motion: MotionToken[] = []
    let evidenceMotion: MotionToken[] = []
    let techStack: import('../design-evidence/types.js').TechStackInfo | undefined
    let adaptiveMobileCaptured = false

    for (let i = 0; i < viewportNames.length; i++) {
      const vpName = viewportNames[i]
      const viewport = VIEWPORTS[vpName] || VIEWPORTS.desktop
      const progress = 10 + (i / viewportNames.length) * 70

      onProgress?.(`progress.analyzingViewport::${vpName}`, Math.round(progress))

      const page: Page =
        i === 0 && initialPage && !initialPage.isClosed() ? initialPage : await runtime.context.newPage()
      await configurePageViewport(page, vpName, viewport)
      const pageResponseStatus = page !== initialPage ? await navigatePage(page, url) : responseStatus
      if (i === 0) finalUrl = page.url()

      const stagePrefix = `page-1:${vpName}`
      const preparation = await measure('preparationMs', () => preparePageForExtraction(page))
      extractionIssues.push(
        ...preparation.issues.map((issue) => ({
          stage: `${stagePrefix}:prepare:${issue.stage}`,
          reason: issue.reason,
        })),
      )
      const health = await measure('healthGateMs', () =>
        ensurePageHealth(page, { expectedUrl: url, responseStatus: pageResponseStatus }),
      )
      extractionIssues.push(
        ...health.issues.map((issue) => ({
          stage: `${stagePrefix}:health:${issue.code}`,
          reason: issue.detail || issue.severity,
        })),
      )
      const explicitlyAnalyzableAccessSurface = health.issues.some(
        (issue) => issue.code === 'auth-wall' || issue.code === 'captcha',
      )
      if (health.status === 'unusable' && !explicitlyAnalyzableAccessSurface) {
        if (page !== initialPage) await page.close()
        continue
      }

      const extractionStartedAt = Date.now()
      if (i === 0) {
        motion = await guardExtractionStage(extractionIssues, `${stagePrefix}:motion`, [], () => detectMotion(page))
        if (health.aiEligible) evidenceMotion = motion
      }
      const animationIssue = await freezePageAnimations(page)
      if (animationIssue) {
        extractionIssues.push({
          stage: `${stagePrefix}:prepare:${animationIssue.stage}`,
          reason: animationIssue.reason,
        })
      }

      const styles = await guardExtractionStage(extractionIssues, `${stagePrefix}:styles`, mergeStyles([]), () =>
        extractStyles(page),
      )
      allStyles.push(styles)
      styleCaptures.push({ url: page.url(), viewport: vpName, styles })
      if (health.aiEligible) {
        aiEligibleStyles.push(styles)
        aiEligibleStyleCaptures.push({ url: page.url(), viewport: vpName, styles })
      }
      analyzedPages.set(pageIdentityUrl(page.url()), { source: 'requested', kind: 'entry' })

      const pageInteractionStyles = await guardExtractionStage(
        extractionIssues,
        `${stagePrefix}:interaction-styles`,
        { hover: [], focus: [], active: [], disabled: [] },
        () => extractInteractionStyles(page),
      )
      mergeInteractionStyles(allInteractions, pageInteractionStyles)

      if (i === 0 && options.extractDarkMode !== false) {
        darkModeResult = await guardExtractionStage(extractionIssues, `${stagePrefix}:dark-mode`, null, () =>
          extractDarkMode(page, styles),
        )
      }

      if (i === 0) {
        components = await guardExtractionStage(extractionIssues, `${stagePrefix}:components`, [], () =>
          detectComponents(page),
        )
        breakpoints = await guardExtractionStage(extractionIssues, `${stagePrefix}:breakpoints`, [], () =>
          detectBreakpoints(page),
        )
        entryBreakpointWidths = new Set(breakpoints.map((breakpoint) => breakpoint.width))
        if (health.aiEligible) evidenceBreakpoints = breakpoints
        techStack = await guardExtractionStage(extractionIssues, `${stagePrefix}:tech-stack`, undefined, () =>
          detectTechStack(page),
        )
      }

      const screenshotPath = path.join(screenshotDir, `${Date.now()}-page-1-${vpName}.png`)
      const evidenceSnapshot = await extractPageEvidence(page, vpName)
      if (i === 0) entryStructure = pageStructureTraits(evidenceSnapshot)
      timing.extractionMs = (timing.extractionMs || 0) + (Date.now() - extractionStartedAt)
      const interactionObservations =
        i === 0 && accessMode === 'anonymous' && !authDetection.detected
          ? await guardExtractionStage(extractionIssues, `${stagePrefix}:safe-interactions`, [], () =>
              observeSafeInteractions(page, evidenceSnapshot, 4, 6_000),
            )
          : []
      const supplementalImages: NonNullable<CapturedPageEvidence['supplementalImages']> = []
      if (i === 0 || vpName !== 'desktop') {
        const viewportPath = path.join(screenshotDir, `${Date.now()}-page-1-${vpName}-viewport.png`)
        await measure('screenshotCaptureMs', () => page.screenshot({ path: viewportPath, fullPage: false }))
        recordScreenshotDimensionIssue(
          extractionIssues,
          `${stagePrefix}:screenshot:viewport`,
          viewportPath,
          viewport.width,
          viewport.height,
        )
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
          .filter((section) => {
            const sectionTop = section.rect.y * evidenceSnapshot.height
            const sectionHeight = section.rect.height * evidenceSnapshot.height
            return sectionTop >= viewport.height * 0.5 || sectionHeight <= viewport.height * 1.25
          })
          .slice(0, 2)
        for (let sectionIndex = 0; sectionIndex < representativeSections.length; sectionIndex += 1) {
          const section = representativeSections[sectionIndex]
          const sectionX = Math.min(viewport.width - 1, Math.max(0, section.rect.x * evidenceSnapshot.width))
          const sectionY = Math.max(0, section.rect.y * evidenceSnapshot.height)
          const scrollY = Math.min(
            Math.max(0, evidenceSnapshot.height - viewport.height),
            Math.max(0, Math.floor(sectionY)),
          )
          await page.evaluate((targetY) => window.scrollTo(0, targetY), scrollY)
          await page.waitForTimeout(50)
          const clip = {
            x: sectionX,
            y: Math.max(0, sectionY - scrollY),
            width: Math.max(1, Math.min(section.rect.width * evidenceSnapshot.width, viewport.width - sectionX)),
            height: Math.max(
              1,
              Math.min(
                section.rect.height * evidenceSnapshot.height,
                viewport.height - Math.max(0, sectionY - scrollY),
              ),
            ),
          }
          const sourceRect = {
            x: clip.x / Math.max(evidenceSnapshot.width, 1),
            y: (scrollY + clip.y) / Math.max(evidenceSnapshot.height, 1),
            width: clip.width / Math.max(evidenceSnapshot.width, 1),
            height: clip.height / Math.max(evidenceSnapshot.height, 1),
          }
          const regionPath = path.join(screenshotDir, `${Date.now()}-page-1-${vpName}-region-${sectionIndex + 1}.png`)
          try {
            await measure('screenshotCaptureMs', () => page.screenshot({ path: regionPath, clip }))
            recordScreenshotDimensionIssue(
              extractionIssues,
              `${stagePrefix}:screenshot:region`,
              regionPath,
              clip.width,
              clip.height,
            )
            supplementalImages.push({
              kind: 'region-crop',
              path: regionPath,
              width: Math.round(clip.width),
              height: Math.round(clip.height),
              sourceRect,
              sectionKey: section.key,
            })
          } catch {
            // Full-page evidence remains available when a dynamic region cannot be clipped reliably.
          }
        }
        await page.evaluate(() => window.scrollTo(0, 0))
      }
      await measure('screenshotCaptureMs', () => page.screenshot({ path: screenshotPath, fullPage: true }))
      recordScreenshotDimensionIssue(
        extractionIssues,
        `${stagePrefix}:screenshot:overview`,
        screenshotPath,
        evidenceSnapshot.width,
        evidenceSnapshot.height,
      )
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
        health,
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
        await configurePageViewport(discoveryPage, mainViewportName, mainViewport)
        await navigatePage(discoveryPage, url)
      }
      onProgress?.('progress.discoveringPages', 75)

      const discovery = await discoverPages(
        discoveryPage,
        discoveryPage.url() || finalUrl,
        subPageLimit,
        options.pageDiscovery,
      )
      discoveredPages = discovery.pages
      discoveredPageCount = discovery.candidateCount
      extractionIssues.push(
        ...discovery.issues.map((issue) => ({
          stage: `page-discovery:${issue.stage}`,
          reason: issue.reason,
        })),
      )
      if (!canReuseInitialPage) await discoveryPage.close()

      for (let i = 0; i < discoveredPages.length; i++) {
        const discoveredPage = discoveredPages[i]
        const subUrl = discoveredPage.url
        onProgress?.(
          `progress.analyzingPage::${i + 2}::${discoveredPages.length + 1}`,
          Math.round(76 + ((i + 1) / Math.max(discoveredPages.length, 1)) * 8),
        )

        const subPage = await runtime.context.newPage()
        await configurePageViewport(subPage, mainViewportName, mainViewport)
        let adaptiveAbortTimer: ReturnType<typeof setTimeout> | undefined

        try {
          const subPageStatus = await navigatePage(subPage, subUrl, 15000)
          if (subPageStatus && subPageStatus >= 400) continue

          const isHtmlDocument = await subPage.evaluate(
            () => document.contentType === 'text/html' || document.contentType === 'application/xhtml+xml',
          )
          if (!isHtmlDocument) continue

          const subPageAuthDetection = await detectAuthWall(subPage, subPageStatus)
          if (subPageAuthDetection.detected) continue

          const stagePrefix = `page-${i + 2}:${mainViewportName}`
          const preparation = await measure('preparationMs', () => preparePageForExtraction(subPage))
          extractionIssues.push(
            ...preparation.issues.map((issue) => ({
              stage: `${stagePrefix}:prepare:${issue.stage}`,
              reason: issue.reason,
            })),
          )
          const health = await measure('healthGateMs', () =>
            ensurePageHealth(subPage, { expectedUrl: subUrl, responseStatus: subPageStatus }),
          )
          extractionIssues.push(
            ...health.issues.map((issue) => ({
              stage: `${stagePrefix}:health:${issue.code}`,
              reason: issue.detail || issue.severity,
            })),
          )
          if (health.status === 'unusable') continue
          const extractionStartedAt = Date.now()
          const subPageMotion = await guardExtractionStage(extractionIssues, `${stagePrefix}:motion`, [], () =>
            detectMotion(subPage),
          )
          motion = mergeMotionTokens([motion, subPageMotion])
          if (health.aiEligible) evidenceMotion = mergeMotionTokens([evidenceMotion, subPageMotion])
          const animationIssue = await freezePageAnimations(subPage)
          if (animationIssue) {
            extractionIssues.push({
              stage: `${stagePrefix}:prepare:${animationIssue.stage}`,
              reason: animationIssue.reason,
            })
          }

          const subStyles = await guardExtractionStage(extractionIssues, `${stagePrefix}:styles`, mergeStyles([]), () =>
            extractStyles(subPage),
          )
          allStyles.push(subStyles)
          styleCaptures.push({ url: subPage.url(), viewport: mainViewportName, styles: subStyles })
          if (health.aiEligible) {
            aiEligibleStyles.push(subStyles)
            aiEligibleStyleCaptures.push({ url: subPage.url(), viewport: mainViewportName, styles: subStyles })
          }
          analyzedPages.set(pageIdentityUrl(subPage.url()), {
            source: discoveredPage.source,
            kind: discoveredPage.kind,
          })
          const pageInteractionStyles = await guardExtractionStage(
            extractionIssues,
            `${stagePrefix}:interaction-styles`,
            { hover: [], focus: [], active: [], disabled: [] },
            () => extractInteractionStyles(subPage),
          )
          mergeInteractionStyles(allInteractions, pageInteractionStyles)
          const subPageComponents = await guardExtractionStage(extractionIssues, `${stagePrefix}:components`, [], () =>
            detectComponents(subPage),
          )
          components = mergeComponentPatterns([components, subPageComponents])
          const subPageBreakpoints = await guardExtractionStage(
            extractionIssues,
            `${stagePrefix}:breakpoints`,
            [],
            () => detectBreakpoints(subPage),
          )
          breakpoints = mergeResponsiveBreakpoints([breakpoints, subPageBreakpoints])
          if (health.aiEligible) {
            evidenceBreakpoints = mergeResponsiveBreakpoints([evidenceBreakpoints, subPageBreakpoints])
          }

          const screenshotPath = path.join(screenshotDir, `${Date.now()}-page-${i + 2}-${mainViewportName}.png`)
          const evidenceSnapshot = await extractPageEvidence(subPage, mainViewportName)
          timing.extractionMs = (timing.extractionMs || 0) + (Date.now() - extractionStartedAt)
          const interactionObservations =
            accessMode === 'anonymous'
              ? await guardExtractionStage(extractionIssues, `${stagePrefix}:safe-interactions`, [], () =>
                  observeSafeInteractions(subPage, evidenceSnapshot, 4, 6_000),
                )
              : []
          const viewportPath = path.join(screenshotDir, `${Date.now()}-page-${i + 2}-${mainViewportName}-viewport.png`)
          await measure('screenshotCaptureMs', () => subPage.screenshot({ path: viewportPath, fullPage: false }))
          recordScreenshotDimensionIssue(
            extractionIssues,
            `${stagePrefix}:screenshot:viewport`,
            viewportPath,
            mainViewport.width,
            mainViewport.height,
          )
          await measure('screenshotCaptureMs', () => subPage.screenshot({ path: screenshotPath, fullPage: true }))
          recordScreenshotDimensionIssue(
            extractionIssues,
            `${stagePrefix}:screenshot:overview`,
            screenshotPath,
            evidenceSnapshot.width,
            evidenceSnapshot.height,
          )
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
            interactionObservations,
            health,
            supplementalImages: [
              {
                kind: 'viewport-crop',
                path: viewportPath,
                width: mainViewport.width,
                height: mainViewport.height,
                sourceRect: {
                  x: 0,
                  y: 0,
                  width: Math.min(1, mainViewport.width / evidenceSnapshot.width),
                  height: Math.min(1, mainViewport.height / evidenceSnapshot.height),
                },
              },
            ],
          })

          const entryRole = capturedPageEvidence[0]?.snapshot.role
          const hasNovelBreakpoints = subPageBreakpoints.some(
            (breakpoint) => !entryBreakpointWidths.has(breakpoint.width),
          )
          const hasDistinctStructure =
            pageStructureDistance(pageStructureTraits(evidenceSnapshot), entryStructure) >= 0.35
          const adaptiveSignals = [
            evidenceSnapshot.horizontalOverflow,
            hasNovelBreakpoints,
            hasDistinctStructure,
            evidenceSnapshot.role !== 'unknown' && evidenceSnapshot.role !== entryRole,
            ['product', 'pricing', 'account', 'workspace'].includes(evidenceSnapshot.role),
          ]
          const shouldCaptureMobile =
            !adaptiveMobileCaptured &&
            mainViewportName !== 'mobile' &&
            adaptiveSignals.some(Boolean) &&
            Date.now() - startTime < 120_000

          if (shouldCaptureMobile) {
            const adaptiveStartedAt = Date.now()
            const adaptiveDeadline = Math.min(startTime + 120_000, adaptiveStartedAt + 20_000)
            const adaptiveController = new AbortController()
            adaptiveAbortTimer = setTimeout(
              () => adaptiveController.abort(new Error('adaptive-mobile-budget-exceeded')),
              Math.max(1, adaptiveDeadline - Date.now()),
            )
            const mobileStagePrefix = `page-${i + 2}:mobile-adaptive`
            const withinAdaptiveBudget = () => Date.now() < adaptiveDeadline
            await runWithinDeadline(adaptiveDeadline, () => configurePageViewport(subPage, 'mobile', VIEWPORTS.mobile))
            const mobilePageStatus = await runWithinDeadline(adaptiveDeadline, () =>
              navigatePage(subPage, subUrl, Math.max(1, adaptiveDeadline - Date.now())),
            )
            await runWithinDeadline(adaptiveDeadline, () => subPage.waitForTimeout(150))
            if (!withinAdaptiveBudget()) throw new Error('adaptive-mobile-budget-exceeded')
            const mobilePreparation = await measure('preparationMs', () =>
              runWithinDeadline(adaptiveDeadline, () =>
                preparePageForExtraction(subPage, { recovery: true, signal: adaptiveController.signal }),
              ),
            )
            extractionIssues.push(
              ...mobilePreparation.issues.map((issue) => ({
                stage: `${mobileStagePrefix}:prepare:${issue.stage}`,
                reason: issue.reason,
              })),
            )
            if (!withinAdaptiveBudget()) throw new Error('adaptive-mobile-budget-exceeded')
            const mobileHealth = await measure('healthGateMs', () =>
              runWithinDeadline(adaptiveDeadline, () =>
                ensurePageHealth(subPage, { expectedUrl: subUrl, responseStatus: mobilePageStatus }),
              ),
            )
            extractionIssues.push(
              ...mobileHealth.issues.map((issue) => ({
                stage: `${mobileStagePrefix}:health:${issue.code}`,
                reason: issue.detail || issue.severity,
              })),
            )
            if (mobileHealth.status !== 'unusable') {
              if (!withinAdaptiveBudget()) throw new Error('adaptive-mobile-budget-exceeded')
              const mobileExtractionStartedAt = Date.now()
              const mobileStyles = await guardExtractionStage(
                extractionIssues,
                `${mobileStagePrefix}:styles`,
                mergeStyles([]),
                () => runWithinDeadline(adaptiveDeadline, () => extractStyles(subPage)),
              )
              allStyles.push(mobileStyles)
              styleCaptures.push({ url: subPage.url(), viewport: 'mobile', styles: mobileStyles })
              if (mobileHealth.aiEligible) {
                aiEligibleStyles.push(mobileStyles)
                aiEligibleStyleCaptures.push({ url: subPage.url(), viewport: 'mobile', styles: mobileStyles })
              }
              const mobileInteractionStyles = await guardExtractionStage(
                extractionIssues,
                `${mobileStagePrefix}:interaction-styles`,
                { hover: [], focus: [], active: [], disabled: [] },
                () => runWithinDeadline(adaptiveDeadline, () => extractInteractionStyles(subPage)),
              )
              mergeInteractionStyles(allInteractions, mobileInteractionStyles)
              const mobileSnapshot = await runWithinDeadline(adaptiveDeadline, () =>
                extractPageEvidence(subPage, 'mobile'),
              )
              if (!withinAdaptiveBudget()) throw new Error('adaptive-mobile-budget-exceeded')
              timing.extractionMs = (timing.extractionMs || 0) + (Date.now() - mobileExtractionStartedAt)
              const mobileOverviewPath = path.join(screenshotDir, `${Date.now()}-page-${i + 2}-mobile-adaptive.png`)
              const mobileViewportPath = path.join(
                screenshotDir,
                `${Date.now()}-page-${i + 2}-mobile-adaptive-viewport.png`,
              )
              await measure('screenshotCaptureMs', () =>
                runWithinDeadline(adaptiveDeadline, () =>
                  subPage.screenshot({
                    path: mobileViewportPath,
                    fullPage: false,
                    timeout: Math.max(1, adaptiveDeadline - Date.now()),
                  }),
                ),
              )
              if (!withinAdaptiveBudget()) throw new Error('adaptive-mobile-budget-exceeded')
              await measure('screenshotCaptureMs', () =>
                runWithinDeadline(adaptiveDeadline, () =>
                  subPage.screenshot({
                    path: mobileOverviewPath,
                    fullPage: true,
                    timeout: Math.max(1, adaptiveDeadline - Date.now()),
                  }),
                ),
              )
              recordScreenshotDimensionIssue(
                extractionIssues,
                `${mobileStagePrefix}:screenshot:viewport`,
                mobileViewportPath,
                VIEWPORTS.mobile.width,
                VIEWPORTS.mobile.height,
              )
              recordScreenshotDimensionIssue(
                extractionIssues,
                `${mobileStagePrefix}:screenshot:overview`,
                mobileOverviewPath,
                mobileSnapshot.width,
                mobileSnapshot.height,
              )
              const mobilePageScreenshot = { url: subPage.url(), path: mobileOverviewPath, viewport: 'mobile' }
              screenshots.push(mobileOverviewPath)
              pageScreenshots.push(mobilePageScreenshot)
              capturedPageEvidence.push({
                screenshot: mobilePageScreenshot,
                snapshot: mobileSnapshot,
                interactionStyles: mobileInteractionStyles,
                health: mobileHealth,
                supplementalImages: [
                  {
                    kind: 'viewport-crop',
                    path: mobileViewportPath,
                    width: VIEWPORTS.mobile.width,
                    height: VIEWPORTS.mobile.height,
                    sourceRect: {
                      x: 0,
                      y: 0,
                      width: Math.min(1, VIEWPORTS.mobile.width / mobileSnapshot.width),
                      height: Math.min(1, VIEWPORTS.mobile.height / mobileSnapshot.height),
                    },
                  },
                ],
              })
              adaptiveMobileCaptured = true
            }
          } else if (!adaptiveMobileCaptured && mainViewportName !== 'mobile' && adaptiveSignals.some(Boolean)) {
            analysisLimitations.push('adaptive-mobile-skipped-budget')
          }
        } catch (error) {
          // Sub-page failed to load, skip it
          const reason = extractionReason(error)
          if (reason.includes('adaptive-mobile-budget-exceeded')) {
            analysisLimitations.push('adaptive-mobile-budget-exceeded')
            timing.budgetExceeded?.push('adaptive-mobile')
          } else {
            extractionIssues.push({ stage: `page-${i + 2}:${mainViewportName}`, reason })
          }
        } finally {
          if (adaptiveAbortTimer) clearTimeout(adaptiveAbortTimer)
          await subPage.close()
        }
      }
    }

    onProgress?.('progress.analyzingPatterns', 85)
    const tokenStartedAt = Date.now()
    const mergedStyles = mergeStyles(allStyles)
    const tokenSelectionStyles = mergeStylesWithNormalizedUsage(
      allStyles,
      styleCaptures.map((capture) => pageIdentityUrl(capture.url)),
    )

    onProgress?.('progress.clusteringColors', 90)
    const primaryPageStyles = allStyles[0] || mergedStyles
    const clusteredColors = clusterColors(
      tokenSelectionStyles.colors,
      tokenSelectionStyles.usageCount,
      primaryPageStyles.usageCount,
      tokenSelectionStyles.usageCount,
    )

    onProgress?.('progress.generatingTokens', 95)
    const tokens = buildDesignTokens(tokenSelectionStyles, clusteredColors, tokenSelectionStyles)
    tokens.usageCount = normalizeDesignTokenUsageCount(mergedStyles.usageCount)
    tokens.evidence = buildTokenEvidence(tokens, styleCaptures)
    let evidenceTokens = emptyDesignTokens()
    let evidenceMergedStyles = mergeStyles([])
    if (aiEligibleStyles.length > 0) {
      evidenceMergedStyles = mergeStyles(aiEligibleStyles)
      const evidenceSelectionStyles = mergeStylesWithNormalizedUsage(
        aiEligibleStyles,
        aiEligibleStyleCaptures.map((capture) => pageIdentityUrl(capture.url)),
      )
      const evidencePrimaryStyles = aiEligibleStyles[0] || evidenceMergedStyles
      const evidenceColors = clusterColors(
        evidenceSelectionStyles.colors,
        evidenceSelectionStyles.usageCount,
        evidencePrimaryStyles.usageCount,
        evidenceSelectionStyles.usageCount,
      )
      evidenceTokens = buildDesignTokens(evidenceSelectionStyles, evidenceColors, evidenceSelectionStyles)
      evidenceTokens.usageCount = normalizeDesignTokenUsageCount(evidenceMergedStyles.usageCount)
      evidenceTokens.evidence = buildTokenEvidence(evidenceTokens, aiEligibleStyleCaptures)
    }
    let featureTags = generateFeatureTags(tokens, mergedStyles)
    extractionIssues
      .filter((issue) => !isPageHealthExtractionIssue(issue))
      .slice(0, 8)
      .forEach((issue) => appendExtractionIssueLimitation(analysisLimitations, issue))
    let designEvidence = buildDesignEvidence({
      analysisId,
      requestedUrl: url,
      finalUrl,
      accessMode,
      authWallDetected,
      expectedPageCount: pageLimit,
      expectedViewports: viewportNames,
      tokens: evidenceTokens,
      featureTags,
      interactionStyles: allInteractions,
      breakpoints: evidenceBreakpoints,
      motion: evidenceMotion,
      captures: capturedPageEvidence,
      limitations: analysisLimitations,
      techStack,
    })
    const deterministicClaims = buildEvidenceBackedClaims(evidenceTokens, evidenceMergedStyles, designEvidence)
    featureTags = [...new Set([...deterministicClaims.map((claim) => claim.label), ...featureTags])].slice(0, 6)
    designEvidence = {
      ...designEvidence,
      featureTags,
      ...(deterministicClaims.length > 0 ? { deterministicClaims } : {}),
    }
    timing.extractionMs = (timing.extractionMs || 0) + (Date.now() - tokenStartedAt)
    onProgress?.('progress.selectingImageEvidence', 97)
    const fingerprintStartedAt = Date.now()
    const fingerprintPackage = selectEvidencePackage(designEvidence, 'multimodal', {
      maxImages: AI_IMAGE_FINGERPRINT_CANDIDATE_COUNT,
      maxVisualTokens: Number.MAX_SAFE_INTEGER,
    })
    await prepareEvidenceImageFingerprints(runtime.context, designEvidence, fingerprintPackage.imageIds).catch(
      (error) => {
        const issue = { stage: 'ai-image-fingerprint', reason: extractionReason(error) }
        extractionIssues.push(issue)
        appendExtractionIssueLimitation(designEvidence.limitations, issue)
      },
    )
    timing.imageFingerprintMs = Date.now() - fingerprintStartedAt
    const summaryStartedAt = Date.now()
    const summaryPackage = selectEvidencePackage(designEvidence, 'multimodal')
    const preparedImageIds = await prepareEvidenceImageSummaries(
      runtime.context,
      designEvidence,
      summaryPackage.imageIds,
    ).catch((error) => {
      const issue = { stage: 'ai-image-summary', reason: extractionReason(error) }
      extractionIssues.push(issue)
      appendExtractionIssueLimitation(designEvidence.limitations, issue)
      return []
    })
    timing.imageSummaryMs = Date.now() - summaryStartedAt
    timing.imageCount = preparedImageIds.length
    timing.totalMs = activeElapsedMs()
    timing.programTotalMs = timing.totalMs
    timing.userWaitMs = userWaitMs
    if ((timing.preparationMs || 0) > 100_000) timing.budgetExceeded?.push('preparation')
    if ((timing.healthGateMs || 0) > 20_000) timing.budgetExceeded?.push('health-gate')
    if ((timing.screenshotCaptureMs || 0) > 45_000) timing.budgetExceeded?.push('screenshot-capture')
    if ((timing.imageFingerprintMs || 0) > 5_000) timing.budgetExceeded?.push('image-fingerprint')
    if ((timing.imageSummaryMs || 0) > 15_000) timing.budgetExceeded?.push('image-summary')
    if (timing.totalMs > 120_000) timing.budgetExceeded?.push('program-analysis')

    onProgress?.('progress.done', 100)

    if (accessMode === 'managed') {
      await saveManagedStorageState(runtime.context, options.dataDir, url).catch(() => {})
    }

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
      duration: timing.totalMs,
      timing,
      accessMode,
      authWallDetected,
      finalUrl,
      extractionIssues,
      pageCoverage: {
        requested: pageLimit,
        discovered: discoveredPageCount,
        selected: discoveredPages.length,
        analyzed: analyzedPages.size,
        pages: [...analyzedPages].map(([pageUrl, metadata]) => ({ url: pageUrl, ...metadata })),
      },
    }
  } finally {
    await closeRuntime(runtime)
  }
}
