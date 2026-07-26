import type { Page } from 'playwright-core'

import type { ExtractedStyles } from './index.js'
import { extractStyles } from './style-extractor.js'

export interface DarkModeResult {
  hasDarkMode: boolean
  darkStyles: ExtractedStyles | null
  method: 'media-query' | 'class-toggle' | 'none'
}

/**
 * Detect and extract dark mode styles from a page.
 * Tries two strategies:
 * 1. CSS prefers-color-scheme media query (emulate)
 * 2. Class-based toggle (add .dark or [data-theme="dark"] to html)
 */
export async function extractDarkMode(page: Page): Promise<DarkModeResult> {
  // Strategy 1: Check if page has prefers-color-scheme media query
  const hasMediaQuery = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSMediaRule && rule.conditionText?.includes('prefers-color-scheme: dark')) {
            return true
          }
        }
      } catch {
        // Cross-origin
      }
    }
    return false
  })

  if (hasMediaQuery) {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(300)
    const darkStyles = await extractStyles(page)
    await page.emulateMedia({ colorScheme: 'light' })
    return { hasDarkMode: true, darkStyles, method: 'media-query' }
  }

  // Strategy 2: Check for class-based dark mode
  const classToggleResult = await page.evaluate(() => {
    const selectors = ['.dark', '[data-theme="dark"]', '[data-color-mode="dark"]', '[data-mode="dark"]']

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSStyleRule) {
            for (const sel of selectors) {
              if (rule.selectorText.includes(sel)) {
                return sel
              }
            }
          }
        }
      } catch {
        // Cross-origin
      }
    }
    return null
  })

  if (classToggleResult) {
    // Apply dark class/attribute
    await page.evaluate((selector) => {
      const html = document.documentElement
      if (selector === '.dark') {
        html.classList.add('dark')
      } else {
        const match = selector.match(/\[(.+?)="(.+?)"\]/)
        if (match) html.setAttribute(match[1], match[2])
      }
    }, classToggleResult)

    await page.waitForTimeout(300)
    const darkStyles = await extractStyles(page)

    // Revert
    await page.evaluate((selector) => {
      const html = document.documentElement
      if (selector === '.dark') {
        html.classList.remove('dark')
      } else {
        const match = selector.match(/\[(.+?)="(.+?)"\]/)
        if (match) html.removeAttribute(match[1])
      }
    }, classToggleResult)

    return { hasDarkMode: true, darkStyles, method: 'class-toggle' }
  }

  return { hasDarkMode: false, darkStyles: null, method: 'none' }
}
