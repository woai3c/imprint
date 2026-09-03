import type { Page } from 'playwright-core'

import { extractStyles } from './style-extractor.js'
import type { DarkModeResult, ExtractedStyles } from './types.js'

function colorLuminance(value: string | undefined): number | null {
  if (!value) return null
  const rgb = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  const hex = value.match(/^#([\da-f]{6}|[\da-f]{3})$/i)
  let channels: number[]
  if (rgb) {
    channels = rgb.slice(1, 4).map(Number)
  } else if (hex) {
    const expanded = hex[1].length === 3 ? hex[1].replace(/(.)/g, '$1$1') : hex[1]
    channels = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16))
  } else {
    return null
  }
  const linear = channels.map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

function categoryDistribution(styles: ExtractedStyles, primary: string, fallback?: string): Map<string, number> {
  const read = (category: string) => {
    const prefix = `${category}:`
    return Object.entries(styles.usageCount)
      .filter(([key, count]) => key.startsWith(prefix) && Number.isFinite(count) && count > 0)
      .map(([key, count]) => [key.slice(prefix.length), count] as const)
  }
  const entries = read(primary)
  const selected = entries.length > 0 || !fallback ? entries : read(fallback)
  const total = selected.reduce((sum, [, count]) => sum + count, 0)
  return new Map(selected.map(([color, count]) => [color, total > 0 ? count / total : 0]))
}

function distributionDistance(first: ReadonlyMap<string, number>, second: ReadonlyMap<string, number>): number {
  const colors = new Set([...first.keys(), ...second.keys()])
  return [...colors].reduce((sum, color) => sum + Math.abs((first.get(color) || 0) - (second.get(color) || 0)), 0) / 2
}

function dominantLuminance(distribution: ReadonlyMap<string, number>): number | null {
  const dominant = [...distribution.entries()].sort((a, b) => b[1] - a[1])[0]
  return colorLuminance(dominant?.[0])
}

async function waitForThemeSettle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 100)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.clearTimeout(timeout)
            resolve()
          })
        })
      }),
  )

  const sampleThemeStyles = () =>
    page.evaluate(() =>
      [document.documentElement, document.body, ...document.querySelectorAll('body *')]
        .slice(0, 24)
        .map((element) => {
          if (!element) return ''
          const style = getComputedStyle(element)
          return `${style.color}|${style.backgroundColor}|${style.borderColor}|${style.opacity}`
        })
        .join('\n'),
    )

  let previous = await sampleThemeStyles()
  let stableSamples = 0
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(50)
    const current = await sampleThemeStyles()
    if (current === previous) {
      stableSamples += 1
      if (stableSamples >= 2) return
    } else {
      stableSamples = 0
      previous = current
    }
  }
}

export function hasMeaningfulDarkModeChange(lightStyles: ExtractedStyles, darkStyles: ExtractedStyles): boolean {
  const lightBackgrounds = categoryDistribution(lightStyles, 'bgArea', 'bgColor')
  const darkBackgrounds = categoryDistribution(darkStyles, 'bgArea', 'bgColor')
  const lightTexts = categoryDistribution(lightStyles, 'textColor')
  const darkTexts = categoryDistribution(darkStyles, 'textColor')
  const lightBackgroundLuminance = dominantLuminance(lightBackgrounds)
  const darkBackgroundLuminance = dominantLuminance(darkBackgrounds)

  if (lightBackgroundLuminance === null || darkBackgroundLuminance === null) return false
  const backgroundBecameDark =
    darkBackgroundLuminance < 0.35 && darkBackgroundLuminance + 0.02 < lightBackgroundLuminance
  if (!backgroundBecameDark) return false

  return (
    distributionDistance(lightBackgrounds, darkBackgrounds) >= 0.08 ||
    distributionDistance(lightTexts, darkTexts) >= 0.12
  )
}

/**
 * Detect and extract dark mode styles from a page.
 * Tries two strategies:
 * 1. CSS prefers-color-scheme media query (emulate)
 * 2. Class-based toggle (add .dark or [data-theme="dark"] to html)
 */
export async function extractDarkMode(
  page: Page,
  lightStyles: ExtractedStyles,
  viewport = 'desktop',
  captureKey?: string,
): Promise<DarkModeResult> {
  const source = { url: page.url(), viewport }
  if (captureKey) Object.defineProperty(source, 'captureKey', { value: captureKey })
  // Probe the browser media state directly. Stylesheet introspection alone misses
  // cross-origin sheets, nested @layer blocks, and JavaScript matchMedia listeners.
  await page.emulateMedia({ colorScheme: 'dark' })
  try {
    await waitForThemeSettle(page)
    const darkStyles = await extractStyles(page)
    if (hasMeaningfulDarkModeChange(lightStyles, darkStyles)) {
      return { hasDarkMode: true, darkStyles, method: 'media-query', source }
    }
  } finally {
    await page.emulateMedia({ colorScheme: null })
    await waitForThemeSettle(page)
  }

  // Strategy 2: Probe common class/attribute toggles. Detected selectors are tried
  // first, but the complete set remains available when stylesheets are unreadable.
  const toggleEvidence = await page.evaluate(() => {
    const selectors = ['.dark', '[data-theme="dark"]', '[data-color-mode="dark"]', '[data-mode="dark"]']
    const matches = new Set<string>()
    let hasUnreadableStylesheet = false

    const visitRules = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          for (const selector of selectors) {
            if (rule.selectorText.includes(selector)) matches.add(selector)
          }
        }
        const nestedRules = 'cssRules' in rule ? (rule as CSSGroupingRule).cssRules : null
        if (nestedRules) visitRules(nestedRules)
      }
    }

    for (const sheet of document.styleSheets) {
      try {
        visitRules(sheet.cssRules)
      } catch {
        hasUnreadableStylesheet = true
      }
    }

    for (const target of [document.documentElement, document.body]) {
      if (!target) continue
      if (target.classList.contains('light') || target.classList.contains('dark')) matches.add('.dark')
      if (target.hasAttribute('data-theme')) matches.add('[data-theme="dark"]')
      if (target.hasAttribute('data-color-mode')) matches.add('[data-color-mode="dark"]')
      if (target.hasAttribute('data-mode')) matches.add('[data-mode="dark"]')
    }

    return { selectors: [...matches], hasUnreadableStylesheet }
  })

  const commonToggleSelectors = ['.dark', '[data-theme="dark"]', '[data-color-mode="dark"]', '[data-mode="dark"]']
  const toggleSelectors = [
    ...new Set([...toggleEvidence.selectors, ...(toggleEvidence.hasUnreadableStylesheet ? commonToggleSelectors : [])]),
  ]

  for (const selector of toggleSelectors) {
    for (const targetName of ['html', 'body'] as const) {
      const previousValue = await page.evaluate(
        ({ selector, targetName }) => {
          const target = targetName === 'html' ? document.documentElement : document.body
          if (!target) return null
          const previous = target.getAttribute(selector === '.dark' ? 'class' : selector.match(/\[(.+?)=/)?.[1] || '')
          if (selector === '.dark') {
            target.classList.remove('light')
            target.classList.add('dark')
          } else {
            const match = selector.match(/\[(.+?)="(.+?)"\]/)
            if (match) target.setAttribute(match[1], match[2])
          }
          return previous
        },
        { selector, targetName },
      )

      try {
        await waitForThemeSettle(page)
        const darkStyles = await extractStyles(page)
        if (hasMeaningfulDarkModeChange(lightStyles, darkStyles)) {
          return { hasDarkMode: true, darkStyles, method: 'class-toggle', selector, source }
        }
      } finally {
        await page.evaluate(
          ({ selector, previous, targetName }) => {
            const target = targetName === 'html' ? document.documentElement : document.body
            if (!target) return
            if (selector === '.dark') {
              if (previous === null) target.removeAttribute('class')
              else target.setAttribute('class', previous)
            } else {
              const match = selector.match(/\[(.+?)="(.+?)"\]/)
              if (match) {
                if (previous === null) target.removeAttribute(match[1])
                else target.setAttribute(match[1], previous)
              }
            }
          },
          { selector, previous: previousValue, targetName },
        )
        await waitForThemeSettle(page)
      }
    }
  }

  return { hasDarkMode: false, darkStyles: null, method: 'none' }
}
