import type { Locator, Page } from 'playwright-core'

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
      valueSources: {},
    }

    const countUsage = (category: string, value: string, amount = 1) => {
      const key = `${category}:${value}`
      styles.usageCount[key] = (styles.usageCount[key] || 0) + amount
    }
    const addValueSource = (category: string, value: string, source: string) => {
      const key = `${category}:${value}`
      const sources = styles.valueSources?.[key] || []
      if (!sources.includes(source)) sources.push(source)
      if (styles.valueSources) styles.valueSources[key] = sources
    }

    const colorCanvas = document.createElement('canvas')
    colorCanvas.width = colorCanvas.height = 1
    const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true })
    const colorCache = new Map<string, string | null>()
    const normalizeObservedColor = (value: string): string | null => {
      const input = value.trim()
      if (!input || input === 'transparent') return null
      const cached = colorCache.get(input)
      if (cached !== undefined) return cached
      if (!colorContext) return input

      try {
        colorContext.clearRect(0, 0, 1, 1)
        colorContext.fillStyle = '#010203'
        colorContext.fillStyle = input
        const firstParse = colorContext.fillStyle
        colorContext.fillStyle = '#040506'
        colorContext.fillStyle = input
        const secondParse = colorContext.fillStyle
        if (firstParse !== secondParse) {
          colorCache.set(input, null)
          return null
        }
        colorContext.fillStyle = firstParse
        colorContext.fillRect(0, 0, 1, 1)
        const [red, green, blue, alphaByte] = colorContext.getImageData(0, 0, 1, 1).data
        if (alphaByte === 0) {
          colorCache.set(input, null)
          return null
        }
        const alpha = Number((alphaByte / 255).toFixed(3))
        const normalized =
          alpha >= 0.999 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha})`
        colorCache.set(input, normalized)
        return normalized
      } catch {
        colorCache.set(input, null)
        return null
      }
    }

    const colorProbe = document.createElement('span')
    colorProbe.setAttribute('aria-hidden', 'true')
    colorProbe.style.cssText = 'position:fixed;pointer-events:none;visibility:hidden'
    document.documentElement.append(colorProbe)
    const resolveDeclaredColor = (value: string): string | null => {
      colorProbe.style.color = ''
      colorProbe.style.color = value
      if (!colorProbe.style.color) return null
      return normalizeObservedColor(getComputedStyle(colorProbe).color)
    }

    // 1. Extract effective CSS custom properties from accessible rules and the
    // computed root style. The latter covers :root, html, nested @layer rules,
    // inline runtime tokens, and readable author styles with compound selectors.
    const addCustomProperties = (declaration: CSSStyleDeclaration) => {
      for (let i = 0; i < declaration.length; i++) {
        const prop = declaration[i]
        if (!prop.startsWith('--')) continue
        const value = declaration.getPropertyValue(prop).trim()
        if (value) styles.cssVariables[prop] = value
      }
    }
    const visitCustomPropertyRules = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          try {
            if (rule.selectorText.split(',').some((selector) => document.documentElement.matches(selector.trim()))) {
              addCustomProperties(rule.style)
            }
          } catch {
            // Unsupported selectors do not prevent the remaining rules from being observed.
          }
        }
        const nestedRules = 'cssRules' in rule ? (rule as CSSGroupingRule).cssRules : null
        if (nestedRules) visitCustomPropertyRules(nestedRules)
      }
    }
    for (const sheet of document.styleSheets) {
      try {
        visitCustomPropertyRules(sheet.cssRules)
      } catch {
        // Cross-origin stylesheets will throw
      }
    }
    addCustomProperties(getComputedStyle(document.documentElement))
    addCustomProperties(document.documentElement.style)

    const semanticColorVariable =
      /(?:^|[-_])(brand|primary|secondary|accent|action|cta|theme|background|surface|foreground|border|ring|link|card|muted)(?:$|[-_])/i
    const brandColorVariable = /(?:^|[-_])(brand|primary|accent|action|cta|theme)(?:$|[-_])/i
    const brandVariantVariable =
      /(?:^|[-_])(?:hover|active|pressed|focus|disabled|subtle|muted|light|dark|foreground|background|border|ring|\d{1,3})(?:$|[-_])/i
    const functionalColorVariable =
      /(?:^|[-_])(?:danger|destructive|error|invalid|warning|success|alert|notice)(?:$|[-_])/i
    for (const [name, value] of Object.entries(styles.cssVariables)) {
      if (!semanticColorVariable.test(name)) continue
      const resolved = resolveDeclaredColor(value)
      if (!resolved) continue
      styles.colors.push(resolved)
      countUsage('declaredColor', resolved)
      addValueSource('declaredColor', resolved, `css-variable:${name}`)
      if (brandColorVariable.test(name) && !brandVariantVariable.test(name) && !functionalColorVariable.test(name)) {
        countUsage('brandTokenColor', resolved)
        addValueSource('brandTokenColor', resolved, `css-variable:${name}`)
      }
    }
    colorProbe.remove()

    // 2. Walk the DOM and extract computed styles from visible elements
    const elements = [document.documentElement, document.body, ...document.querySelectorAll('body *')]
    const seen = new Set<string>()

    for (const el of elements) {
      const computed = getComputedStyle(el)

      // Skip hidden elements
      if (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0') continue
      const rect = el.getBoundingClientRect()
      if (el !== document.documentElement && el !== document.body && (rect.width <= 0 || rect.height <= 0)) continue

      // Colors
      const color = normalizeObservedColor(computed.color)
      const bgColor = normalizeObservedColor(computed.backgroundColor)
      const interactive = Boolean(
        el.closest(
          'a, button, input, select, textarea, [role="button"], [role="link"], [aria-current], [aria-selected="true"]',
        ),
      )
      const action = Boolean(el.closest('button, [role="button"], input[type="button"], input[type="submit"]'))
      const link = Boolean(el.closest('a, [role="link"]'))
      const selected = Boolean(el.closest('[aria-current], [aria-selected="true"], [data-state="active"]'))
      const actionElement = el.closest('button, [role="button"], input[type="button"], input[type="submit"]')
      const actionContext = actionElement
        ? [
            actionElement.className,
            actionElement.id,
            actionElement.getAttribute('data-variant'),
            actionElement.getAttribute('data-intent'),
            actionElement.getAttribute('aria-label'),
            actionElement.getAttribute('type'),
            (actionElement.textContent || '').slice(0, 80),
          ]
            .join(' ')
            .toLowerCase()
        : ''
      const statusAction =
        action &&
        /(?:^|\W)(?:danger|destructive|delete|error|invalid|warning|success|alert)(?:\W|$)|删除|危险|错误|警告/.test(
          actionContext,
        )
      const primaryAction =
        action &&
        !statusAction &&
        /(?:^|\W)(?:primary|cta|submit|confirm|purchase|checkout|continue)(?:\W|$)|确认|提交|继续|购买/.test(
          actionContext,
        )

      if (color) {
        styles.textColors.push(color)
        styles.colors.push(color)
        countUsage('textColor', color)
        addValueSource('textColor', color, 'computed:text')
        if (interactive && !statusAction) {
          countUsage('accentColor', color)
          addValueSource('accentColor', color, 'element:interactive')
        }
        if (action && !statusAction) {
          countUsage('actionColor', color)
          addValueSource('actionColor', color, 'element:action')
        }
        if (primaryAction) {
          countUsage('primaryActionColor', color)
          addValueSource('primaryActionColor', color, 'element:primary-action')
        }
        if (statusAction) {
          countUsage('statusColor', color)
          addValueSource('statusColor', color, 'element:status')
        }
        if (link) {
          countUsage('linkColor', color)
          addValueSource('linkColor', color, 'element:link')
        }
        if (selected) {
          countUsage('selectedColor', color)
          addValueSource('selectedColor', color, 'element:selected')
        }
      }
      if (bgColor) {
        styles.backgroundColors.push(bgColor)
        styles.colors.push(bgColor)
        countUsage('bgColor', bgColor)
        addValueSource('bgColor', bgColor, 'computed:background')
        if (interactive && !statusAction) {
          countUsage('accentColor', bgColor)
          addValueSource('accentColor', bgColor, 'element:interactive')
        }
        if (action && !statusAction) {
          countUsage('actionColor', bgColor)
          addValueSource('actionColor', bgColor, 'element:action')
        }
        if (primaryAction) {
          countUsage('primaryActionColor', bgColor)
          addValueSource('primaryActionColor', bgColor, 'element:primary-action')
        }
        if (statusAction) {
          countUsage('statusColor', bgColor)
          addValueSource('statusColor', bgColor, 'element:status')
        }
        if (selected) {
          countUsage('selectedColor', bgColor)
          addValueSource('selectedColor', bgColor, 'element:selected')
        }

        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0))
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
        const viewportArea = Math.max(1, window.innerWidth * window.innerHeight)
        const visibleAreaShare = (visibleWidth * visibleHeight) / viewportArea
        if (visibleAreaShare > 0) countUsage('bgArea', bgColor, visibleAreaShare)
      }

      // Only count borders that are actually painted. Sampling borderTopColor alone also records zero-width defaults
      // and misses bottom/side dividers, which can make a control or focus color look like the site's structural border.
      const borderSides = [
        [computed.borderTopWidth, computed.borderTopStyle, normalizeObservedColor(computed.borderTopColor), rect.width],
        [
          computed.borderRightWidth,
          computed.borderRightStyle,
          normalizeObservedColor(computed.borderRightColor),
          rect.height,
        ],
        [
          computed.borderBottomWidth,
          computed.borderBottomStyle,
          normalizeObservedColor(computed.borderBottomColor),
          rect.width,
        ],
        [
          computed.borderLeftWidth,
          computed.borderLeftStyle,
          normalizeObservedColor(computed.borderLeftColor),
          rect.height,
        ],
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
          !borderColor
        ) {
          continue
        }

        if (!observedBorderColors.has(borderColor)) {
          observedBorderColors.add(borderColor)
          styles.colors.push(borderColor)
          countUsage('borderColor', borderColor)
          addValueSource('borderColor', borderColor, 'computed:border')
          if (!interactive) {
            countUsage('structuralBorderColor', borderColor)
            addValueSource('structuralBorderColor', borderColor, 'element:structure')
          }
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
      if (fontFamily) {
        let directTextLength = 0
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) directTextLength += (node.textContent || '').trim().length
        }
        if (directTextLength > 0) {
          countUsage('fontTextFamily', fontFamily, directTextLength)
          addValueSource('fontTextFamily', fontFamily, 'rendered:text')
        }
      }

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

const OBSERVED_INTERACTION_PROPERTIES = [
  'background-color',
  'border-bottom-color',
  'border-left-color',
  'border-right-color',
  'border-top-color',
  'box-shadow',
  'color',
  'fill',
  'filter',
  'opacity',
  'outline-color',
  'outline-offset',
  'outline-style',
  'outline-width',
  'stroke',
  'text-decoration-color',
  'text-decoration-line',
  'transform',
] as const

async function readInteractionState(locator: Locator): Promise<Record<string, string> | null> {
  return locator
    .evaluate((element, properties) => {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) return null
      const computed = getComputedStyle(element)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      const normalizeColor = (value: string): string => {
        if (!context || !value || value === 'none' || value === 'transparent') return value
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = '#010203'
        context.fillStyle = value
        const firstParse = context.fillStyle
        context.fillStyle = '#040506'
        context.fillStyle = value
        const secondParse = context.fillStyle
        if (firstParse !== secondParse) return value
        context.fillStyle = firstParse
        context.fillRect(0, 0, 1, 1)
        const [red, green, blue, alphaByte] = context.getImageData(0, 0, 1, 1).data
        const alpha = Number((alphaByte / 255).toFixed(3))
        return alpha >= 0.999 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha})`
      }
      return Object.fromEntries(
        properties.map((property) => {
          const value = computed.getPropertyValue(property)
          return [property, /color|^(?:fill|stroke)$/.test(property) ? normalizeColor(value) : value]
        }),
      )
    }, OBSERVED_INTERACTION_PROPERTIES)
    .catch(() => null)
}

function changedInteractionState(
  before: Record<string, string> | null,
  after: Record<string, string> | null,
): Record<string, string> | null {
  if (!before || !after) return null
  const changed = Object.fromEntries(Object.entries(after).filter(([property, value]) => value !== before[property]))
  return Object.keys(changed).length > 0 ? changed : null
}

/** Observe browser-computed states so cross-origin stylesheets, CSS-in-JS, and
 * variable-driven states are represented even when their source rules are unreadable. */
export async function extractObservedInteractionStyles(page: Page, limit = 16): Promise<InteractionStyles> {
  const interactions: InteractionStyles = { hover: [], focus: [], active: [], disabled: [] }
  const initialScroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })).catch(() => null)
  const selector = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="switch"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
  const candidates = page.locator(selector)
  const indexes = await candidates
    .evaluateAll(
      (elements, maximum) =>
        elements
          .map((element, index) => {
            const style = getComputedStyle(element)
            const rect = element.getBoundingClientRect()
            const disabled =
              element instanceof HTMLButtonElement ||
              element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement
                ? element.disabled
                : element.getAttribute('aria-disabled') === 'true'
            const visible =
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0'
            const priority =
              (element.tagName === 'BUTTON' ? 4 : 0) +
              (element.getAttribute('role') === 'button' ? 3 : 0) +
              (rect.top >= 0 && rect.top < window.innerHeight ? 2 : 0) +
              (element.tagName === 'A' ? 1 : 0)
            return { index, visible, disabled, priority }
          })
          .filter((candidate) => candidate.visible)
          .sort((first, second) => second.priority - first.priority || first.index - second.index)
          .slice(0, maximum)
          .map((candidate) => candidate.index),
      Math.max(1, limit),
    )
    .catch(() => [] as number[])

  const transitionOverride = await page
    .addStyleTag({
      content: '*, *::before, *::after { transition-delay: 0s !important; transition-duration: 0s !important; }',
    })
    .catch(() => null)

  try {
    for (const index of indexes) {
      const locator = candidates.nth(index)
      const disabled = await locator
        .evaluate((element) =>
          element instanceof HTMLButtonElement ||
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
            ? element.disabled
            : element.getAttribute('aria-disabled') === 'true',
        )
        .catch(() => false)
      if (disabled) {
        const state = await readInteractionState(locator)
        if (state) interactions.disabled?.push(state)
        continue
      }

      const beforeHover = await readInteractionState(locator)
      const hovered = await locator
        .hover({ timeout: 1_000 })
        .then(() => true)
        .catch(() => false)
      if (hovered) {
        await page.waitForTimeout(20)
        const changed = changedInteractionState(beforeHover, await readInteractionState(locator))
        if (changed) interactions.hover.push(changed)
      }

      await page.mouse.move(0, 0).catch(() => {})
      await page.waitForTimeout(20)
      const beforeFocus = await readInteractionState(locator)
      const focused = await locator
        .focus({ timeout: 1_000 })
        .then(() => true)
        .catch(() => false)
      if (focused) {
        await page.waitForTimeout(20)
        const changed = changedInteractionState(beforeFocus, await readInteractionState(locator))
        if (changed) interactions.focus.push(changed)
        await locator.evaluate((element) => (element as HTMLElement).blur()).catch(() => {})
      }
    }
  } finally {
    if (transitionOverride) {
      await transitionOverride.evaluate((element) => element.parentNode?.removeChild(element)).catch(() => {})
      await transitionOverride.dispose()
    }
    await page.mouse.move(0, 0).catch(() => {})
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()).catch(() => {})
    if (initialScroll) await page.evaluate(({ x, y }) => window.scrollTo(x, y), initialScroll).catch(() => {})
  }

  return interactions
}

function mergeObservedInteractionStyles(target: InteractionStyles, source: InteractionStyles): void {
  for (const kind of ['hover', 'focus', 'active', 'disabled'] as const) {
    const targetEntries = target[kind] || []
    const seen = new Set(targetEntries.map((entry) => JSON.stringify(entry)))
    for (const entry of source[kind] || []) {
      const fingerprint = JSON.stringify(entry)
      if (seen.has(fingerprint)) continue
      targetEntries.push(entry)
      seen.add(fingerprint)
    }
    if (kind === 'disabled') target.disabled = targetEntries
  }
}

export async function extractInteractionStyles(page: Page): Promise<InteractionStyles> {
  const interactions = await page.evaluate(() => {
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
  mergeObservedInteractionStyles(interactions, await extractObservedInteractionStyles(page))
  return interactions
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

    const allClasses = new Set<string>()
    const sampleEls = document.querySelectorAll('body *')
    const sampleCount = Math.min(sampleEls.length, 500)
    for (let i = 0; i < sampleCount; i++) {
      const el = sampleEls[Math.floor((i * sampleEls.length) / sampleCount)]
      el.classList.forEach((c) => allClasses.add(c))
    }
    const classArr = [...allClasses]

    const rootEl = document.getElementById('root') || document.getElementById('app') || document.body
    // Legacy React roots expose _reactRootContainer / data-reactroot. React 18 createRoot leaves
    // __reactContainer$ / __reactFiber$ expandos on rendered descendants instead, and a single
    // expando is not enough evidence — require at least two independent signals.
    const hasLegacyReactRoot = Boolean(
      rootEl && ('_reactRootContainer' in rootEl || (rootEl as HTMLElement).querySelector('[data-reactroot]')),
    )
    const reactExpandoPattern = /^__react(?:Container|Fiber|Props)\b/
    let reactExpandoCount = 0
    if (!hasLegacyReactRoot) {
      const probeCount = Math.min(sampleEls.length, 200)
      for (let i = 0; i < probeCount; i++) {
        const el = sampleEls[Math.floor((i * sampleEls.length) / probeCount)]
        if (Object.keys(el).some((key) => reactExpandoPattern.test(key))) reactExpandoCount += 1
        if (reactExpandoCount >= 2) break
      }
    }
    if ((hasLegacyReactRoot || reactExpandoCount >= 2) && !frameworks.some((f) => f.includes('Next'))) {
      frameworks.push('React')
    }
    if (w.__VUE__ || document.querySelector('[data-v-]') || document.querySelector('[data-vue]')) {
      if (!frameworks.some((f) => f.includes('Nuxt'))) frameworks.push('Vue')
    }

    const classPatterns: Array<{ pattern: RegExp | ((classes: string[]) => boolean); name: string }> = [
      { pattern: (cs) => cs.some((c) => /^chakra-/.test(c)), name: 'Chakra UI' },
      { pattern: (cs) => cs.some((c) => /^ant-/.test(c)), name: 'Ant Design' },
      { pattern: (cs) => cs.some((c) => /^el-/.test(c)), name: 'Element Plus' },
      // Emotion and other CSS-in-JS runtimes also generate generic `css-*` classes. MUI emits stable Mui* slot
      // classes alongside them, so only those explicit classes are reliable library evidence.
      { pattern: (cs) => cs.some((c) => /^Mui[A-Z]/.test(c)), name: 'MUI' },
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

    // Only library-specific signatures justify naming a concrete styling library. Generic
    // `css-*` hashes prove generated class names, not styled-components, Emotion, or MUI.
    const styledComponentsCount = classArr.filter((c) => /^sc-/.test(c)).length
    const hasEmotionSignature =
      classArr.some((c) => /^(__emotion_|emotion-)/.test(c)) || Boolean(document.querySelector('[data-emotion]'))
    if (styledComponentsCount > 5) cssApproach.push('styled-components')
    if (hasEmotionSignature) cssApproach.push('Emotion')
    const generatedClassCount = classArr.filter((c) => /^css-[\da-z]{4,}$/i.test(c)).length
    if (styledComponentsCount <= 5 && !hasEmotionSignature && generatedClassCount > 5) {
      cssApproach.push('CSS-in-JS or generated class names observed')
    }

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
