import fs from 'node:fs'
import path from 'node:path'

import { type Browser, type Page, chromium } from 'playwright-core'

import { isMacOS, isWindows } from '../../shared/platform.js'
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

export interface AnalysisOptions {
  viewports?: string[]
  maxPages?: number
  useSession?: boolean
  extractDarkMode?: boolean
  dataDir: string
}

export interface AnalysisResult {
  tokens: DesignToken
  screenshots: string[]
  rawStyles: ExtractedStyles
  interactions: InteractionStyles
  darkMode: DarkModeResult | null
  featureTags: string[]
  components: ComponentPattern[]
  breakpoints: ResponsiveBreakpoint[]
  motion: MotionToken[]
  duration: number
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

function getUserProfilePath(): string | undefined {
  if (isWindows(process.platform)) {
    const chromePath = path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data')
    if (fs.existsSync(chromePath)) return chromePath
    const edgePath = path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/User Data')
    if (fs.existsSync(edgePath)) return edgePath
  }

  if (isMacOS(process.platform)) {
    const home = process.env.HOME || ''
    const chromePath = path.join(home, 'Library/Application Support/Google/Chrome')
    if (fs.existsSync(chromePath)) return chromePath
    const edgePath = path.join(home, 'Library/Application Support/Microsoft Edge')
    if (fs.existsSync(edgePath)) return edgePath
  }

  return undefined
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
  const screenshotDir = path.join(options.dataDir, 'screenshots')
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true })
  }

  onProgress?.('progress.launchingBrowser', 5)

  const executablePath = findBrowser()
  if (!executablePath) {
    throw new Error('Chrome/Edge not found. Please install Google Chrome or Microsoft Edge.')
  }

  const useSession = options.useSession !== false
  let browser: Browser | null = null
  let persistentContext: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null

  if (useSession) {
    const userProfile = getUserProfilePath()
    if (userProfile) {
      const sessionDir = path.join(options.dataDir, 'browser-session')
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true })
      }

      const defaultProfile = path.join(userProfile, 'Default')
      const cookiesSrc = path.join(defaultProfile, 'Cookies')
      const cookiesDst = path.join(sessionDir, 'Default', 'Cookies')
      if (fs.existsSync(cookiesSrc)) {
        const dstDir = path.dirname(cookiesDst)
        if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true })
        try {
          fs.copyFileSync(cookiesSrc, cookiesDst)
        } catch {
          // Cookie file may be locked
        }
      }

      try {
        persistentContext = await chromium.launchPersistentContext(sessionDir, {
          executablePath,
          headless: true,
          args: ['--disable-blink-features=AutomationControlled'],
        })
      } catch {
        persistentContext = null
      }
    }
  }

  if (!persistentContext) {
    browser = await chromium.launch({ executablePath, headless: true })
  }

  try {
    const allStyles: ExtractedStyles[] = []
    const screenshots: string[] = []
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

      const page: Page = persistentContext
        ? await persistentContext.newPage()
        : await browser!.newPage({
            viewport,
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          })

      if (persistentContext) {
        await page.setViewportSize(viewport)
      }

      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
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

      const screenshotPath = path.join(screenshotDir, `${Date.now()}-${vpName}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      screenshots.push(screenshotPath)

      await page.close()
    }

    // Multi-page analysis: discover and visit sub-pages for richer token extraction
    const maxPages = options.maxPages ?? 3
    if (maxPages > 0) {
      const mainViewport = VIEWPORTS[viewportNames[0]] || VIEWPORTS.desktop
      const discoveryPage: Page = persistentContext
        ? await persistentContext.newPage()
        : await browser!.newPage({
            viewport: mainViewport,
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          })

      if (persistentContext) {
        await discoveryPage.setViewportSize(mainViewport)
      }

      await discoveryPage.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
      onProgress?.('progress.discoveringPages', 75)

      const subPages = await discoverSubPages(discoveryPage, url, maxPages)
      await discoveryPage.close()

      for (let i = 0; i < subPages.length; i++) {
        const subUrl = subPages[i]
        onProgress?.(`progress.analyzingPage::${i + 1}::${subPages.length}`, 76 + ((i + 1) / subPages.length) * 8)

        const subPage: Page = persistentContext
          ? await persistentContext.newPage()
          : await browser!.newPage({
              viewport: mainViewport,
              userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            })

        if (persistentContext) {
          await subPage.setViewportSize(mainViewport)
        }

        try {
          await subPage.goto(subUrl, { waitUntil: 'networkidle', timeout: 15000 })
          const subStyles = await extractStyles(subPage)
          allStyles.push(subStyles)
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
      rawStyles: mergedStyles,
      interactions: allInteractions,
      darkMode: darkModeResult,
      featureTags,
      components,
      breakpoints,
      motion,
      duration: Date.now() - startTime,
    }
  } finally {
    if (persistentContext) {
      await persistentContext.close()
    } else if (browser) {
      await browser.close()
    }
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
