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
import { closeContextWithin, closePageWithin, settleWithin } from './analysis-lifecycle.js'
import { createAnalysisRequest } from './analysis-request.js'
import { detectAuthWall } from './auth-wall.js'
import { resolveBrowserExecutables } from './browser-finder.js'
import {
  getManagedProfileDir,
  getManagedStorageStatePath,
  hasManagedProfile,
  hasManagedStorageState,
  markManagedSession,
} from './browser-session.js'
import { buildCaptureManifest } from './capture-manifest.js'
import { clusterColors } from './color-cluster.js'
import { type ComponentPattern, detectComponents, mergeComponentPatterns } from './component-detect.js'
import { extractDarkMode } from './dark-mode-detect.js'
import {
  AuthenticationBrowserClosedError,
  AuthenticationCancelledError,
  AuthenticationRequiredError,
} from './errors.js'
import {
  appendExtractionIssueLimitation,
  appendFailedCaptureHealthLimitations,
  isPageHealthExtractionIssue,
} from './extraction-limitations.js'
import { buildEvidenceBackedClaims, generateFeatureTags } from './feature-tags.js'
import { navigateWithRecovery } from './navigation.js'
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
  AnalysisProgress,
  AnalysisResult,
  AnalysisTiming,
  CaptureViewportEnvironment,
  DarkModeResult,
  DesignToken,
  ExtractedStyles,
  ExtractionIssue,
  InteractionStyles,
  LoginDecision,
  PageScreenshot,
} from './types.js'
import { sanitizeUrlForPersistence } from './url-privacy.js'
import { configurePageViewport, mobileUserAgent } from './viewport-emulation.js'

export type { ComponentPattern } from './component-detect.js'
export type { MotionToken, ResponsiveBreakpoint } from './responsive-motion.js'
export type { AuthWallDetection, AuthWallReason } from './auth-wall.js'
export type { DesignEvidence } from '../design-evidence/types.js'
export {
  BrowserExecutableError,
  findBrowser,
  findHeadlessBrowser,
  resolveBrowserExecutables,
  validateBrowserExecutablePath,
} from './browser-finder.js'
export type { BrowserExecutableErrorCode } from './browser-finder.js'
export {
  ANALYSIS_REQUEST_SCHEMA_VERSION,
  ANALYSIS_VIEWPORTS,
  CORE_ANALYSIS_REQUEST_DEFAULTS,
  AnalysisRequestError,
  createAnalysisRequest,
} from './analysis-request.js'
export type {
  AnalysisDepth,
  AnalysisRequest,
  AnalysisRequestDefaults,
  AnalysisRequestErrorCode,
  AnalysisRequestInput,
  AnalysisViewport,
  PageAnalysisMode,
} from './analysis-request.js'
export {
  AuthenticationBrowserClosedError,
  AuthenticationCancelledError,
  AuthenticationRequiredError,
} from './errors.js'
export type {
  AnalysisCompletion,
  AnalysisCompletionReason,
  AnalysisOptions,
  AnalysisProgress,
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
export type { CaptureManifest, CaptureViewportEnvironment, CaptureViewportManifest } from './types.js'
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
  executablePath: string
  headless: boolean
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
  if (proxyServer) console.error('[imprint] using proxy:', sanitizeUrlForPersistence(proxyServer))

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
      return { browser, context, kind: 'managed-state', executablePath, headless: true }
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
    return { browser: null, context, kind: 'managed-profile', executablePath, headless }
  }

  const browser = await chromium.launch({
    executablePath,
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
    ...proxyConfig,
  })
  const context = await browser.newContext(proxyConfig)
  return { browser, context, kind: 'ephemeral', executablePath, headless }
}

async function readBrowserEnvironment(page: Page) {
  return page.evaluate(() => ({
    userAgent: navigator.userAgent,
    locale: navigator.language || '',
    languages: [...(navigator.languages || [])],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    colorScheme: matchMedia('(prefers-color-scheme: dark)').matches
      ? ('dark' as const)
      : matchMedia('(prefers-color-scheme: light)').matches
        ? ('light' as const)
        : ('no-preference' as const),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? ('reduce' as const)
      : ('no-preference' as const),
    deviceScaleFactor: window.devicePixelRatio,
  }))
}

async function readRuntimeBrowserEnvironment(context: BrowserContext) {
  const page = await context.newPage()
  try {
    return await readBrowserEnvironment(page)
  } finally {
    await closePageWithin(page)
  }
}

async function closeRuntime(runtime: BrowserRuntime | null): Promise<void> {
  if (!runtime) return
  if (!(await closeContextWithin(runtime.context))) {
    console.error('[imprint] browser context close timed out')
  }
  if (runtime.browser && !(await settleWithin(runtime.browser.close(), 5_000))) {
    console.error('[imprint] browser close timed out')
  }
}

async function closeAnalysisPage(page: Page, stage: string): Promise<void> {
  if (!(await closePageWithin(page))) {
    console.error(`[imprint] page close timed out: ${stage}`)
  }
}

function throwIfAnalysisAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new DOMException('Analysis cancelled', 'AbortError')
}

async function navigatePage(
  page: Page,
  url: string,
  timeout = 60000,
  options: { retry?: boolean } = {},
): Promise<number | undefined> {
  const result = await navigateWithRecovery(page, url, { timeoutMs: timeout, retry: options.retry })
  if (result.recoveredAfterTimeout) {
    console.error(`[imprint] navigation recovered from a committed document after timeout (attempt ${result.attempts})`)
  } else if (result.attempts > 1) {
    console.error('[imprint] navigation succeeded on retry after timeout')
  }
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  return result.status
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
  signal?: AbortSignal,
): Promise<{
  runtime: BrowserRuntime
  page: Page
  responseStatus: number | undefined
  detection: Awaited<ReturnType<typeof detectAuthWall>>
}> {
  throwIfAnalysisAborted(signal)
  if (runtime.kind !== 'managed-profile' || detection.detected) {
    return { runtime, page, responseStatus, detection }
  }

  try {
    await saveManagedStorageState(runtime.context, dataDir, url)
  } catch {
    return { runtime, page, responseStatus, detection }
  }

  let headlessRuntime: BrowserRuntime | null = null
  const closeHeadlessRuntime = () => {
    if (headlessRuntime) void closeRuntime(headlessRuntime)
  }
  signal?.addEventListener('abort', closeHeadlessRuntime, { once: true })
  try {
    headlessRuntime = await launchRuntime(executablePath, 'managed', dataDir, url, true, proxyServer)
    throwIfAnalysisAborted(signal)
    const headlessPage = headlessRuntime.context.pages()[0] || (await headlessRuntime.context.newPage())
    await configurePageViewport(headlessPage, viewportName, viewport)
    const headlessResponseStatus = await navigatePage(headlessPage, url)
    const headlessDetection = await detectAuthWall(headlessPage, headlessResponseStatus)
    throwIfAnalysisAborted(signal)
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
    throwIfAnalysisAborted(signal)
    return { runtime, page, responseStatus, detection }
  } finally {
    signal?.removeEventListener('abort', closeHeadlessRuntime)
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
): boolean {
  const actual = inspectPngDimensions(filePath)
  if (!actual) {
    issues.push({ stage, reason: 'screenshot-dimensions-unreadable' })
    return false
  }
  if (Math.abs(actual.width - expectedWidth) > 4 || Math.abs(actual.height - expectedHeight) > 8) {
    issues.push({
      stage,
      reason: `screenshot-dimensions-mismatch expected=${Math.round(expectedWidth)}x${Math.round(expectedHeight)} actual=${actual.width}x${actual.height}`,
    })
    return false
  }
  return true
}

function screenshotDimensionsMatch(
  filePath: string,
  expectedWidth: number,
  expectedHeight: number,
): { width: number; height: number } | null {
  const actual = inspectPngDimensions(filePath)
  if (!actual) return null
  return Math.abs(actual.width - expectedWidth) <= 4 && Math.abs(actual.height - expectedHeight) <= 8 ? actual : null
}

async function captureBeyondViewportClip(
  page: Page,
  filePath: string,
  width: number,
  height: number,
): Promise<boolean> {
  let session: Awaited<ReturnType<BrowserContext['newCDPSession']>> | undefined
  try {
    session = await page.context().newCDPSession(page)
    const result = (await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    })) as { data?: string }
    if (!result.data) return false
    fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'))
    return true
  } catch {
    return false
  } finally {
    await session?.detach().catch(() => {})
  }
}

async function captureValidatedOverview(
  page: Page,
  filePath: string,
  expectedWidth: number,
  expectedHeight: number,
  timeout?: number,
  preferExactClip = false,
): Promise<{ dimensions: { width: number; height: number } | null; valid: boolean }> {
  if (preferExactClip && (await captureBeyondViewportClip(page, filePath, expectedWidth, expectedHeight))) {
    const dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
    if (dimensions) return { dimensions, valid: true }
  }

  await page.screenshot({ path: filePath, fullPage: true, ...(timeout ? { timeout } : {}) })
  let dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
  if (dimensions) return { dimensions, valid: true }
  const initialDimensions = inspectPngDimensions(filePath)

  // Dynamic or horizontally overflowing pages can make a nominal full-page request return the viewport or the full
  // overflow width. Chromium's document-space capture keeps the requested visible width without changing page layout.
  if (await captureBeyondViewportClip(page, filePath, expectedWidth, expectedHeight)) {
    dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
    if (dimensions) return { dimensions, valid: true }
  }

  // Keep Playwright's clip as a final compatibility fallback for Chromium builds where CDP capture is unavailable.
  try {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(100)
    await page.screenshot({
      path: filePath,
      clip: { x: 0, y: 0, width: expectedWidth, height: expectedHeight },
      ...(timeout ? { timeout } : {}),
    })
  } catch {
    return { dimensions: inspectPngDimensions(filePath) || initialDimensions, valid: false }
  }
  dimensions = screenshotDimensionsMatch(filePath, expectedWidth, expectedHeight)
  return { dimensions: dimensions || inspectPngDimensions(filePath), valid: Boolean(dimensions) }
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

async function guardAnalysisExtractionStage<T>(
  issues: ExtractionIssue[],
  stage: string,
  fallback: T,
  run: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAnalysisAborted(signal)
  try {
    const result = await run()
    throwIfAnalysisAborted(signal)
    return result
  } catch (error) {
    throwIfAnalysisAborted(signal)
    issues.push({ stage, reason: extractionReason(error) })
    return fallback
  }
}

/**
 * Core analysis engine — no Electron dependency.
 * Accepts a `dataDir` for file output (screenshots, session cache).
 */
export async function analyze(
  inputUrl: string,
  options: AnalysisOptions,
  onProgress?: (progress: AnalysisProgress) => void,
): Promise<AnalysisResult> {
  throwIfAnalysisAborted(options.signal)
  const request = createAnalysisRequest({
    url: inputUrl,
    viewports: options.viewports,
    maxPages: options.maxPages,
    useSession: options.useSession,
    authMode: options.authMode,
    extractDarkMode: options.extractDarkMode,
    depth: options.depth,
    pageDiscovery: options.pageDiscovery,
  })
  const url = request.url
  const startTime = Date.now()
  const capturedAt = new Date(startTime).toISOString()
  const analysisAbortController = new AbortController()
  const abortFromExternalSignal = () => analysisAbortController.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abortFromExternalSignal, { once: true })
  const analysisSignal = analysisAbortController.signal
  let acceptingPartialFinish = true
  let completionReason: 'user-finished' | null = null
  const finishForUser = () => {
    if (acceptingPartialFinish) completionReason ??= 'user-finished'
  }
  options.finishSignal?.addEventListener('abort', finishForUser, { once: true })
  if (options.finishSignal?.aborted) finishForUser()
  let userWaitMs = 0
  const activeElapsedMs = () => Math.max(0, Date.now() - startTime - userWaitMs)
  let progressAnalyzedPages = 0
  let progressDiscoveredPages = 1
  const progressCompletedUrls = new Set<string>()
  let progressStep = 'progress.launchingBrowser'
  let progressPercent = 0
  const reportProgress = (step = progressStep, percent = progressPercent) => {
    progressStep = step
    progressPercent = percent
    onProgress?.({
      step,
      percent,
      analyzedPages: progressAnalyzedPages,
      discoveredPages: Math.max(progressAnalyzedPages, progressDiscoveredPages),
      resultReady: acceptingPartialFinish && progressAnalyzedPages > 0,
      activeElapsedMs: activeElapsedMs(),
    })
  }
  const markPageReady = (pageUrl: string) => {
    progressCompletedUrls.add(pageIdentityUrl(pageUrl))
    progressAnalyzedPages = progressCompletedUrls.size
    reportProgress()
  }
  const timing: AnalysisTiming = {
    browserMs: 0,
    preparationMs: 0,
    extractionMs: 0,
    healthGateMs: 0,
    screenshotCaptureMs: 0,
    validationMs: 0,
    totalMs: 0,
    imageCount: 0,
    budgetExceeded: [],
  }
  const measure = async <T>(
    key: 'preparationMs' | 'extractionMs' | 'healthGateMs' | 'screenshotCaptureMs',
    run: () => Promise<T>,
  ) => {
    throwIfAnalysisAborted(analysisSignal)
    const startedAt = Date.now()
    try {
      const result = await run()
      throwIfAnalysisAborted(analysisSignal)
      return result
    } finally {
      timing[key] = (timing[key] || 0) + (Date.now() - startedAt)
    }
  }
  const guardExtractionStage = <T>(issues: ExtractionIssue[], stage: string, fallback: T, run: () => Promise<T>) =>
    guardAnalysisExtractionStage(issues, stage, fallback, run, analysisSignal)
  const analysisId = randomUUID()
  const viewportNames = request.viewports
  const pageLimit = request.maxPages
  const screenshotDir = path.join(options.dataDir, 'screenshots')
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true })
  }

  reportProgress('progress.launchingBrowser', 5)

  const resolvedBrowsers = resolveBrowserExecutables(options.browserPath, options.browserResourcesDir)
  const interactiveExecutablePath = resolvedBrowsers.interactive
  const headlessExecutablePath = resolvedBrowsers.headless
  console.error('[imprint] interactive browser resolved:', interactiveExecutablePath)
  console.error('[imprint] headless browser resolved:', headlessExecutablePath)

  const authMode = request.authMode
  let accessMode: 'anonymous' | 'managed' = authMode === 'managed' ? 'managed' : 'anonymous'
  const initialViewport = VIEWPORTS[viewportNames[0]] || VIEWPORTS.desktop

  let runtime: BrowserRuntime | null = null
  let pendingRuntime: BrowserRuntime | null = null
  let initialPage: Page | null = null
  let authWallDetected = false
  let finalUrl = url
  const closeActiveRuntime = () => {
    if (runtime) void closeRuntime(runtime)
    if (pendingRuntime && pendingRuntime !== runtime) void closeRuntime(pendingRuntime)
  }
  analysisSignal.addEventListener('abort', closeActiveRuntime, { once: true })

  try {
    const initialExecutablePath =
      accessMode === 'managed' && !hasManagedStorageState(options.dataDir, url)
        ? interactiveExecutablePath
        : headlessExecutablePath
    runtime = await launchRuntime(initialExecutablePath, accessMode, options.dataDir, url, true, options.proxyServer)
    throwIfAnalysisAborted(analysisSignal)
    initialPage = runtime.context.pages()[0] || (await runtime.context.newPage())
    await configurePageViewport(initialPage, viewportNames[0], initialViewport)

    reportProgress('progress.checkingAccess', 7)
    let responseStatus = await navigatePage(initialPage, url)
    let authDetection = await detectAuthWall(initialPage, responseStatus)
    authWallDetected = authDetection.detected
    finalUrl = authDetection.finalUrl

    if (authMode === 'auto' && hasManagedProfile(options.dataDir, url)) {
      const visitorRuntime = runtime
      const visitorPage = initialPage
      const visitorDetection = authDetection
      let managedRuntime: BrowserRuntime | null = null

      reportProgress('progress.preparingAuthenticatedAnalysis', 8)
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
        pendingRuntime = managedRuntime
        throwIfAnalysisAborted(analysisSignal)
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
          pendingRuntime = null
          await closeRuntime(visitorRuntime)
        }
      } catch {
        throwIfAnalysisAborted(analysisSignal)
        // A locked or unusable saved profile falls back to the already-loaded visitor page.
      } finally {
        if (managedRuntime) await closeRuntime(managedRuntime)
        pendingRuntime = null
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

      reportProgress('progress.openingLoginBrowser', 7)
      runtime = await launchRuntime(
        interactiveExecutablePath,
        'managed',
        options.dataDir,
        url,
        false,
        options.proxyServer,
      )
      throwIfAnalysisAborted(analysisSignal)
      let loginPage = runtime.context.pages()[0] || (await runtime.context.newPage())
      await configurePageViewport(loginPage, viewportNames[0], initialViewport)
      responseStatus = await navigatePage(loginPage, url)
      authDetection = await detectAuthWall(loginPage, responseStatus)

      const loginAbortController = new AbortController()
      const abortLoginWait = () => loginAbortController.abort(analysisSignal.reason)
      runtime.context.once('close', () => loginAbortController.abort())
      analysisSignal.addEventListener('abort', abortLoginWait, { once: true })
      let retry = false
      let continueAnonymously = false

      while (authDetection.detected) {
        throwIfAnalysisAborted(analysisSignal)
        reportProgress(retry ? 'progress.loginIncomplete' : 'progress.waitingForLogin', 8)
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

        reportProgress('progress.verifyingLogin', 9)
        if (loginPage.isClosed()) {
          const openPages = runtime.context.pages()
          loginPage = openPages[openPages.length - 1] || (await runtime.context.newPage())
        }
        responseStatus = await navigatePage(loginPage, url)
        authDetection = await detectAuthWall(loginPage, responseStatus)
        retry = true
      }
      analysisSignal.removeEventListener('abort', abortLoginWait)

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
        throwIfAnalysisAborted(analysisSignal)
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
        analysisSignal,
      )
      runtime = switchedRuntime.runtime
      initialPage = switchedRuntime.page
      responseStatus = switchedRuntime.responseStatus
      authDetection = switchedRuntime.detection
      finalUrl = authDetection.finalUrl
    }
    if (accessMode === 'managed' && !authDetection.detected) markManagedSession(options.dataDir, url)
    const browserEnvironment = await readRuntimeBrowserEnvironment(runtime.context)
    timing.browserMs = activeElapsedMs()

    const allStyles: ExtractedStyles[] = []
    const evidenceEligibleStyles: ExtractedStyles[] = []
    const styleCaptures: TokenEvidenceCapture[] = []
    const evidenceEligibleStyleCaptures: TokenEvidenceCapture[] = []
    const screenshots: string[] = []
    const pageScreenshots: PageScreenshot[] = []
    const capturedPageEvidence: CapturedPageEvidence[] = []
    const allInteractions: InteractionStyles = { hover: [], focus: [], active: [], disabled: [] }
    const extractionIssues: ExtractionIssue[] = []
    const analysisLimitations: string[] = []
    const animationFreezeAttempts: Array<{ url: string; viewport: string; succeeded: boolean }> = []
    const analyzedPages = new Map<
      string,
      { source: 'requested' | 'dom' | 'sitemap'; kind: 'entry' | DiscoveredPage['kind'] }
    >()
    let discoveredPageCount = 0
    let selectedPageCount = 0
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
    let adaptiveMobilePlanned = false

    for (let i = 0; i < viewportNames.length; i++) {
      throwIfAnalysisAborted(analysisSignal)
      if (i > 0 && completionReason && capturedPageEvidence.length > 0) break
      const vpName = viewportNames[i]
      const viewport = VIEWPORTS[vpName] || VIEWPORTS.desktop
      const progress = 10 + (i / viewportNames.length) * 70

      reportProgress(`progress.analyzingViewport::${vpName}`, Math.round(progress))

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
      let health = await measure('healthGateMs', () =>
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
      if (page.isClosed() || (health.status === 'unusable' && !explicitlyAnalyzableAccessSurface)) {
        if (page !== initialPage) await closeAnalysisPage(page, `${stagePrefix}:health-excluded`)
        continue
      }

      const extractionStartedAt = Date.now()
      if (i === 0) {
        motion = await guardExtractionStage(extractionIssues, `${stagePrefix}:motion`, [], () => detectMotion(page))
      }
      const animationIssue = await freezePageAnimations(page)
      animationFreezeAttempts.push({ url: page.url(), viewport: vpName, succeeded: !animationIssue })
      if (animationIssue) {
        extractionIssues.push({
          stage: `${stagePrefix}:prepare:${animationIssue.stage}`,
          reason: animationIssue.reason,
        })
      }

      let styles = await guardExtractionStage(extractionIssues, `${stagePrefix}:styles`, mergeStyles([]), () =>
        extractStyles(page),
      )
      allStyles.push(styles)
      styleCaptures.push({ url: page.url(), viewport: vpName, styles })

      let pageInteractionStyles = await guardExtractionStage(
        extractionIssues,
        `${stagePrefix}:interaction-styles`,
        { hover: [], focus: [], active: [], disabled: [] },
        () => extractInteractionStyles(page),
      )

      if (i === 0 && request.extractDarkMode) {
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
        techStack = await guardExtractionStage(extractionIssues, `${stagePrefix}:tech-stack`, undefined, () =>
          detectTechStack(page),
        )
      }

      health = await measure('healthGateMs', () =>
        ensurePageHealth(page, { expectedUrl: url, responseStatus: pageResponseStatus }),
      )
      extractionIssues.push(
        ...health.issues.map((issue) => ({
          stage: `${stagePrefix}:capture-health:${issue.code}`,
          reason: issue.detail || issue.severity,
        })),
      )
      const captureExplicitlyAnalyzableAccessSurface = health.issues.some(
        (issue) => issue.code === 'auth-wall' || issue.code === 'captcha',
      )
      if (page.isClosed() || (health.status === 'unusable' && !captureExplicitlyAnalyzableAccessSurface)) {
        analysisLimitations.push(`capture-excluded-page-health:${stagePrefix}`)
        allStyles.pop()
        styleCaptures.pop()
        if (i === 0) {
          components = []
          breakpoints = []
          entryBreakpointWidths = new Set()
          motion = []
          darkModeResult = null
          techStack = undefined
        }
        if (page !== initialPage) await closeAnalysisPage(page, `${stagePrefix}:capture-health-excluded`)
        continue
      }
      if (health.recovered) {
        styles = await guardExtractionStage(
          extractionIssues,
          `${stagePrefix}:capture-health:refresh-styles`,
          styles,
          () => extractStyles(page),
        )
        allStyles[allStyles.length - 1] = styles
        styleCaptures[styleCaptures.length - 1] = { url: page.url(), viewport: vpName, styles }
        pageInteractionStyles = await guardExtractionStage(
          extractionIssues,
          `${stagePrefix}:capture-health:refresh-interaction-styles`,
          pageInteractionStyles,
          () => extractInteractionStyles(page),
        )
        if (i === 0) {
          components = await guardExtractionStage(
            extractionIssues,
            `${stagePrefix}:capture-health:refresh-components`,
            components,
            () => detectComponents(page),
          )
          breakpoints = await guardExtractionStage(
            extractionIssues,
            `${stagePrefix}:capture-health:refresh-breakpoints`,
            breakpoints,
            () => detectBreakpoints(page),
          )
          entryBreakpointWidths = new Set(breakpoints.map((breakpoint) => breakpoint.width))
          if (request.extractDarkMode) {
            darkModeResult = await guardExtractionStage(
              extractionIssues,
              `${stagePrefix}:capture-health:refresh-dark-mode`,
              darkModeResult,
              () => extractDarkMode(page, styles),
            )
          }
        }
      }
      mergeInteractionStyles(allInteractions, pageInteractionStyles)
      analyzedPages.set(pageIdentityUrl(page.url()), { source: 'requested', kind: 'entry' })
      if (health.evidenceEligible) {
        evidenceEligibleStyles.push(styles)
        evidenceEligibleStyleCaptures.push({ url: page.url(), viewport: vpName, styles })
        if (i === 0) {
          evidenceMotion = motion
          evidenceBreakpoints = breakpoints
        }
      }

      const screenshotPath = path.join(screenshotDir, `${Date.now()}-page-1-${vpName}.png`)
      const evidenceSnapshot = await extractPageEvidence(page, vpName)
      if (i === 0) entryStructure = pageStructureTraits(evidenceSnapshot)
      timing.extractionMs = (timing.extractionMs || 0) + (Date.now() - extractionStartedAt)
      let interactionObservations: Awaited<ReturnType<typeof observeSafeInteractions>> = []
      const supplementalImages: NonNullable<CapturedPageEvidence['supplementalImages']> = []
      if (i === 0 || vpName !== 'desktop') {
        const viewportPath = path.join(screenshotDir, `${Date.now()}-page-1-${vpName}-viewport.png`)
        await measure('screenshotCaptureMs', () => page.screenshot({ path: viewportPath, fullPage: false }))
        const viewportValid = recordScreenshotDimensionIssue(
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
          valid: viewportValid,
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
            const regionValid = recordScreenshotDimensionIssue(
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
              valid: regionValid,
              sourceRect,
              sectionKey: section.key,
            })
          } catch {
            throwIfAnalysisAborted(analysisSignal)
            // Full-page evidence remains available when a dynamic region cannot be clipped reliably.
          }
        }
        await page.evaluate(() => window.scrollTo(0, 0))
      }
      const overviewCapture = await measure('screenshotCaptureMs', () =>
        captureValidatedOverview(page, screenshotPath, evidenceSnapshot.width, evidenceSnapshot.height),
      )
      if (!overviewCapture.valid) {
        recordScreenshotDimensionIssue(
          extractionIssues,
          `${stagePrefix}:screenshot:overview`,
          screenshotPath,
          evidenceSnapshot.width,
          evidenceSnapshot.height,
        )
      }
      screenshots.push(screenshotPath)
      const pageScreenshot = {
        url: page.url(),
        path: screenshotPath,
        viewport: vpName,
        ...(overviewCapture.dimensions || {}),
        valid: overviewCapture.valid,
      }
      if (i === 0 && accessMode === 'anonymous' && !authDetection.detected) {
        interactionObservations = await guardExtractionStage(
          extractionIssues,
          `${stagePrefix}:safe-interactions`,
          [],
          () => observeSafeInteractions(page, evidenceSnapshot, 4, 6_000),
        )
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
      markPageReady(page.url())

      if (page !== initialPage) await closeAnalysisPage(page, `${stagePrefix}:complete`)
    }

    // Multi-page analysis follows representative same-origin links until the configured page bound, the available
    // queue, or a caller-requested finish is reached.
    const subPageLimit = Math.max(0, pageLimit - 1)
    if (subPageLimit > 0 && !authDetection.detected && !completionReason) {
      const mainViewport = VIEWPORTS[viewportNames[0]] || VIEWPORTS.desktop
      const mainViewportName = viewportNames[0] || 'desktop'
      const discoveryRootUrl = finalUrl || url
      const canReuseInitialPage =
        initialPage &&
        !initialPage.isClosed() &&
        pageIdentityUrl(initialPage.url()) === pageIdentityUrl(discoveryRootUrl)
      const discoveryPage = canReuseInitialPage ? initialPage : await runtime.context.newPage()
      if (!canReuseInitialPage) {
        await configurePageViewport(discoveryPage, mainViewportName, mainViewport)
        await navigatePage(discoveryPage, discoveryRootUrl)
      }
      reportProgress('progress.discoveringPages', 75)

      const discoveryQueueLimit = Math.min(Number.MAX_SAFE_INTEGER, subPageLimit + 8)
      const discovery = await discoverPages(discoveryPage, discoveryRootUrl, discoveryQueueLimit, request.pageDiscovery)
      const pendingPages: DiscoveredPage[] = []
      const discoveredCandidateUrls = new Set<string>()
      const queuedPageUrls = new Set<string>()
      const entryPageUrl = pageIdentityUrl(discoveryRootUrl)
      const enqueuePages = (pages: DiscoveredPage[]) => {
        for (const page of pages) {
          const identity = pageIdentityUrl(page.url)
          if (identity === entryPageUrl) continue
          discoveredCandidateUrls.add(identity)
          if (queuedPageUrls.has(identity) || analyzedPages.has(identity)) continue
          queuedPageUrls.add(identity)
          pendingPages.push(page)
        }
        // discoverPages already returns a deterministic diversity-first order. Preserve it so the page bound is not
        // consumed by several high-scoring routes of the same kind.
        discoveredPageCount = discoveredCandidateUrls.size
        selectedPageCount = Math.min(subPageLimit, discoveredCandidateUrls.size)
        progressDiscoveredPages = 1 + discoveredCandidateUrls.size
        reportProgress()
      }
      enqueuePages(discovery.pages)
      extractionIssues.push(
        ...discovery.issues.map((issue) => ({
          stage: `page-discovery:${issue.stage}`,
          reason: issue.reason,
        })),
      )
      if (!canReuseInitialPage) await closeAnalysisPage(discoveryPage, 'page-discovery:complete')

      let successfulSubPageCount = 0
      let attemptedSubPageCount = 0
      while (pendingPages.length > 0) {
        throwIfAnalysisAborted(analysisSignal)
        if (completionReason) break
        if (successfulSubPageCount >= subPageLimit) break
        const discoveredPage = pendingPages.shift()
        if (!discoveredPage) break
        attemptedSubPageCount += 1
        const i = attemptedSubPageCount - 1
        const subUrl = discoveredPage.url
        reportProgress(
          `progress.analyzingPage::${progressAnalyzedPages + 1}::${progressDiscoveredPages}`,
          Math.min(84, 76 + progressAnalyzedPages),
        )

        const subPage = await runtime.context.newPage()
        await configurePageViewport(subPage, mainViewportName, mainViewport)
        let adaptiveAbortTimer: ReturnType<typeof setTimeout> | undefined
        let adaptiveHealthIssueStartIndex: number | undefined

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
          let health = await measure('healthGateMs', () =>
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
          const animationIssue = await freezePageAnimations(subPage)
          animationFreezeAttempts.push({ url: subPage.url(), viewport: mainViewportName, succeeded: !animationIssue })
          if (animationIssue) {
            extractionIssues.push({
              stage: `${stagePrefix}:prepare:${animationIssue.stage}`,
              reason: animationIssue.reason,
            })
          }

          let subStyles = await guardExtractionStage(extractionIssues, `${stagePrefix}:styles`, mergeStyles([]), () =>
            extractStyles(subPage),
          )
          allStyles.push(subStyles)
          styleCaptures.push({ url: subPage.url(), viewport: mainViewportName, styles: subStyles })
          let pageInteractionStyles = await guardExtractionStage(
            extractionIssues,
            `${stagePrefix}:interaction-styles`,
            { hover: [], focus: [], active: [], disabled: [] },
            () => extractInteractionStyles(subPage),
          )
          let subPageComponents = await guardExtractionStage(extractionIssues, `${stagePrefix}:components`, [], () =>
            detectComponents(subPage),
          )
          let subPageBreakpoints = await guardExtractionStage(extractionIssues, `${stagePrefix}:breakpoints`, [], () =>
            detectBreakpoints(subPage),
          )

          health = await measure('healthGateMs', () =>
            ensurePageHealth(subPage, { expectedUrl: subUrl, responseStatus: subPageStatus }),
          )
          extractionIssues.push(
            ...health.issues.map((issue) => ({
              stage: `${stagePrefix}:capture-health:${issue.code}`,
              reason: issue.detail || issue.severity,
            })),
          )
          if (health.status === 'unusable') {
            analysisLimitations.push(`capture-excluded-page-health:${stagePrefix}`)
            allStyles.pop()
            styleCaptures.pop()
            continue
          }
          if (health.recovered) {
            subStyles = await guardExtractionStage(
              extractionIssues,
              `${stagePrefix}:capture-health:refresh-styles`,
              subStyles,
              () => extractStyles(subPage),
            )
            allStyles[allStyles.length - 1] = subStyles
            styleCaptures[styleCaptures.length - 1] = {
              url: subPage.url(),
              viewport: mainViewportName,
              styles: subStyles,
            }
            pageInteractionStyles = await guardExtractionStage(
              extractionIssues,
              `${stagePrefix}:capture-health:refresh-interaction-styles`,
              pageInteractionStyles,
              () => extractInteractionStyles(subPage),
            )
            subPageComponents = await guardExtractionStage(
              extractionIssues,
              `${stagePrefix}:capture-health:refresh-components`,
              subPageComponents,
              () => detectComponents(subPage),
            )
            subPageBreakpoints = await guardExtractionStage(
              extractionIssues,
              `${stagePrefix}:capture-health:refresh-breakpoints`,
              subPageBreakpoints,
              () => detectBreakpoints(subPage),
            )
          }
          const nestedPagesNeeded = Math.max(0, subPageLimit - (successfulSubPageCount + 1) - pendingPages.length)
          if (!completionReason && nestedPagesNeeded > 0) {
            const nestedDiscovery = await discoverPages(
              subPage,
              discoveryRootUrl,
              Math.min(Number.MAX_SAFE_INTEGER, nestedPagesNeeded + 4),
              'links',
            )
            enqueuePages(nestedDiscovery.pages)
            extractionIssues.push(
              ...nestedDiscovery.issues.map((issue) => ({
                stage: `page-discovery:${issue.stage}`,
                reason: issue.reason,
              })),
            )
          }
          mergeInteractionStyles(allInteractions, pageInteractionStyles)
          motion = mergeMotionTokens([motion, subPageMotion])
          components = mergeComponentPatterns([components, subPageComponents])
          breakpoints = mergeResponsiveBreakpoints([breakpoints, subPageBreakpoints])
          analyzedPages.set(pageIdentityUrl(subPage.url()), {
            source: discoveredPage.source,
            kind: discoveredPage.kind,
          })
          if (health.evidenceEligible) {
            evidenceMotion = mergeMotionTokens([evidenceMotion, subPageMotion])
            evidenceEligibleStyles.push(subStyles)
            evidenceEligibleStyleCaptures.push({ url: subPage.url(), viewport: mainViewportName, styles: subStyles })
            evidenceBreakpoints = mergeResponsiveBreakpoints([evidenceBreakpoints, subPageBreakpoints])
          }

          const screenshotPath = path.join(screenshotDir, `${Date.now()}-page-${i + 2}-${mainViewportName}.png`)
          const evidenceSnapshot = await extractPageEvidence(subPage, mainViewportName)
          timing.extractionMs = (timing.extractionMs || 0) + (Date.now() - extractionStartedAt)
          let interactionObservations: Awaited<ReturnType<typeof observeSafeInteractions>> = []
          const viewportPath = path.join(screenshotDir, `${Date.now()}-page-${i + 2}-${mainViewportName}-viewport.png`)
          await measure('screenshotCaptureMs', () => subPage.screenshot({ path: viewportPath, fullPage: false }))
          const viewportValid = recordScreenshotDimensionIssue(
            extractionIssues,
            `${stagePrefix}:screenshot:viewport`,
            viewportPath,
            mainViewport.width,
            mainViewport.height,
          )
          const overviewCapture = await measure('screenshotCaptureMs', () =>
            captureValidatedOverview(subPage, screenshotPath, evidenceSnapshot.width, evidenceSnapshot.height),
          )
          if (!overviewCapture.valid) {
            recordScreenshotDimensionIssue(
              extractionIssues,
              `${stagePrefix}:screenshot:overview`,
              screenshotPath,
              evidenceSnapshot.width,
              evidenceSnapshot.height,
            )
          }
          screenshots.push(screenshotPath)
          const pageScreenshot = {
            url: subPage.url(),
            path: screenshotPath,
            viewport: mainViewportName,
            ...(overviewCapture.dimensions || {}),
            valid: overviewCapture.valid,
          }
          if (accessMode === 'anonymous') {
            interactionObservations = await guardExtractionStage(
              extractionIssues,
              `${stagePrefix}:safe-interactions`,
              [],
              () => observeSafeInteractions(subPage, evidenceSnapshot, 4, 6_000),
            )
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
                valid: viewportValid,
                sourceRect: {
                  x: 0,
                  y: 0,
                  width: Math.min(1, mainViewport.width / evidenceSnapshot.width),
                  height: Math.min(1, mainViewport.height / evidenceSnapshot.height),
                },
              },
            ],
          })
          successfulSubPageCount += 1
          markPageReady(subPage.url())

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
          if (!adaptiveMobileCaptured && mainViewportName !== 'mobile' && adaptiveSignals.some(Boolean)) {
            adaptiveMobilePlanned = true
          }
          const shouldCaptureMobile =
            !adaptiveMobileCaptured &&
            mainViewportName !== 'mobile' &&
            adaptiveSignals.some(Boolean) &&
            !completionReason

          if (shouldCaptureMobile) {
            adaptiveHealthIssueStartIndex = extractionIssues.length
            const adaptiveStartedAt = Date.now()
            const adaptiveDeadline = adaptiveStartedAt + 20_000
            const adaptiveController = new AbortController()
            adaptiveAbortTimer = setTimeout(
              () => adaptiveController.abort(new Error('adaptive-mobile-budget-exceeded')),
              Math.max(1, adaptiveDeadline - Date.now()),
            )
            const mobileStagePrefix = `page-${i + 2}:mobile-adaptive`
            const withinAdaptiveBudget = () => Date.now() < adaptiveDeadline
            await runWithinDeadline(adaptiveDeadline, () => configurePageViewport(subPage, 'mobile', VIEWPORTS.mobile))
            const mobilePageStatus = await runWithinDeadline(adaptiveDeadline, () =>
              navigatePage(subPage, subUrl, Math.max(1, adaptiveDeadline - Date.now()), { retry: false }),
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
            let mobileHealth = await measure('healthGateMs', () =>
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
            if (mobileHealth.status === 'unusable') {
              throw new Error('adaptive-mobile-page-unusable')
            } else {
              if (!withinAdaptiveBudget()) throw new Error('adaptive-mobile-budget-exceeded')
              const mobileExtractionStartedAt = Date.now()
              // Adaptive mobile is a structural supplement for cross-viewport comparison. The same URL's canonical
              // desktop capture already supplies token and interaction extraction, so preserve the short budget for
              // page evidence and screenshots instead of repeating the two most expensive extraction passes.
              let mobileSnapshot = await runWithinDeadline(adaptiveDeadline, () =>
                extractPageEvidence(subPage, 'mobile'),
              )
              mobileHealth = await measure('healthGateMs', () =>
                runWithinDeadline(adaptiveDeadline, () =>
                  ensurePageHealth(subPage, { expectedUrl: subUrl, responseStatus: mobilePageStatus }),
                ),
              )
              extractionIssues.push(
                ...mobileHealth.issues.map((issue) => ({
                  stage: `${mobileStagePrefix}:capture-health:${issue.code}`,
                  reason: issue.detail || issue.severity,
                })),
              )
              if (mobileHealth.status === 'unusable') {
                throw new Error('adaptive-mobile-page-unusable')
              }
              if (mobileHealth.recovered) {
                mobileSnapshot = await runWithinDeadline(adaptiveDeadline, () => extractPageEvidence(subPage, 'mobile'))
              }
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
              const mobileOverviewWidth = mobileSnapshot.horizontalOverflow
                ? Math.min(VIEWPORTS.mobile.width, mobileSnapshot.width)
                : mobileSnapshot.width
              const mobileOverviewCapture = await measure('screenshotCaptureMs', () =>
                runWithinDeadline(adaptiveDeadline, () =>
                  captureValidatedOverview(
                    subPage,
                    mobileOverviewPath,
                    mobileOverviewWidth,
                    mobileSnapshot.height,
                    Math.max(1, adaptiveDeadline - Date.now()),
                    mobileSnapshot.horizontalOverflow,
                  ),
                ),
              )
              const mobileViewportValid = recordScreenshotDimensionIssue(
                extractionIssues,
                `${mobileStagePrefix}:screenshot:viewport`,
                mobileViewportPath,
                VIEWPORTS.mobile.width,
                VIEWPORTS.mobile.height,
              )
              if (!mobileOverviewCapture.valid) {
                recordScreenshotDimensionIssue(
                  extractionIssues,
                  `${mobileStagePrefix}:screenshot:overview`,
                  mobileOverviewPath,
                  mobileOverviewWidth,
                  mobileSnapshot.height,
                )
              }
              const screenshotDimensions = inspectPngDimensions(mobileOverviewPath)
              const mobilePageScreenshot = {
                url: subPage.url(),
                path: mobileOverviewPath,
                viewport: 'mobile',
                ...(screenshotDimensions || {}),
                valid: mobileOverviewCapture.valid,
              }
              screenshots.push(mobileOverviewPath)
              pageScreenshots.push(mobilePageScreenshot)
              capturedPageEvidence.push({
                screenshot: mobilePageScreenshot,
                snapshot: mobileSnapshot,
                interactionStyles: { hover: [], focus: [], active: [], disabled: [] },
                health: mobileHealth,
                supplementalImages: [
                  {
                    kind: 'viewport-crop',
                    path: mobileViewportPath,
                    width: VIEWPORTS.mobile.width,
                    height: VIEWPORTS.mobile.height,
                    valid: mobileViewportValid,
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
              adaptiveHealthIssueStartIndex = undefined

              // The structural evidence is already committed, so a slow style pass must not discard the mobile
              // capture. Use only the remaining adaptive budget to preserve viewport-specific variables when the
              // page is inexpensive to inspect (for example, CSS values selected by a mobile user agent).
              if (adaptiveAbortTimer) {
                clearTimeout(adaptiveAbortTimer)
                adaptiveAbortTimer = undefined
              }
              const optionalStyleDeadline = Math.min(adaptiveDeadline, Date.now() + 4_000)
              if (optionalStyleDeadline - Date.now() >= 500) {
                const optionalStyleStartedAt = Date.now()
                try {
                  const mobileStyles = await runWithinDeadline(optionalStyleDeadline, () => extractStyles(subPage))
                  allStyles.push(mobileStyles)
                  styleCaptures.push({ url: subPage.url(), viewport: 'mobile', styles: mobileStyles })
                  if (mobileHealth.evidenceEligible) {
                    evidenceEligibleStyles.push(mobileStyles)
                    evidenceEligibleStyleCaptures.push({ url: subPage.url(), viewport: 'mobile', styles: mobileStyles })
                  }
                } catch {
                  throwIfAnalysisAborted(analysisSignal)
                  // Desktop styles already cover this URL. Keep the committed mobile evidence when this optional
                  // viewport-specific pass is too slow or fails independently.
                } finally {
                  timing.extractionMs = (timing.extractionMs || 0) + (Date.now() - optionalStyleStartedAt)
                }
              }
            }
          }
        } catch (error) {
          throwIfAnalysisAborted(analysisSignal)
          // Sub-page failed to load, skip it
          const reason = extractionReason(error)
          if (adaptiveHealthIssueStartIndex !== undefined) {
            appendFailedCaptureHealthLimitations(
              analysisLimitations,
              extractionIssues.slice(adaptiveHealthIssueStartIndex),
            )
          }
          if (reason.includes('adaptive-mobile-budget-exceeded')) {
            analysisLimitations.push('adaptive-mobile-budget-exceeded')
            timing.budgetExceeded?.push('adaptive-mobile')
          } else if (reason.includes('adaptive-mobile-page-unusable')) {
            analysisLimitations.push(`capture-excluded-page-health:page-${i + 2}:mobile-adaptive`)
          } else {
            extractionIssues.push({ stage: `page-${i + 2}:${mainViewportName}`, reason })
          }
        } finally {
          if (adaptiveAbortTimer) clearTimeout(adaptiveAbortTimer)
          await closeAnalysisPage(subPage, `page-${i + 2}:${mainViewportName}:complete`)
        }
      }
    }

    // The Finish action governs page collection only. Once collection has ended, token generation is required to make
    // the captured pages usable and must not retroactively change a naturally completed run into a partial one.
    acceptingPartialFinish = false
    options.finishSignal?.removeEventListener('abort', finishForUser)

    throwIfAnalysisAborted(analysisSignal)
    reportProgress('progress.analyzingPatterns', 85)
    const tokenStartedAt = Date.now()
    const mergedStyles = mergeStyles(allStyles)
    const tokenSelectionStyles = mergeStylesWithNormalizedUsage(
      allStyles,
      styleCaptures.map((capture) => pageIdentityUrl(capture.url)),
    )

    reportProgress('progress.clusteringColors', 90)
    const clusteredColors = clusterColors(tokenSelectionStyles.colors, tokenSelectionStyles.usageCount)

    reportProgress('progress.generatingTokens', 95)
    const tokens = buildDesignTokens(tokenSelectionStyles, clusteredColors, tokenSelectionStyles)
    tokens.usageCount = normalizeDesignTokenUsageCount(mergedStyles.usageCount)
    tokens.evidence = buildTokenEvidence(tokens, styleCaptures)
    let evidenceTokens = emptyDesignTokens()
    let evidenceMergedStyles = mergeStyles([])
    if (evidenceEligibleStyles.length > 0) {
      evidenceMergedStyles = mergeStyles(evidenceEligibleStyles)
      const evidenceSelectionStyles = mergeStylesWithNormalizedUsage(
        evidenceEligibleStyles,
        evidenceEligibleStyleCaptures.map((capture) => pageIdentityUrl(capture.url)),
      )
      const evidenceColors = clusterColors(evidenceSelectionStyles.colors, evidenceSelectionStyles.usageCount)
      evidenceTokens = buildDesignTokens(evidenceSelectionStyles, evidenceColors, evidenceSelectionStyles)
      evidenceTokens.usageCount = normalizeDesignTokenUsageCount(evidenceMergedStyles.usageCount)
      evidenceTokens.evidence = buildTokenEvidence(evidenceTokens, evidenceEligibleStyleCaptures)
    }
    let featureTags = generateFeatureTags(tokens, mergedStyles)
    extractionIssues
      .filter((issue) => !isPageHealthExtractionIssue(issue))
      .slice(0, 8)
      .forEach((issue) => appendExtractionIssueLimitation(analysisLimitations, issue))
    const plannedPageCount = 1 + selectedPageCount
    const plannedCaptureCount = viewportNames.length + selectedPageCount + (adaptiveMobilePlanned ? 1 : 0)
    let designEvidence = buildDesignEvidence({
      analysisId,
      requestedUrl: url,
      finalUrl,
      accessMode,
      authWallDetected,
      expectedPageCount: plannedPageCount,
      expectedViewports: adaptiveMobilePlanned ? [...new Set([...viewportNames, 'mobile'])] : viewportNames,
      expectedCaptureCount: plannedCaptureCount,
      screenshotAssetIssueCount: extractionIssues.filter(
        (issue) =>
          /:screenshot:overview$/.test(issue.stage) &&
          /^screenshot-dimensions-(?:mismatch|unreadable)/.test(issue.reason),
      ).length,
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
    timing.imageCount = designEvidence.pages.reduce((count, page) => count + page.images.length, 0)
    timing.totalMs = activeElapsedMs()
    timing.userWaitMs = userWaitMs
    if ((timing.preparationMs || 0) > 100_000) timing.budgetExceeded?.push('preparation')
    if ((timing.healthGateMs || 0) > 20_000) timing.budgetExceeded?.push('health-gate')
    if ((timing.screenshotCaptureMs || 0) > 45_000) timing.budgetExceeded?.push('screenshot-capture')
    throwIfAnalysisAborted(analysisSignal)
    reportProgress('progress.done', 100)

    if (accessMode === 'managed') {
      await saveManagedStorageState(runtime.context, options.dataDir, url).catch(() => {})
    }
    throwIfAnalysisAborted(analysisSignal)

    const pageCoverage = {
      requested: pageLimit,
      discovered: discoveredPageCount,
      selected: selectedPageCount,
      analyzed: analyzedPages.size,
      pages: [...analyzedPages].map(([pageUrl, metadata]) => ({ url: pageUrl, ...metadata })),
    }
    const requestedViewports = viewportNames.map((name) => {
      const viewport = VIEWPORTS[name] || VIEWPORTS.desktop
      return {
        name,
        ...viewport,
        deviceScaleFactor: name === 'mobile' ? 1 : browserEnvironment.deviceScaleFactor,
        mobile: name === 'mobile',
      }
    })
    const viewportEnvironments: CaptureViewportEnvironment[] = requestedViewports.map((viewport) => ({
      ...viewport,
      source: 'requested' as const,
      emulationProfile: viewport.mobile ? ('pixel-7-android-13' as const) : ('browser-default' as const),
      userAgent: viewport.mobile ? mobileUserAgent(browserEnvironment.userAgent) : browserEnvironment.userAgent,
    }))
    if (adaptiveMobileCaptured && !viewportEnvironments.some((viewport) => viewport.name === 'mobile')) {
      viewportEnvironments.push({
        name: 'mobile',
        ...VIEWPORTS.mobile,
        deviceScaleFactor: 1,
        mobile: true,
        source: 'adaptive',
        emulationProfile: 'pixel-7-android-13',
        userAgent: mobileUserAgent(browserEnvironment.userAgent),
      })
    }
    const captureManifest = buildCaptureManifest({
      capturedAt,
      requestSchemaVersion: request.schemaVersion,
      toolVersion: options.toolVersion,
      viewports: requestedViewports,
      pageMode: request.pageMode,
      maxPages: pageLimit,
      pageDiscovery: request.pageDiscovery,
      depth: request.depth,
      accessMode,
      executablePath: runtime.executablePath,
      headless: runtime.headless,
      environment: browserEnvironment,
      viewportEnvironments,
      animationFreezeAttempts,
      evidence: designEvidence,
      pageCoverage,
    })

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
      pageCoverage,
      captureManifest,
      completion: {
        reason: completionReason || 'complete',
      },
    }
  } catch (error) {
    throwIfAnalysisAborted(analysisSignal)
    throw error
  } finally {
    options.signal?.removeEventListener('abort', abortFromExternalSignal)
    options.finishSignal?.removeEventListener('abort', finishForUser)
    analysisSignal.removeEventListener('abort', closeActiveRuntime)
    await closeRuntime(runtime)
  }
}
