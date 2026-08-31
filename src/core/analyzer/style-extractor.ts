import type { Locator, Page } from 'playwright-core'

import { mergeInteractionStylePatterns } from '../interaction-style.js'
import { ROLE_CANDIDATE_RULES } from './role-candidates.js'
import type { ExtractedStyles, InteractionStyles } from './types.js'

/**
 * Extract all computed styles from a page using page.evaluate().
 * This runs entirely in the browser context.
 */
export async function extractStyles(page: Page): Promise<ExtractedStyles> {
  return await page.evaluate((candidateRules) => {
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
      valueSourceCounts: {},
      colorRoleObservations: [],
      textColorPairObservations: [],
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
      const sourceCounts = styles.valueSourceCounts?.[key] || {}
      sourceCounts[source] = (sourceCounts[source] || 0) + 1
      if (styles.valueSourceCounts) styles.valueSourceCounts[key] = sourceCounts
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

    interface BrowserColor {
      red: number
      green: number
      blue: number
      alpha: number
    }
    const parseNormalizedColor = (value: string): BrowserColor | null => {
      const match = value.match(
        /^rgba?\(\s*(\d*\.?\d+)\s*(?:,\s*|\s+)(\d*\.?\d+)\s*(?:,\s*|\s+)(\d*\.?\d+)(?:\s*(?:,|\/)\s*(\d*\.?\d+))?\s*\)$/i,
      )
      if (!match) return null
      return {
        red: Number.parseFloat(match[1]),
        green: Number.parseFloat(match[2]),
        blue: Number.parseFloat(match[3]),
        alpha: match[4] === undefined ? 1 : Number.parseFloat(match[4]),
      }
    }
    const compositeColor = (foreground: BrowserColor, background: BrowserColor): BrowserColor => {
      const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha)
      if (alpha <= 0) return { red: 255, green: 255, blue: 255, alpha: 1 }
      return {
        red: (foreground.red * foreground.alpha + background.red * background.alpha * (1 - foreground.alpha)) / alpha,
        green:
          (foreground.green * foreground.alpha + background.green * background.alpha * (1 - foreground.alpha)) / alpha,
        blue:
          (foreground.blue * foreground.alpha + background.blue * background.alpha * (1 - foreground.alpha)) / alpha,
        alpha,
      }
    }
    const effectiveBackgroundFor = (element: Element): string | null => {
      const layers: BrowserColor[] = []
      let current: Element | null = element
      while (current) {
        const computed = getComputedStyle(current)
        if (computed.backgroundImage !== 'none' || computed.mixBlendMode !== 'normal' || computed.filter !== 'none') {
          return null
        }
        const normalized = normalizeObservedColor(computed.backgroundColor)
        const parsed = normalized ? parseNormalizedColor(normalized) : null
        if (parsed) {
          layers.push(parsed)
          if (parsed.alpha >= 0.999) break
        }
        current = current.parentElement
      }
      let composite: BrowserColor = { red: 255, green: 255, blue: 255, alpha: 1 }
      for (const layer of layers.reverse()) composite = compositeColor(layer, composite)
      return `rgb(${Math.round(composite.red)}, ${Math.round(composite.green)}, ${Math.round(composite.blue)})`
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
        if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue
        if (rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue
        // Container queries are evaluated per matching descendant. Rule-level CSSOM traversal cannot establish that
        // condition, so do not reinterpret their custom properties as unconditional root declarations.
        if (typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule) continue
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
    // The root element frequently contributes only user-agent defaults (`#000`, Times)
    // while the authored body supplies the actual page system. CSS custom properties are
    // still collected from `:root` above, so sample rendered styles from body downward.
    const elements = [document.body, ...document.querySelectorAll('body *')]
    const seen = new Set<string>()
    const actionTokenPattern = new RegExp(candidateRules.actionTokenPattern, 'i')
    const primaryActionPattern = new RegExp(candidateRules.primaryActionPattern, 'i')
    const destructiveActionPattern = new RegExp(candidateRules.destructiveActionPattern, 'i')
    const directStatusPattern = new RegExp(candidateRules.directStatusPattern, 'i')
    const statusSubjectPattern = new RegExp(candidateRules.statusSubjectPattern, 'i')
    const statusDirectionPattern = new RegExp(candidateRules.statusDirectionPattern, 'i')
    const positiveStatusPattern = new RegExp(candidateRules.positiveStatusPattern, 'i')
    const warningStatusPattern = new RegExp(candidateRules.warningStatusPattern, 'i')
    const negativeStatusPattern = new RegExp(candidateRules.negativeStatusPattern, 'i')
    const elementContext = (element: Element): string =>
      [
        typeof element.className === 'string' ? element.className : '',
        element.id,
        element.getAttribute('role'),
        element.getAttribute('data-variant'),
        element.getAttribute('data-intent'),
        element.getAttribute('data-state'),
        element.getAttribute('data-status'),
        element.getAttribute('type'),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    const locatorFor = (element: Element): string => {
      if (element === document.body) return 'body'
      const parts: string[] = []
      let current: Element | null = element
      while (current && current !== document.body) {
        const parent: Element | null = current.parentElement
        if (!parent) break
        const tag = current.tagName.toLowerCase()
        const sameTagSiblings = [...parent.children].filter((sibling) => sibling.tagName === current?.tagName)
        parts.unshift(`${tag}:nth-of-type(${Math.max(1, sameTagSiblings.indexOf(current) + 1)})`)
        current = parent
      }
      return parts.length > 0 ? `body > ${parts.join(' > ')}` : element.tagName.toLowerCase()
    }
    const statusIntentFor = (context: string): 'positive' | 'warning' | 'negative' | 'neutral' => {
      if (positiveStatusPattern.test(context)) return 'positive'
      if (warningStatusPattern.test(context)) return 'warning'
      if (negativeStatusPattern.test(context)) return 'negative'
      return 'neutral'
    }
    const statusCandidateKind = (element: Element): 'native' | 'heuristic' | null => {
      const statusContext = elementContext(element)
      const role = element.getAttribute('role') || ''
      const ariaLive = element.getAttribute('aria-live')
      if (element.matches(candidateRules.broadActionSelector)) return null
      const nativeStatus = ['status', 'alert'].includes(role) || Boolean(ariaLive && ariaLive !== 'off')
      if (nativeStatus) {
        if (element.parentElement?.closest(candidateRules.nativeStatusSelector)) return null
        return 'native'
      }
      if (
        element.parentElement?.closest(`${candidateRules.broadActionSelector}, ${candidateRules.nativeStatusSelector}`)
      ) {
        return null
      }
      const boundedTrend = statusSubjectPattern.test(statusContext) && statusDirectionPattern.test(statusContext)
      return directStatusPattern.test(statusContext) || boundedTrend ? 'heuristic' : null
    }
    const statusCandidateKinds = new Map<Element, 'native' | 'heuristic'>()
    for (const element of elements) {
      const kind = statusCandidateKind(element)
      if (kind) statusCandidateKinds.set(element, kind)
    }
    const statusCandidates = new Set(statusCandidateKinds.keys())
    const candidatesWithNativeDescendants = new Set<Element>()
    for (const [element, kind] of statusCandidateKinds) {
      let ancestor = element.parentElement
      while (ancestor) {
        if (statusCandidates.has(ancestor)) {
          if (kind === 'native') candidatesWithNativeDescendants.add(ancestor)
        }
        ancestor = ancestor.parentElement
      }
    }
    const hasStrongStatusVisualBoundary = (element: Element): boolean => {
      const computed = getComputedStyle(element)
      const paintedFill = Boolean(normalizeObservedColor(computed.backgroundColor))
      const paintedBorder = [
        [computed.borderTopWidth, computed.borderTopStyle],
        [computed.borderRightWidth, computed.borderRightStyle],
        [computed.borderBottomWidth, computed.borderBottomStyle],
        [computed.borderLeftWidth, computed.borderLeftStyle],
      ].some(([width, style]) => Number.parseFloat(width) > 0 && !['none', 'hidden'].includes(style))
      return paintedFill || paintedBorder
    }
    const hasStatusEvidenceGeometry = (element: Element): boolean => {
      const rect = element.getBoundingClientRect()
      const computed = getComputedStyle(element)
      return (
        rect.width >= 4 &&
        rect.height >= 4 &&
        (computed.clip === 'auto' || computed.clip === '') &&
        (computed.clipPath === 'none' || computed.clipPath === '')
      )
    }
    const stronglyBoundedCandidates = new Set([...statusCandidates].filter(hasStrongStatusVisualBoundary))
    const independentStrongDescendantCounts = new Map<Element, number>()
    for (const element of stronglyBoundedCandidates) {
      let ancestor = element.parentElement
      while (ancestor) {
        if (statusCandidates.has(ancestor)) {
          independentStrongDescendantCounts.set(ancestor, (independentStrongDescendantCounts.get(ancestor) || 0) + 1)
          if (stronglyBoundedCandidates.has(ancestor)) break
        }
        ancestor = ancestor.parentElement
      }
    }
    const preferredStatusCandidates = new Set(
      [...statusCandidates].filter((element) => {
        if (!hasStatusEvidenceGeometry(element)) return false
        if (statusCandidateKinds.get(element) === 'native') return true
        if (candidatesWithNativeDescendants.has(element)) return false
        return stronglyBoundedCandidates.has(element) || (independentStrongDescendantCounts.get(element) || 0) < 2
      }),
    )
    const statusRoots = new Set(
      [...preferredStatusCandidates].filter((element) => {
        let ancestor = element.parentElement
        while (ancestor) {
          if (preferredStatusCandidates.has(ancestor)) return false
          ancestor = ancestor.parentElement
        }
        return true
      }),
    )
    const roleCandidateFor = (element: Element, computed: CSSStyleDeclaration, rect: DOMRect) => {
      if (statusCandidates.has(element)) {
        if (!statusRoots.has(element)) return null
        const statusContext = elementContext(element)
        const delta = statusSubjectPattern.test(statusContext) && statusDirectionPattern.test(statusContext)
        return {
          elementKind: 'status' as const,
          role: 'status' as const,
          statusKind: delta ? ('delta' as const) : ('status' as const),
          statusIntent: statusIntentFor(statusContext),
        }
      }
      const ancestorCandidate = element.parentElement?.closest(
        `${candidateRules.broadActionSelector}, ${candidateRules.nativeStatusSelector}`,
      )
      if (ancestorCandidate) return null
      const actionContext = elementContext(element)
      const role = element.getAttribute('role') || ''
      const tagName = element.tagName.toLowerCase()
      const nativeButton = tagName === 'button'
      const inputButton = tagName === 'input' && ['button', 'submit'].includes(element.getAttribute('type') || '')
      const roleButton = role === 'button'
      const anchor = tagName === 'a' && element.hasAttribute('href')

      if (!nativeButton && !inputButton && !roleButton && !anchor) return null
      if (anchor) {
        const paintedFill = Boolean(normalizeObservedColor(computed.backgroundColor))
        const paintedBorder = [
          [computed.borderTopWidth, computed.borderTopStyle],
          [computed.borderRightWidth, computed.borderRightStyle],
          [computed.borderBottomWidth, computed.borderBottomStyle],
          [computed.borderLeftWidth, computed.borderLeftStyle],
        ].some(([width, style]) => Number.parseFloat(width) > 0 && !['none', 'hidden'].includes(style))
        const controlGeometry =
          rect.width >= 44 &&
          rect.height >= 28 &&
          (Number.parseFloat(computed.paddingLeft) + Number.parseFloat(computed.paddingRight) >= 16 ||
            Number.parseFloat(computed.paddingTop) + Number.parseFloat(computed.paddingBottom) >= 12)
        if (!(actionTokenPattern.test(actionContext) && (paintedFill || paintedBorder || controlGeometry))) return null
      }
      const roleCandidate = primaryActionPattern.test(actionContext)
        ? ('primary-action' as const)
        : destructiveActionPattern.test(actionContext)
          ? ('destructive-action' as const)
          : ('action' as const)
      return {
        elementKind: anchor
          ? ('anchor' as const)
          : inputButton
            ? ('input' as const)
            : roleButton && !nativeButton
              ? ('role-button' as const)
              : ('button' as const),
        role: roleCandidate,
      }
    }

    const textColorPairFrequency = new Map<
      string,
      { background: string; foreground: string; textRole: 'body' | 'heading' | 'label' | 'other'; count: number }
    >()

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
      const structuralRoot = el.matches(
        'body, main, section, article, header, footer, nav, aside, [role="main"], [role="region"], [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]',
      )
      const headingOwner = el.matches('h1, h2, h3, h4, h5, h6, [role="heading"]')
        ? el
        : el.closest('h1, h2, h3, h4, h5, h6, [role="heading"]')
      const semanticTextRole =
        (el.textContent || '').trim().length === 0 || !headingOwner
          ? null
          : headingOwner.matches('h1, [role="heading"][aria-level="1"]')
            ? 'display'
            : 'heading'
      const roleCandidate = roleCandidateFor(el, computed, rect)
      const linkRoot = el.matches('a, [role="link"]')
      const selectedRoot = el.matches('[aria-current], [aria-selected="true"], [data-state="active"]')

      const hasDirectText = [...el.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.replace(/\s+/g, ' ').trim()),
      )
      const textPairEligible =
        hasDirectText &&
        rect.width >= 2 &&
        rect.height >= 2 &&
        Number.parseFloat(computed.fontSize || '0') >= 8 &&
        (computed.clip === 'auto' || computed.clip === '') &&
        (computed.clipPath === 'none' || computed.clipPath === '') &&
        !el.closest('[hidden], [aria-hidden="true"], [inert]')
      if (color && textPairEligible) {
        const background = effectiveBackgroundFor(el)
        if (background) {
          const textRole = semanticTextRole
            ? ('heading' as const)
            : interactive || el.closest('a, button, label, [role="button"], [role="link"]')
              ? ('label' as const)
              : el.matches('p, li, dd, dt, blockquote, figcaption, td, th')
                ? ('body' as const)
                : ('other' as const)
          const key = `${background}|${color}|${textRole}`
          const existing = textColorPairFrequency.get(key)
          textColorPairFrequency.set(key, {
            background,
            foreground: color,
            textRole,
            count: (existing?.count || 0) + 1,
          })
        }
      }

      if (color) {
        styles.textColors.push(color)
        styles.colors.push(color)
        countUsage('textColor', color)
        addValueSource('textColor', color, 'computed:text')
        if (linkRoot && !roleCandidate) {
          countUsage('accentColor', color)
          addValueSource('accentColor', color, 'element:link')
        }
        if (linkRoot) {
          countUsage('linkColor', color)
          addValueSource('linkColor', color, 'element:link')
        }
        if (selectedRoot && roleCandidate?.role !== 'status') {
          countUsage('selectedColor', color)
          addValueSource('selectedColor', color, 'element:selected')
        }
      }
      if (bgColor) {
        styles.backgroundColors.push(bgColor)
        styles.colors.push(bgColor)
        countUsage('bgColor', bgColor)
        addValueSource('bgColor', bgColor, 'computed:background')
        if (selectedRoot && roleCandidate?.role !== 'status') {
          countUsage('selectedColor', bgColor)
          addValueSource('selectedColor', bgColor, 'element:selected')
        }

        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0))
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
        const viewportArea = Math.max(1, window.innerWidth * window.innerHeight)
        const visibleAreaShare = (visibleWidth * visibleHeight) / viewportArea
        const effectiveBackground = visibleAreaShare > 0 ? effectiveBackgroundFor(el) : null
        if (effectiveBackground) countUsage('bgArea', effectiveBackground, visibleAreaShare)
      }

      if (roleCandidate) {
        const categoryPrefix =
          roleCandidate.role === 'status'
            ? `${roleCandidate.statusKind || 'status'}${
                roleCandidate.statusIntent
                  ? `${roleCandidate.statusIntent[0].toUpperCase()}${roleCandidate.statusIntent.slice(1)}`
                  : ''
              }`
            : roleCandidate.role === 'primary-action'
              ? 'primaryAction'
              : roleCandidate.role === 'destructive-action'
                ? 'destructiveAction'
                : 'action'
        if (color) {
          countUsage(`${categoryPrefix}ForegroundColor`, color)
          addValueSource(`${categoryPrefix}ForegroundColor`, color, `element:${roleCandidate.role}`)
          if (roleCandidate.role === 'status') countUsage('statusForegroundColor', color)
        }
        if (bgColor) {
          countUsage(`${categoryPrefix}BackgroundColor`, bgColor)
          addValueSource(`${categoryPrefix}BackgroundColor`, bgColor, `element:${roleCandidate.role}`)
          if (roleCandidate.role === 'status') countUsage('statusBackgroundColor', bgColor)
          if (roleCandidate.role === 'action' || roleCandidate.role === 'primary-action') {
            countUsage('accentColor', bgColor)
            addValueSource('accentColor', bgColor, `element:${roleCandidate.role}`)
          }
        }
        const borderColor = [
          [computed.borderTopWidth, computed.borderTopStyle, computed.borderTopColor],
          [computed.borderRightWidth, computed.borderRightStyle, computed.borderRightColor],
          [computed.borderBottomWidth, computed.borderBottomStyle, computed.borderBottomColor],
          [computed.borderLeftWidth, computed.borderLeftStyle, computed.borderLeftColor],
        ]
          .flatMap(([width, style, value]) =>
            Number.parseFloat(width) > 0 && !['none', 'hidden'].includes(style) ? [normalizeObservedColor(value)] : [],
          )
          .find((value): value is string => Boolean(value))
        styles.colorRoleObservations?.push({
          captureId: `${location.href}|${window.innerWidth}x${window.innerHeight}`,
          elementRef: locatorFor(el),
          elementKind: roleCandidate.elementKind,
          role: roleCandidate.role,
          ...(roleCandidate.statusKind ? { statusKind: roleCandidate.statusKind } : {}),
          ...(roleCandidate.statusIntent ? { statusIntent: roleCandidate.statusIntent } : {}),
          ...(color ? { foreground: color } : {}),
          ...(bgColor ? { background: bgColor } : {}),
          ...(borderColor ? { borderColor } : {}),
        })
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
      if (fontSize && hasDirectText) {
        styles.fontSizes.push(fontSize)
        countUsage('fontSize', fontSize)
        if (semanticTextRole) countUsage(`${semanticTextRole}FontSize`, fontSize)
      }

      // Font weights
      const fontWeight = computed.fontWeight
      if (fontWeight && hasDirectText) {
        styles.fontWeights.push(fontWeight)
        countUsage('fontWeight', fontWeight)
        if (semanticTextRole) countUsage(`${semanticTextRole}FontWeight`, fontWeight)
      }

      // Line heights
      const lineHeight = computed.lineHeight
      if (hasDirectText && lineHeight && lineHeight !== 'normal') {
        styles.lineHeights.push(lineHeight)
        countUsage('lineHeight', lineHeight)
        if (fontSize) countUsage('typeMetric', `${fontSize}|${lineHeight}`)
      }

      // Letter spacing
      const letterSpacing = computed.letterSpacing
      if (hasDirectText && letterSpacing && letterSpacing !== 'normal' && letterSpacing !== '0px') {
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

      // Spacing (margin and padding). `gap` is a shorthand alias of row/column gap in computed styles, so count each
      // distinct axis value once per element instead of counting the same authored decision up to three times.
      const spacingSource = interactive
        ? 'element:control-spacing'
        : el.closest('pre, code, kbd, samp, math, [role="code"]')
          ? 'element:specialized-spacing'
          : structuralRoot
            ? 'element:structural-spacing'
            : 'element:content-spacing'
      const recordSpacing = (value: string) => {
        if (!value || value === '0px' || value === 'auto' || value === 'normal') return
        styles.spacings.push(value)
        countUsage('spacing', value)
        addValueSource('spacing', value, spacingSource)
      }
      for (const prop of [
        'marginTop',
        'marginBottom',
        'marginLeft',
        'marginRight',
        'paddingTop',
        'paddingBottom',
        'paddingLeft',
        'paddingRight',
      ] as const) {
        recordSpacing(computed[prop as keyof CSSStyleDeclaration] as string)
      }
      for (const gap of new Set([computed.rowGap, computed.columnGap])) recordSpacing(gap)

      // Border radius
      const radiusCorners = [
        computed.borderTopLeftRadius,
        computed.borderTopRightRadius,
        computed.borderBottomRightRadius,
        computed.borderBottomLeftRadius,
      ].map((value) => value.replace(/\s+/g, ' ').trim())
      const radius =
        radiusCorners.every((value) => value === radiusCorners[0]) &&
        /^(?:0|[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em))$/i.test(radiusCorners[0])
          ? radiusCorners[0]
          : null
      if (radius && !/^(?:0|0px|0rem|0em)$/i.test(radius)) {
        styles.radii.push(radius)
        countUsage('radius', radius)
        const radiusPixels = Number.parseFloat(radius)
        const minimumDimension = Math.min(rect.width, rect.height)
        const geometryDependent =
          Number.isFinite(radiusPixels) && minimumDimension > 0 && radiusPixels >= minimumDimension * 0.45
        addValueSource('radius', radius, geometryDependent ? 'geometry:circle-or-pill' : 'computed:ordinary-radius')
      }

      // Box shadow
      const shadow = computed.boxShadow
      if (shadow && shadow !== 'none') {
        styles.shadows.push(shadow)
        countUsage('shadow', shadow)
      }
    }

    const captureId = `${location.href}|${window.innerWidth}x${window.innerHeight}`
    styles.textColorPairObservations = [...textColorPairFrequency.values()]
      .sort((first, second) => second.count - first.count)
      .slice(0, 80)
      .map((observation) => ({ captureId, ...observation }))

    return styles
  }, ROLE_CANDIDATE_RULES)
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
): { before: Record<string, string>; after: Record<string, string>; changedProperties: string[] } | null {
  if (!before || !after) return null
  const changedProperties = Object.keys(after).filter((property) => after[property] !== before[property])
  if (changedProperties.length === 0) return null
  const retainedProperties = new Set(changedProperties)
  if (changedProperties.some((property) => property.startsWith('outline-') || property === 'box-shadow')) {
    for (const property of ['outline-color', 'outline-style', 'outline-width']) retainedProperties.add(property)
    retainedProperties.add('box-shadow')
  }
  return {
    before: Object.fromEntries([...retainedProperties].map((property) => [property, before[property]])),
    after: Object.fromEntries([...retainedProperties].map((property) => [property, after[property]])),
    changedProperties,
  }
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
        if (state) interactions.disabled?.push({ before: state, after: state, source: 'computed-probed' })
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
        if (changed) interactions.hover.push({ ...changed, source: 'computed-probed' })
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
        if (changed) interactions.focus.push({ ...changed, source: 'computed-probed' })
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

    const splitSelectorList = (selectorText: string): string[] => {
      const selectors: string[] = []
      let start = 0
      let bracketDepth = 0
      let parenthesisDepth = 0
      let quote = ''
      let escaped = false
      for (let index = 0; index < selectorText.length; index++) {
        const character = selectorText[index]
        if (escaped) {
          escaped = false
          continue
        }
        if (character === '\\') {
          escaped = true
          continue
        }
        if (quote) {
          if (character === quote) quote = ''
          continue
        }
        if (character === '"' || character === "'") {
          quote = character
          continue
        }
        if (character === '[') bracketDepth++
        else if (character === ']') bracketDepth = Math.max(0, bracketDepth - 1)
        else if (character === '(') parenthesisDepth++
        else if (character === ')') parenthesisDepth = Math.max(0, parenthesisDepth - 1)
        else if (character === ',' && bracketDepth === 0 && parenthesisDepth === 0) {
          selectors.push(selectorText.slice(start, index).trim())
          start = index + 1
        }
      }
      selectors.push(selectorText.slice(start).trim())
      return selectors.filter(Boolean)
    }

    const dynamicStatePattern = /:(?:hover|active|focus(?:-visible|-within)?)(?![\w-])/gi
    const pseudoElementPattern =
      /::(?:after|before|backdrop|cue|file-selector-button|first-letter|first-line|marker|placeholder|selection)(?![\w-])/gi
    const selectorAppliesWithoutState = (selector: string): boolean => {
      const unstatedSelector = selector.replace(dynamicStatePattern, '').replace(pseudoElementPattern, '')
      if (!unstatedSelector.trim()) return false
      try {
        return document.querySelector(unstatedSelector) !== null
      } catch {
        return false
      }
    }

    const selectorsForState = (selectorText: string, state: 'hover' | 'focus' | 'active'): string[] => {
      const statePattern =
        state === 'focus' ? /:focus(?:-visible|-within)?(?![\w-])/i : new RegExp(`:${state}(?![\\w-])`, 'i')
      return splitSelectorList(selectorText).filter(
        (selector) => statePattern.test(selector) && selectorAppliesWithoutState(selector),
      )
    }

    const visitRules = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          const selector = rule.selectorText
          const targets = (['hover', 'focus', 'active'] as const)
            .map((state) => ({ state, selectors: selectorsForState(selector, state) }))
            .filter(({ selectors }) => selectors.length > 0)
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
            targets.forEach(({ state, selectors }) =>
              interactions[state].push({
                before: {},
                after: props,
                source: 'declared-applicable',
                selector: selectors.join(', '),
              }),
            )
          }
          continue
        }

        if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue
        if (rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue
        // A container query is evaluated against the query container of each
        // matching element. CSSOM does not expose a reliable rule-level match,
        // so treating every nested selector as applicable would be an overclaim.
        if (typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule) continue
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
  mergeInteractionStylePatterns(interactions, await extractObservedInteractionStyles(page))
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
    const hasTailwindAsset = Boolean(
      document.querySelector(
        'script[src*="tailwind" i], link[href*="tailwind" i], style[id*="tailwind" i], [data-tailwind]',
      ),
    )
    const hasTailwindVariantClasses =
      classArr.filter((c) => /(?:^|:)(?:sm|md|lg|xl|2xl|hover|focus):/.test(c)).length >= 3
    let hasTailwindVariables = false
    for (const element of [document.documentElement, document.body, ...[...sampleEls].slice(0, 40)]) {
      const styles = getComputedStyle(element)
      for (let index = 0; index < styles.length; index += 1) {
        if (styles[index].startsWith('--tw-')) {
          hasTailwindVariables = true
          break
        }
      }
      if (hasTailwindVariables) break
    }
    if (utilityCount > 20 && (hasTailwindAsset || hasTailwindVariantClasses || hasTailwindVariables)) {
      cssApproach.push('Tailwind CSS')
    }

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

    const iconLinks = document.querySelectorAll('link[href*="font-awesome"], link[href*="fontawesome"]')
    if (iconLinks.length > 0) icons = 'Font Awesome'
    const materialIcons = document.querySelectorAll('link[href*="material-icons"], .material-icons, .material-symbols')
    if (materialIcons.length > 0) icons = icons ? `${icons}, Material Icons` : 'Material Icons'
    const lucideUse = classArr.some((c) => /^lucide-/.test(c))
    if (lucideUse) icons = icons ? `${icons}, Lucide` : 'Lucide'

    return { frameworks, uiLibraries, cssApproach, bundler, icons }
  })
}
