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

    const countUsage = (category: string, value: string, amount = 1) => {
      const key = `${category}:${value}`
      styles.usageCount[key] = (styles.usageCount[key] || 0) + amount
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
    const elements = [document.documentElement, document.body, ...document.querySelectorAll('body *')]
    const seen = new Set<string>()

    for (const el of elements) {
      const computed = getComputedStyle(el)

      // Skip hidden elements
      if (computed.display === 'none' || computed.visibility === 'hidden') continue

      // Colors
      const color = computed.color
      const bgColor = computed.backgroundColor
      const interactive = Boolean(
        el.closest(
          'a, button, input, select, textarea, [role="button"], [role="link"], [aria-current], [aria-selected="true"]',
        ),
      )
      const action = Boolean(el.closest('button, [role="button"], input[type="button"], input[type="submit"]'))
      const link = Boolean(el.closest('a, [role="link"]'))
      const selected = Boolean(el.closest('[aria-current], [aria-selected="true"], [data-state="active"]'))

      if (color && color !== 'rgba(0, 0, 0, 0)') {
        styles.textColors.push(color)
        styles.colors.push(color)
        countUsage('textColor', color)
        if (interactive) countUsage('accentColor', color)
        if (action) countUsage('actionColor', color)
        if (link) countUsage('linkColor', color)
        if (selected) countUsage('selectedColor', color)
      }
      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
        styles.backgroundColors.push(bgColor)
        styles.colors.push(bgColor)
        countUsage('bgColor', bgColor)
        if (interactive) countUsage('accentColor', bgColor)
        if (action) countUsage('actionColor', bgColor)
        if (selected) countUsage('selectedColor', bgColor)

        const rect = el.getBoundingClientRect()
        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0))
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
        const viewportArea = Math.max(1, window.innerWidth * window.innerHeight)
        const visibleAreaShare = (visibleWidth * visibleHeight) / viewportArea
        if (visibleAreaShare > 0) countUsage('bgArea', bgColor, visibleAreaShare)
      }

      // Only count borders that are actually painted. Sampling borderTopColor alone also records zero-width defaults
      // and misses bottom/side dividers, which can make a control or focus color look like the site's structural border.
      const rect = el.getBoundingClientRect()
      const borderSides = [
        [computed.borderTopWidth, computed.borderTopStyle, computed.borderTopColor, rect.width],
        [computed.borderRightWidth, computed.borderRightStyle, computed.borderRightColor, rect.height],
        [computed.borderBottomWidth, computed.borderBottomStyle, computed.borderBottomColor, rect.width],
        [computed.borderLeftWidth, computed.borderLeftStyle, computed.borderLeftColor, rect.height],
      ] as const
      const observedBorderColors = new Set<string>()
      const observedBorders = new Set<string>()
      for (const [width, style, borderColor, edgeLength] of borderSides) {
        if (
          !Number.isFinite(Number.parseFloat(width)) ||
          Number.parseFloat(width) <= 0 ||
          edgeLength <= 0 ||
          style === 'none' ||
          style === 'hidden' ||
          !borderColor ||
          borderColor === 'rgba(0, 0, 0, 0)'
        ) {
          continue
        }

        if (!observedBorderColors.has(borderColor)) {
          observedBorderColors.add(borderColor)
          styles.colors.push(borderColor)
          countUsage('borderColor', borderColor)
          if (!interactive) countUsage('structuralBorderColor', borderColor)
        }

        const borderValue = `${width} ${style} ${borderColor}`
        if (!observedBorders.has(borderValue)) {
          observedBorders.add(borderValue)
          styles.borders.push(borderValue)
          countUsage('border', borderValue)
        }
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
        if (fontSize) countUsage('typeMetric', `${fontSize}|${lineHeight}`)
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
    }

    return styles
  })
}

export async function extractInteractionStyles(page: Page): Promise<InteractionStyles> {
  return await page.evaluate(() => {
    const interactions: InteractionStyles = { hover: [], focus: [], active: [] }
    const safeProperties = new Set([
      'background-color',
      'border-color',
      'border-bottom-color',
      'border-left-color',
      'border-right-color',
      'border-top-color',
      'box-shadow',
      'color',
      'display',
      'filter',
      'fill',
      'height',
      'max-height',
      'max-width',
      'opacity',
      'outline',
      'outline-color',
      'outline-offset',
      'outline-style',
      'outline-width',
      'rotate',
      'scale',
      'stroke',
      'text-decoration',
      'text-decoration-color',
      'text-decoration-line',
      'text-decoration-thickness',
      'text-shadow',
      'text-underline-offset',
      'transform',
      'translate',
      'visibility',
      'width',
    ])

    const visitRules = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          const selector = rule.selectorText
          const targets: Array<Record<string, string>[]> = []
          if (selector.includes(':hover')) targets.push(interactions.hover)
          if (selector.includes(':focus')) targets.push(interactions.focus)
          if (selector.includes(':active')) targets.push(interactions.active)
          if (targets.length === 0) continue

          const props: Record<string, string> = {}
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i]
            const value = rule.style.getPropertyValue(prop)
            const unsafeValue = /(?:url\s*\(|data:|https?:|javascript:)/i.test(value)
            if (value && safeProperties.has(prop) && !unsafeValue) {
              props[prop] = value.trim()
            }
          }

          if (Object.keys(props).length > 0) {
            targets.forEach((target) => target.push(props))
          }
          continue
        }

        const nestedRules = 'cssRules' in rule ? (rule as CSSMediaRule).cssRules : null
        if (nestedRules) visitRules(nestedRules)
      }
    }

    for (const sheet of document.styleSheets) {
      try {
        visitRules(sheet.cssRules)
      } catch {
        // Cross-origin stylesheets
      }
    }

    return interactions
  })
}

export interface DetectedTechStack {
  frameworks: string[]
  uiLibraries: string[]
  cssApproach: string[]
  bundler?: string
  icons?: string
}

export async function detectTechStack(page: Page): Promise<DetectedTechStack> {
  return await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    const frameworks: string[] = []
    const uiLibraries: string[] = []
    const cssApproach: string[] = []
    let bundler: string | undefined
    let icons: string | undefined

    if (w.__NEXT_DATA__ || document.getElementById('__next')) frameworks.push('Next.js')
    else if (w.__NUXT__ || w.__nuxt__) frameworks.push('Nuxt')
    if (w.__SVELTE__ || document.querySelector('[data-svelte-h]')) frameworks.push('Svelte')
    if (w.__REMIX_CONTEXT) frameworks.push('Remix')
    if (document.querySelector('[ng-version]') || document.querySelector('[_ngcontent]')) frameworks.push('Angular')

    const rootEl = document.getElementById('root') || document.getElementById('app') || document.body
    const reactRoot =
      rootEl && ('_reactRootContainer' in rootEl || (rootEl as HTMLElement).querySelector('[data-reactroot]'))
    if (reactRoot && !frameworks.some((f) => f.includes('Next'))) frameworks.push('React')
    if (w.__VUE__ || document.querySelector('[data-v-]') || document.querySelector('[data-vue]')) {
      if (!frameworks.some((f) => f.includes('Nuxt'))) frameworks.push('Vue')
    }

    const allClasses = new Set<string>()
    const sampleEls = document.querySelectorAll('body *')
    const sampleCount = Math.min(sampleEls.length, 500)
    for (let i = 0; i < sampleCount; i++) {
      const el = sampleEls[Math.floor((i * sampleEls.length) / sampleCount)]
      el.classList.forEach((c) => allClasses.add(c))
    }
    const classArr = [...allClasses]

    const classPatterns: Array<{ pattern: RegExp | ((classes: string[]) => boolean); name: string }> = [
      { pattern: (cs) => cs.some((c) => /^chakra-/.test(c)), name: 'Chakra UI' },
      { pattern: (cs) => cs.some((c) => /^ant-/.test(c)), name: 'Ant Design' },
      { pattern: (cs) => cs.some((c) => /^el-/.test(c)), name: 'Element Plus' },
      { pattern: (cs) => cs.some((c) => /^Mui/.test(c) || /^css-/.test(c)), name: 'MUI' },
      { pattern: (cs) => cs.some((c) => /^v-/.test(c) && /^v-(btn|card|chip|dialog)/.test(c)), name: 'Vuetify' },
      { pattern: (cs) => cs.some((c) => /^bp[345]-/.test(c)), name: 'Blueprint' },
      { pattern: (cs) => cs.some((c) => /^rs-/.test(c)), name: 'rsuite' },
      { pattern: (cs) => cs.some((c) => /^semi-/.test(c)), name: 'Semi Design' },
      { pattern: (cs) => cs.some((c) => /^arco-/.test(c)), name: 'Arco Design' },
      { pattern: (cs) => cs.some((c) => /^next-ui-/.test(c) || /^nextui-/.test(c)), name: 'NextUI' },
    ]
    for (const { pattern, name } of classPatterns) {
      const matched = typeof pattern === 'function' ? pattern(classArr) : classArr.some((c) => pattern.test(c))
      if (matched) uiLibraries.push(name)
    }
    if (document.querySelector('[data-radix-collection-item], [data-radix-popper-content-wrapper]'))
      uiLibraries.push('Radix UI')
    if (document.querySelector('[data-headlessui-state]')) uiLibraries.push('Headless UI')

    const metaGenerator = document.querySelector('meta[name="generator"]')?.getAttribute('content') || ''
    if (/gatsby/i.test(metaGenerator)) frameworks.push('Gatsby')
    if (/hugo/i.test(metaGenerator)) frameworks.push('Hugo')
    if (/wordpress/i.test(metaGenerator)) frameworks.push('WordPress')
    if (/astro/i.test(metaGenerator)) frameworks.push('Astro')

    const utilityCount = classArr.filter((c) =>
      /^(flex|grid|hidden|block|inline|relative|absolute|fixed|sticky|overflow-|items-|justify-|gap-|p[xytblr]?-|m[xytblr]?-|w-|h-|min-|max-|text-|font-|bg-|border-|rounded-|shadow-|opacity-|transition-|transform-|z-|space-|divide-|ring-)/.test(
        c,
      ),
    ).length
    if (utilityCount > 20) cssApproach.push('Tailwind CSS')

    const hasBootstrapClasses = classArr.some((c) =>
      /^(btn-|col-|row|container-fluid|navbar-|modal-|card-body)$/.test(c),
    )
    if (hasBootstrapClasses) cssApproach.push('Bootstrap')

    const cssModuleCount = classArr.filter((c) =>
      /^[a-zA-Z][a-zA-Z0-9]*_[a-zA-Z][a-zA-Z0-9]*__[a-zA-Z0-9]{5,}$/.test(c),
    ).length
    if (cssModuleCount > 5) cssApproach.push('CSS Modules')

    const styledCount = classArr.filter((c) => /^(sc-|css-|emotion-|__emotion_)/.test(c)).length
    if (styledCount > 5) cssApproach.push('CSS-in-JS')

    if (cssApproach.length === 0) cssApproach.push('Vanilla CSS')

    const scripts = document.querySelectorAll('script[src]')
    scripts.forEach((s) => {
      const src = s.getAttribute('src') || ''
      if (src.includes('webpack')) bundler = 'webpack'
      else if (src.includes('_next/static')) bundler = 'webpack'
      else if (src.includes('.vite/') || src.includes('/@vite/')) bundler = 'Vite'
    })
    if (!bundler && w.__vite_plugin_react_preamble_installed__) bundler = 'Vite'
    if (!bundler && document.querySelector('script[type="module"][src*="assets/"]')) bundler = 'Vite'

    const iconLinks = document.querySelectorAll('link[href*="font-awesome"], link[href*="fontawesome"]')
    if (iconLinks.length > 0) icons = 'Font Awesome'
    const materialIcons = document.querySelectorAll('link[href*="material-icons"], .material-icons, .material-symbols')
    if (materialIcons.length > 0) icons = icons ? `${icons}, Material Icons` : 'Material Icons'
    const lucideUse = classArr.some((c) => /^lucide-/.test(c))
    if (lucideUse) icons = icons ? `${icons}, Lucide` : 'Lucide'

    return { frameworks, uiLibraries, cssApproach, bundler, icons }
  })
}
