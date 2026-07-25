import type { Page } from 'playwright-core'

import type { ExtractedStyles } from './index.js'

/**
 * Extract all computed styles from a page using page.evaluate().
 * This runs entirely in the browser context - no LLM tokens consumed.
 */
export async function extractStyles(page: Page): Promise<ExtractedStyles> {
  return await page.evaluate(() => {
    const styles: {
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
    } = {
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
    }

    // 1. Extract CSS custom properties from :root and stylesheets
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i]
              if (prop.startsWith('--')) {
                styles.cssVariables[prop] = rule.style.getPropertyValue(prop).trim()
              }
            }
          }
        }
      } catch {
        // Cross-origin stylesheets will throw
      }
    }

    // 2. Walk the DOM and extract computed styles from visible elements
    const elements = document.querySelectorAll('body *')
    const seen = new Set<string>()

    for (const el of elements) {
      const computed = getComputedStyle(el)

      // Skip hidden elements
      if (computed.display === 'none' || computed.visibility === 'hidden') continue

      // Colors
      const color = computed.color
      const bgColor = computed.backgroundColor

      if (color && color !== 'rgba(0, 0, 0, 0)') {
        styles.textColors.push(color)
        styles.colors.push(color)
      }
      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
        styles.backgroundColors.push(bgColor)
        styles.colors.push(bgColor)
      }

      // Border colors
      const borderColor = computed.borderTopColor
      if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)' && borderColor !== color) {
        styles.colors.push(borderColor)
      }

      // Font families
      const fontFamily = computed.fontFamily
      if (fontFamily && !seen.has(`font:${fontFamily}`)) {
        seen.add(`font:${fontFamily}`)
        styles.fontFamilies.push(fontFamily)
      }

      // Font sizes
      const fontSize = computed.fontSize
      if (fontSize) {
        styles.fontSizes.push(fontSize)
      }

      // Font weights
      const fontWeight = computed.fontWeight
      if (fontWeight) {
        styles.fontWeights.push(fontWeight)
      }

      // Line heights
      const lineHeight = computed.lineHeight
      if (lineHeight && lineHeight !== 'normal') {
        styles.lineHeights.push(lineHeight)
      }

      // Spacing (margin and padding)
      for (const prop of [
        'marginTop',
        'marginBottom',
        'marginLeft',
        'marginRight',
        'paddingTop',
        'paddingBottom',
        'paddingLeft',
        'paddingRight',
        'gap',
        'rowGap',
        'columnGap',
      ] as const) {
        const val = computed[prop as keyof CSSStyleDeclaration] as string
        if (val && val !== '0px' && val !== 'auto' && val !== 'normal') {
          styles.spacings.push(val)
        }
      }

      // Border radius
      const radius = computed.borderTopLeftRadius
      if (radius && radius !== '0px') {
        styles.radii.push(radius)
      }

      // Box shadow
      const shadow = computed.boxShadow
      if (shadow && shadow !== 'none') {
        styles.shadows.push(shadow)
      }

      // Border
      const border = computed.borderTopWidth
      if (border && border !== '0px') {
        styles.borders.push(`${border} ${computed.borderTopStyle} ${computed.borderTopColor}`)
      }
    }

    return styles
  })
}
