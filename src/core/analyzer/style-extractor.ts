import type { Page } from 'playwright-core'

import type { ExtractedStyles, InteractionStyles } from './types.js'

/**
 * Extract all computed styles from a page using page.evaluate().
 * This runs entirely in the browser context - no LLM tokens consumed.
 */
export async function extractStyles(page: Page): Promise<ExtractedStyles> {
  return await page.evaluate(() => {
    const styles: ExtractedStyles = {
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

    const countUsage = (category: string, value: string) => {
      const key = `${category}:${value}`
      styles.usageCount[key] = (styles.usageCount[key] || 0) + 1
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
        countUsage('textColor', color)
      }
      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
        styles.backgroundColors.push(bgColor)
        styles.colors.push(bgColor)
        countUsage('bgColor', bgColor)
      }

      // Border colors
      const borderColor = computed.borderTopColor
      if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)' && borderColor !== color) {
        styles.colors.push(borderColor)
        countUsage('borderColor', borderColor)
      }

      // Font families
      const fontFamily = computed.fontFamily
      if (fontFamily && !seen.has(`font:${fontFamily}`)) {
        seen.add(`font:${fontFamily}`)
        styles.fontFamilies.push(fontFamily)
      }
      if (fontFamily) countUsage('fontFamily', fontFamily)

      // Font sizes
      const fontSize = computed.fontSize
      if (fontSize) {
        styles.fontSizes.push(fontSize)
        countUsage('fontSize', fontSize)
      }

      // Font weights
      const fontWeight = computed.fontWeight
      if (fontWeight) {
        styles.fontWeights.push(fontWeight)
        countUsage('fontWeight', fontWeight)
      }

      // Line heights
      const lineHeight = computed.lineHeight
      if (lineHeight && lineHeight !== 'normal') {
        styles.lineHeights.push(lineHeight)
        countUsage('lineHeight', lineHeight)
      }

      // Letter spacing
      const letterSpacing = computed.letterSpacing
      if (letterSpacing && letterSpacing !== 'normal' && letterSpacing !== '0px') {
        styles.letterSpacings.push(letterSpacing)
        countUsage('letterSpacing', letterSpacing)
      }

      // Z-index
      const zIndex = computed.zIndex
      if (zIndex && zIndex !== 'auto' && zIndex !== '0') {
        styles.zIndices.push(zIndex)
        countUsage('zIndex', zIndex)
      }

      // Transition duration
      const transitionDuration = computed.transitionDuration
      if (transitionDuration && transitionDuration !== '0s') {
        const durations = transitionDuration.split(',').map((d) => d.trim())
        for (const d of durations) {
          if (d && d !== '0s') {
            styles.transitions.push(d)
            countUsage('transition', d)
          }
        }
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
          countUsage('spacing', val)
        }
      }

      // Border radius
      const radius = computed.borderTopLeftRadius
      if (radius && radius !== '0px') {
        styles.radii.push(radius)
        countUsage('radius', radius)
      }

      // Box shadow
      const shadow = computed.boxShadow
      if (shadow && shadow !== 'none') {
        styles.shadows.push(shadow)
        countUsage('shadow', shadow)
      }

      // Border
      const border = computed.borderTopWidth
      if (border && border !== '0px') {
        const borderVal = `${border} ${computed.borderTopStyle} ${computed.borderTopColor}`
        styles.borders.push(borderVal)
        countUsage('border', borderVal)
      }
    }

    return styles
  })
}

export async function extractInteractionStyles(page: Page): Promise<InteractionStyles> {
  return await page.evaluate(() => {
    const interactions: InteractionStyles = { hover: [], focus: [], active: [] }

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSStyleRule)) continue
          const selector = rule.selectorText

          let target: Record<string, string>[] | null = null
          if (selector.includes(':hover')) target = interactions.hover
          else if (selector.includes(':focus')) target = interactions.focus
          else if (selector.includes(':active')) target = interactions.active

          if (!target) continue

          const props: Record<string, string> = {}
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i]
            const value = rule.style.getPropertyValue(prop)
            if (value && !prop.startsWith('-webkit-') && !prop.startsWith('-moz-')) {
              props[prop] = value.trim()
            }
          }

          if (Object.keys(props).length > 0) {
            target.push(props)
          }
        }
      } catch {
        // Cross-origin stylesheets
      }
    }

    return interactions
  })
}
