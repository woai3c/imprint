import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import { type Browser, type Page, chromium } from 'playwright-core'

import type { DesignToken } from '../export.js'
import { clusterColors } from './color-cluster.js'
import { type InteractionStyles, extractInteractionStyles, extractStyles } from './style-extractor.js'
import { buildDesignTokens } from './token-builder.js'

export interface AnalysisOptions {
  viewports?: string[]
  maxPages?: number
  useSession?: boolean
}

export interface AnalysisResult {
  tokens: DesignToken
  screenshots: string[]
  rawStyles: ExtractedStyles
  interactions: InteractionStyles
  duration: number
}

export interface ExtractedStyles {
  colors: string[]
  fontFamilies: string[]
  fontSizes: string[]
  fontWeights: string[]
  lineHeights: string[]
  spacings: string[]
  radii: string[]
  shadows: string[]
  borders: string[]
  cssVariables: Record<string, string>
  backgroundColors: string[]
  textColors: string[]
  usageCount: Record<string, number>
}

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
}

function findBrowser(): string | undefined {
  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'

  if (isWin) {
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

  if (isMac) {
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
  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'

  if (isWin) {
    const chromePath = path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data')
    if (fs.existsSync(chromePath)) return chromePath
    const edgePath = path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/User Data')
    if (fs.existsSync(edgePath)) return edgePath
  }

  if (isMac) {
    const home = process.env.HOME || ''
    const chromePath = path.join(home, 'Library/Application Support/Google/Chrome')
    if (fs.existsSync(chromePath)) return chromePath
    const edgePath = path.join(home, 'Library/Application Support/Microsoft Edge')
    if (fs.existsSync(edgePath)) return edgePath
  }

  return undefined
}

export async function analyzeUrl(
  url: string,
  options: AnalysisOptions = {},
  onProgress?: (step: string, percent: number) => void,
): Promise<AnalysisResult> {
  const startTime = Date.now()
  const viewportNames = options.viewports || ['desktop']
  const screenshotDir = path.join(app.getPath('userData'), 'screenshots')
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true })
  }

  onProgress?.('正在启动浏览器...', 5)

  const executablePath = findBrowser()
  if (!executablePath) {
    throw new Error('未找到 Chrome/Edge 浏览器。请安装 Google Chrome 或 Microsoft Edge。')
  }

  const useSession = options.useSession !== false
  let browser: Browser | null = null
  let persistentContext: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null

  if (useSession) {
    const userProfile = getUserProfilePath()
    if (userProfile) {
      const sessionDir = path.join(app.getPath('userData'), 'browser-session')
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true })
      }

      // Copy cookies from user profile to our session dir for reuse
      const defaultProfile = path.join(userProfile, 'Default')
      const cookiesSrc = path.join(defaultProfile, 'Cookies')
      const cookiesDst = path.join(sessionDir, 'Default', 'Cookies')
      if (fs.existsSync(cookiesSrc)) {
        const dstDir = path.dirname(cookiesDst)
        if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true })
        try {
          fs.copyFileSync(cookiesSrc, cookiesDst)
        } catch {
          // Cookie file may be locked, proceed without session
        }
      }

      try {
        persistentContext = await chromium.launchPersistentContext(sessionDir, {
          executablePath,
          headless: true,
          args: ['--disable-blink-features=AutomationControlled'],
        })
      } catch {
        // Fallback to regular launch if persistent context fails
        persistentContext = null
      }
    }
  }

  if (!persistentContext) {
    browser = await chromium.launch({
      executablePath,
      headless: true,
    })
  }

  try {
    const allStyles: ExtractedStyles[] = []
    const screenshots: string[] = []
    let allInteractions: InteractionStyles = { hover: [], focus: [], active: [] }

    for (let i = 0; i < viewportNames.length; i++) {
      const vpName = viewportNames[i]
      const viewport = VIEWPORTS[vpName] || VIEWPORTS.desktop
      const progress = 10 + (i / viewportNames.length) * 70

      onProgress?.(`正在分析 ${vpName} 视口...`, Math.round(progress))

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

      // Wait for fonts to load
      await page.waitForFunction(() => document.fonts.ready, { timeout: 5000 }).catch(() => {})

      // Extract styles via page.evaluate
      const styles = await extractStyles(page)
      allStyles.push(styles)

      // Extract interaction styles (only for first viewport)
      if (i === 0) {
        allInteractions = await extractInteractionStyles(page)
      }

      // Take screenshot
      const screenshotPath = path.join(screenshotDir, `${Date.now()}-${vpName}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      screenshots.push(screenshotPath)

      await page.close()
    }

    onProgress?.('正在分析设计模式...', 85)

    // Merge styles from all viewports
    const mergedStyles = mergeStyles(allStyles)

    // Cluster colors into semantic groups
    onProgress?.('正在聚类颜色...', 90)
    const clusteredColors = clusterColors(mergedStyles.colors)

    // Build design tokens
    onProgress?.('正在生成设计令牌...', 95)
    const tokens = buildDesignTokens(mergedStyles, clusteredColors)

    onProgress?.('完成', 100)

    return {
      tokens,
      screenshots,
      rawStyles: mergedStyles,
      interactions: allInteractions,
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
    spacings: [],
    radii: [],
    shadows: [],
    borders: [],
    cssVariables: {},
    backgroundColors: [],
    textColors: [],
    usageCount: {},
  }

  for (const styles of stylesList) {
    merged.colors.push(...styles.colors)
    merged.fontFamilies.push(...styles.fontFamilies)
    merged.fontSizes.push(...styles.fontSizes)
    merged.fontWeights.push(...styles.fontWeights)
    merged.lineHeights.push(...styles.lineHeights)
    merged.spacings.push(...styles.spacings)
    merged.radii.push(...styles.radii)
    merged.shadows.push(...styles.shadows)
    merged.borders.push(...styles.borders)
    merged.backgroundColors.push(...styles.backgroundColors)
    merged.textColors.push(...styles.textColors)
    Object.assign(merged.cssVariables, styles.cssVariables)
    for (const [key, count] of Object.entries(styles.usageCount)) {
      merged.usageCount[key] = (merged.usageCount[key] || 0) + count
    }
  }

  // Deduplicate
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
