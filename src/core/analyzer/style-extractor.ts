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
      usageOwnerCounts: {},
      usageOwnerIds: {},
      valueSources: {},
      valueSourceCounts: {},
      valueSourceOwnerIds: {},
      colorRoleObservations: [],
      semanticSurfaceObservations: [],
      semanticSurfaceLimitations: [],
      textColorPairObservations: [],
      renderedTextStyleObservations: [],
    }

    let currentOwner: string | null = null
    const computedStyleCache = new WeakMap<Element, CSSStyleDeclaration>()
    const computedFor = (element: Element): CSSStyleDeclaration => {
      const cached = computedStyleCache.get(element)
      if (cached) return cached
      const computed = getComputedStyle(element)
      computedStyleCache.set(element, computed)
      return computed
    }
    const usageOwners = new Map<string, Set<string>>()
    const valueSourceOwners = new Map<string, Set<string>>()
    const countUsage = (category: string, value: string, amount = 1) => {
      const key = `${category}:${value}`
      styles.usageCount[key] = (styles.usageCount[key] || 0) + amount
      if (currentOwner) {
        const owners = usageOwners.get(key) || new Set<string>()
        owners.add(currentOwner)
        usageOwners.set(key, owners)
      }
    }
    const addValueSource = (category: string, value: string, source: string) => {
      const key = `${category}:${value}`
      const sources = styles.valueSources?.[key] || []
      if (!sources.includes(source)) sources.push(source)
      if (styles.valueSources) styles.valueSources[key] = sources
      const sourceCounts = styles.valueSourceCounts?.[key] || {}
      if (currentOwner) {
        const ownerKey = `${key}\u0000${source}`
        const owners = valueSourceOwners.get(ownerKey) || new Set<string>()
        owners.add(currentOwner)
        valueSourceOwners.set(ownerKey, owners)
        sourceCounts[source] = owners.size
      } else {
        sourceCounts[source] = (sourceCounts[source] || 0) + 1
      }
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
    const browserCanvasProbe = document.createElement('div')
    browserCanvasProbe.style.setProperty('position', 'fixed', 'important')
    browserCanvasProbe.style.setProperty('inset', '0', 'important')
    browserCanvasProbe.style.setProperty('pointer-events', 'none', 'important')
    browserCanvasProbe.style.setProperty('visibility', 'hidden', 'important')
    browserCanvasProbe.style.setProperty('background-color', 'Canvas', 'important')
    document.documentElement.append(browserCanvasProbe)
    const browserCanvasColor =
      normalizeObservedColor(getComputedStyle(browserCanvasProbe).backgroundColor) || 'rgb(255, 255, 255)'
    browserCanvasProbe.remove()
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
      let composite: BrowserColor = parseNormalizedColor(browserCanvasColor) || {
        red: 255,
        green: 255,
        blue: 255,
        alpha: 1,
      }
      for (const layer of layers.reverse()) composite = compositeColor(layer, composite)
      return `rgb(${Math.round(composite.red)}, ${Math.round(composite.green)}, ${Math.round(composite.blue)})`
    }

    const clipPathMetrics = (
      value: string,
      width: number,
      height: number,
    ): { left: number; top: number; right: number; bottom: number; fillRatio: number } | undefined => {
      const normalized = value.trim().toLowerCase()
      if (!normalized || normalized === 'none') return { left: 0, top: 0, right: width, bottom: height, fillRatio: 1 }
      const length = (token: string, axis: number): number | undefined => {
        if (token.endsWith('%')) return (Number.parseFloat(token) / 100) * axis
        if (token.endsWith('px') || /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) return Number.parseFloat(token)
        return undefined
      }
      const boundedMetrics = (left: number, top: number, right: number, bottom: number, fillRatio: number) => ({
        left: Math.max(0, Math.min(width, left)),
        top: Math.max(0, Math.min(height, top)),
        right: Math.max(0, Math.min(width, right)),
        bottom: Math.max(0, Math.min(height, bottom)),
        fillRatio: Math.max(0, Math.min(1, fillRatio)),
      })
      const inset = /^inset\(([^)]*)\)/.exec(normalized)
      if (inset) {
        // The persisted evidence schema stores only a rectangular clip. Rounded inset corners can hide glyphs
        // inside that rectangle, so accepting them would overstate the visible painted area.
        if (/\bround\b/.test(inset[1])) return undefined
        const values = inset[1].trim().split(/\s+/).filter(Boolean)
        if (values.length === 0 || values.length > 4) return undefined
        const expanded =
          values.length === 1
            ? [values[0], values[0], values[0], values[0]]
            : values.length === 2
              ? [values[0], values[1], values[0], values[1]]
              : values.length === 3
                ? [values[0], values[1], values[2], values[1]]
                : values
        const top = length(expanded[0], height)
        const right = length(expanded[1], width)
        const bottom = length(expanded[2], height)
        const left = length(expanded[3], width)
        if ([top, right, bottom, left].some((item) => item === undefined || !Number.isFinite(item))) return undefined
        return boundedMetrics(left!, top!, width - right!, height - bottom!, 1)
      }
      const circle = /^circle\(([^)]*)\)$/.exec(normalized)
      if (circle) {
        const [radiusValue, positionValue] = circle[1].split(/\s+at\s+/)
        const position = (positionValue || '50% 50%').trim().split(/\s+/)
        if (position.length !== 2) return undefined
        const centerX = length(position[0], width)
        const centerY = length(position[1], height)
        const radius = radiusValue.trim().endsWith('%')
          ? length(radiusValue.trim(), Math.hypot(width, height) / Math.SQRT2)
          : length(radiusValue.trim(), Math.min(width, height))
        if (![centerX, centerY, radius].every((item) => item !== undefined && Number.isFinite(item))) return undefined
        return boundedMetrics(
          centerX! - radius!,
          centerY! - radius!,
          centerX! + radius!,
          centerY! + radius!,
          Math.PI / 4,
        )
      }
      const ellipse = /^ellipse\(([^)]*)\)$/.exec(normalized)
      if (ellipse) {
        const [radiiValue, positionValue] = ellipse[1].split(/\s+at\s+/)
        const radii = radiiValue.trim().split(/\s+/)
        const position = (positionValue || '50% 50%').trim().split(/\s+/)
        if (radii.length !== 2 || position.length !== 2) return undefined
        const radiusX = length(radii[0], width)
        const radiusY = length(radii[1], height)
        const centerX = length(position[0], width)
        const centerY = length(position[1], height)
        if (![radiusX, radiusY, centerX, centerY].every((item) => item !== undefined && Number.isFinite(item))) {
          return undefined
        }
        return boundedMetrics(
          centerX! - radiusX!,
          centerY! - radiusY!,
          centerX! + radiusX!,
          centerY! + radiusY!,
          Math.PI / 4,
        )
      }
      const polygon = /^polygon\((.*)\)$/.exec(normalized)
      if (polygon) {
        const pointValues = polygon[1]
          .replace(/^\s*(?:evenodd|nonzero)\s*,/i, '')
          .split(',')
          .map((point) => point.trim().split(/\s+/))
        if (pointValues.length < 3 || pointValues.some((point) => point.length !== 2)) return undefined
        const points = pointValues.map(([x, y]) => [length(x, width), length(y, height)] as const)
        if (points.some(([x, y]) => x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y))) {
          return undefined
        }
        const numericPoints = points as Array<readonly [number, number]>
        const xs = numericPoints.map(([x]) => x)
        const ys = numericPoints.map(([, y]) => y)
        const area = Math.abs(
          numericPoints.reduce((sum, [x, y], index) => {
            const [nextX, nextY] = numericPoints[(index + 1) % numericPoints.length]
            return sum + x * nextY - nextX * y
          }, 0) / 2,
        )
        const left = Math.min(...xs)
        const top = Math.min(...ys)
        const right = Math.max(...xs)
        const bottom = Math.max(...ys)
        return boundedMetrics(left, top, right, bottom, area / Math.max(1, (right - left) * (bottom - top)))
      }
      return undefined
    }

    const filterOpacityFor = (value: string): number | undefined => {
      const normalized = value.trim().toLowerCase()
      if (!normalized || normalized === 'none') return 1
      const calls = [...normalized.matchAll(/([a-z-]+)\(([^()]*)\)/g)]
      if (calls.length === 0 || calls.map((match) => match[0]).join(' ') !== normalized.replace(/\s+/g, ' ')) {
        return undefined
      }
      return calls.reduce<number | undefined>((product, match) => {
        if (product === undefined) return undefined
        if (match[1] !== 'opacity') return undefined
        const token = match[2].trim()
        const parsed = Number.parseFloat(token)
        if (!Number.isFinite(parsed) || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(token)) return undefined
        const opacity = token.endsWith('%') ? parsed / 100 : parsed
        return product * Math.max(0, Math.min(1, opacity))
      }, 1)
    }

    const hasUnsupportedMask = (computed: CSSStyleDeclaration): boolean =>
      ['mask-image', '-webkit-mask-image', 'mask-border-source', '-webkit-mask-box-image-source'].some((property) => {
        const value = computed.getPropertyValue(property).trim().toLowerCase().replace(/\s+/g, ' ')
        return Boolean(value && value !== 'none')
      })

    const hasContextDependentBlend = (computed: CSSStyleDeclaration): boolean => {
      const value = computed.mixBlendMode.trim().toLowerCase()
      return Boolean(value && value !== 'normal')
    }

    const effectivePaintVisibility = (element: Element) => {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 2 || rect.height <= 2 || element.getClientRects().length === 0) return undefined
      const scrollingElement = document.scrollingElement || document.documentElement
      const captureHeight = Math.max(
        window.innerHeight,
        scrollingElement.scrollHeight,
        document.body?.scrollHeight || 0,
      )
      let left = Math.max(0, rect.left)
      let top = Math.max(0, rect.top)
      let right = Math.min(window.innerWidth, rect.right)
      let bottom = Math.min(captureHeight, rect.bottom)
      const captureArea = Math.max(0, right - left) * Math.max(0, bottom - top)
      const captureIntersectionRatio = captureArea / Math.max(1, rect.width * rect.height)
      let opacity = 1
      let filterOpacity = 1
      let effectiveClipPathAreaRatio = 1
      let ancestorClipCount = 0
      const clipPathChain: Array<{
        value: string
        widthPx: number
        heightPx: number
        owner: 'self' | 'ancestor'
      }> = []
      let nonRectangularClipPathCount = 0
      const filterChain: Array<{ value: string; owner: 'self' | 'ancestor' }> = []
      for (let current: Element | null = element; current; current = current.parentElement) {
        const computed = computedFor(current)
        if (
          computed.display === 'none' ||
          computed.visibility === 'hidden' ||
          computed.visibility === 'collapse' ||
          computed.getPropertyValue('content-visibility') === 'hidden' ||
          hasUnsupportedMask(computed) ||
          hasContextDependentBlend(computed)
        ) {
          return undefined
        }
        const currentOpacity = Number.parseFloat(computed.opacity || '1')
        opacity *= Number.isFinite(currentOpacity) ? currentOpacity : 1
        const filter = computed.filter.trim().toLowerCase().replace(/\s+/g, ' ')
        if (filter && filter !== 'none') {
          const currentFilterOpacity = filterOpacityFor(filter)
          if (currentFilterOpacity === undefined || filter.length > 512 || filterChain.length >= 8) return undefined
          filterOpacity *= currentFilterOpacity
          filterChain.push({ value: filter, owner: current === element ? 'self' : 'ancestor' })
        }
        const currentRect = current.getBoundingClientRect()
        const clipPath = clipPathMetrics(computed.clipPath, currentRect.width, currentRect.height)
        if (!clipPath || (computed.clip !== '' && computed.clip !== 'auto')) return undefined
        if (computed.clipPath !== '' && computed.clipPath !== 'none') {
          if (clipPathChain.length >= 8) return undefined
          const normalizedClipPath = computed.clipPath.trim().toLowerCase().replace(/\s+/g, ' ')
          clipPathChain.push({
            value: normalizedClipPath,
            widthPx: currentRect.width,
            heightPx: currentRect.height,
            owner: current === element ? 'self' : 'ancestor',
          })
          if (/^(?:circle|ellipse|polygon)\(/.test(normalizedClipPath)) nonRectangularClipPathCount += 1
          left = Math.max(left, currentRect.left + clipPath.left)
          top = Math.max(top, currentRect.top + clipPath.top)
          right = Math.min(right, currentRect.left + clipPath.right)
          bottom = Math.min(bottom, currentRect.top + clipPath.bottom)
          effectiveClipPathAreaRatio *= clipPath.fillRatio
          if (current !== element) ancestorClipCount += 1
        }
        if (current !== element) {
          const clipsX = ['auto', 'scroll', 'hidden', 'clip'].includes(computed.overflowX)
          const clipsY = ['auto', 'scroll', 'hidden', 'clip'].includes(computed.overflowY)
          const containsPaint = computed.contain.split(/\s+/).includes('paint')
          if (clipsX || containsPaint) {
            left = Math.max(left, currentRect.left)
            right = Math.min(right, currentRect.right)
            ancestorClipCount += 1
          }
          if (clipsY || containsPaint) {
            top = Math.max(top, currentRect.top)
            bottom = Math.min(bottom, currentRect.bottom)
            if (!clipsX && !containsPaint) ancestorClipCount += 1
          }
        }
      }
      const visibleWidthPx = Math.max(0, right - left)
      const visibleHeightPx = Math.max(0, bottom - top)
      const effectiveScale = Math.sqrt(Math.max(0, Math.min(1, effectiveClipPathAreaRatio)))
      const paintedAreaPx = visibleWidthPx * visibleHeightPx * effectiveClipPathAreaRatio
      if (
        visibleWidthPx <= 2 ||
        visibleHeightPx <= 2 ||
        visibleWidthPx * effectiveScale <= 2 ||
        visibleHeightPx * effectiveScale <= 2 ||
        paintedAreaPx <= 16 ||
        opacity <= 0.02 ||
        filterOpacity <= 0.02
      ) {
        return undefined
      }
      return {
        widthPx: rect.width,
        heightPx: rect.height,
        visibleWidthPx,
        visibleHeightPx,
        visibleBounds: {
          xPx: left - rect.left,
          yPx: top - rect.top,
          widthPx: visibleWidthPx,
          heightPx: visibleHeightPx,
        },
        paintedAreaPx,
        captureIntersectionRatio,
        effectiveClipPathAreaRatio,
        ancestorClipCount,
        clientRectCount: element.getClientRects().length,
        opacity,
        filterOpacity,
        filterChain,
        maskChain: [],
        blendChain: [],
        clipPathChain,
        nonRectangularClipPathCount,
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
    const glyphPaintFor = (
      computed: CSSStyleDeclaration,
    ):
      | { kind: 'solid-color'; foreground: string }
      | { kind: 'background-clip'; backgroundClip: string; backgroundImage: string }
      | undefined => {
      const declaredFill = computed.getPropertyValue('-webkit-text-fill-color').trim()
      const fill = declaredFill && declaredFill.toLowerCase() !== 'currentcolor' ? declaredFill : computed.color
      const foreground = normalizeObservedColor(fill)
      if (foreground) return { kind: 'solid-color', foreground }
      const backgroundClip = [computed.backgroundClip, computed.getPropertyValue('-webkit-background-clip')]
        .map((value) => value.trim().toLowerCase())
        .find((value) => value.split(/\s*,\s*/).includes('text'))
      const backgroundImage = computed.backgroundImage.trim()
      if (backgroundClip && backgroundImage && backgroundImage !== 'none' && backgroundImage.length <= 512) {
        return { kind: 'background-clip', backgroundClip, backgroundImage }
      }
      return undefined
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
    const captureId = `${location.href}|${window.innerWidth}x${window.innerHeight}`
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight)
    const visibleAreaRatio = (element: Element): number => {
      const rect = element.getBoundingClientRect()
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0))
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
      return (width * height) / viewportArea
    }
    const directlyPaintedBackground = (element: Element): string | null =>
      normalizeObservedColor(computedFor(element).backgroundColor)
    const hasBackgroundPaint = (element: Element): boolean => {
      const computed = computedFor(element)
      return Boolean(directlyPaintedBackground(element)) || computed.backgroundImage.trim().toLowerCase() !== 'none'
    }
    const pureDirectlyPaintedBackground = (element: Element): string | null => {
      const computed = computedFor(element)
      if (
        computed.backgroundImage.trim().toLowerCase() !== 'none' ||
        computed.mixBlendMode.trim().toLowerCase() !== 'normal' ||
        computed.filter.trim().toLowerCase() !== 'none'
      ) {
        return null
      }
      return directlyPaintedBackground(element)
    }
    const bodyCanvasPainted = hasBackgroundPaint(document.body)
    const htmlCanvasPainted = hasBackgroundPaint(document.documentElement)
    const documentHeight = Math.max(
      window.innerHeight,
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
    )
    const renderedTextLength = (element: Element): number =>
      (element instanceof HTMLElement ? element.innerText : '').trim().length
    const bodyTextLength = Math.max(1, renderedTextLength(document.body))
    const bodyCoversRenderedDocument =
      visibleAreaRatio(document.body) >= 0.85 && document.body.scrollHeight >= documentHeight * 0.8
    const specializedCanvasBoundary =
      'pre, code, kbd, samp, math, figure, picture, video, canvas, svg, form, search, dialog, [role="code"], [role="img"], [role="search"], [role="dialog"], [role="status"], [role="alert"]'
    const rootPaintCandidates: Element[] = []
    const pendingRoots = [...document.body.children]
    for (let index = 0; index < pendingRoots.length; index++) {
      const element = pendingRoots[index]
      if (element.matches(specializedCanvasBoundary)) continue
      if (hasBackgroundPaint(element)) {
        rootPaintCandidates.push(element)
      } else {
        // Transparent mounts do not define a new painted surface, including display:contents wrappers.
        // Stop at the first painted owner or specialized boundary instead of promoting arbitrary deep surfaces.
        pendingRoots.push(...element.children)
      }
    }
    const rootCanvas = rootPaintCandidates
      .filter((element) => visibleAreaRatio(element) >= 0.85)
      // A full-size DOM box is not canvas evidence when its paint is hidden, transparent, or clipped away.
      .filter((element) => Boolean(effectivePaintVisibility(element)))
      .filter(hasBackgroundPaint)
      .filter((element) => !element.querySelector(':scope > pre, :scope > code, :scope > [role="code"]'))
      .filter(
        (element) =>
          element.scrollHeight >= documentHeight * 0.8 && renderedTextLength(element) >= bodyTextLength * 0.6,
      )
      .map((element) => ({ element, area: visibleAreaRatio(element) }))
      .sort((first, second) => second.area - first.area)[0]
    // Choose the uppermost semantic root that covers the rendered document. A body or application root can visibly
    // cover an independently colored HTML canvas, so DOM paint order matters more than declaration order here.
    // Complex paint is observed elsewhere but deliberately cannot become a fabricated pure-color foundation token.
    const pageCanvasPaintOwner: Element | null =
      rootCanvas?.element ||
      (bodyCanvasPainted && (!htmlCanvasPainted || bodyCoversRenderedDocument) ? document.body : null) ||
      (htmlCanvasPainted ? document.documentElement : null)
    const authorCanvasValue = pageCanvasPaintOwner ? pureDirectlyPaintedBackground(pageCanvasPaintOwner) : null
    const pageCanvasValue = pageCanvasPaintOwner ? authorCanvasValue : browserCanvasColor
    const pageCanvasOwner = authorCanvasValue ? pageCanvasPaintOwner : null
    if (pageCanvasPaintOwner && !authorCanvasValue) {
      styles.semanticSurfaceLimitations?.push('complex-page-canvas-paint')
    }
    if (pageCanvasValue) {
      styles.semanticSurfaceObservations?.push({
        captureId,
        ownerId:
          pageCanvasOwner === document.documentElement
            ? 'html'
            : pageCanvasOwner
              ? locatorFor(pageCanvasOwner)
              : 'browser-canvas',
        value: pageCanvasValue,
        domain: 'foundation',
        role: 'page-canvas',
        rendered: true,
        declared: false,
        elementKind: pageCanvasOwner?.tagName.toLowerCase() || 'browser-canvas',
        areaRatio: 1,
        viewportCoverage: 1,
      })
    }
    const statusCandidateKind = (element: Element): 'native' | null => {
      const role = element.getAttribute('role') || ''
      const ariaLive = element.getAttribute('aria-live')
      if (element.matches(candidateRules.broadActionSelector)) return null
      const nativeStatus = ['status', 'alert'].includes(role) || Boolean(ariaLive && ariaLive !== 'off')
      if (nativeStatus) return 'native'
      return null
    }
    const statusCandidateKinds = new Map<Element, 'native'>()
    for (const element of elements) {
      const kind = statusCandidateKind(element)
      if (kind) statusCandidateKinds.set(element, kind)
    }
    const statusCandidates = new Set(statusCandidateKinds.keys())
    const statusBoundaryPaint = (element: Element) => {
      const computed = getComputedStyle(element)
      if (!effectivePaintVisibility(element)) {
        return { paintedFill: false, paintedBorder: false, paintedShadow: false }
      }
      const paintedFill = Boolean(normalizeObservedColor(computed.backgroundColor))
      const paintedBorder = [
        [computed.borderTopWidth, computed.borderTopStyle, computed.borderTopColor],
        [computed.borderRightWidth, computed.borderRightStyle, computed.borderRightColor],
        [computed.borderBottomWidth, computed.borderBottomStyle, computed.borderBottomColor],
        [computed.borderLeftWidth, computed.borderLeftStyle, computed.borderLeftColor],
      ].some(
        ([width, style, color]) =>
          Number.parseFloat(width) > 0 && !['none', 'hidden'].includes(style) && Boolean(normalizeObservedColor(color)),
      )
      const paintedShadow =
        computed.boxShadow !== 'none' &&
        computed.boxShadow.split(/,(?![^()]*\))/).some((layer) => {
          const colorPattern = /transparent|#[\da-f]{3,8}\b|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^)]*\)/gi
          const colors = layer.match(colorPattern) || []
          if (!colors.some((color) => Boolean(normalizeObservedColor(color)))) return false
          const dimensions = layer
            .replace(colorPattern, ' ')
            .replace(/\binset\b/gi, ' ')
            .match(/-?(?:\d+(?:\.\d+)?|\.\d+)(?:[a-z%]+)?/gi)
          return Boolean(
            dimensions &&
            dimensions.length >= 2 &&
            dimensions.slice(0, 4).some((value) => Math.abs(Number.parseFloat(value)) > 0.01),
          )
        })
      return { paintedFill, paintedBorder, paintedShadow }
    }
    const directlyOwnsRenderedStatusText = (element: Element): boolean => {
      const textNodes = [...element.childNodes].filter(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.replace(/\s+/g, ' ').trim()),
      )
      if (textNodes.length === 0) return false
      return textNodes.some((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        return [...range.getClientRects()].some((rect) => rect.width > 2 && rect.height > 2)
      })
    }
    const hasStatusEvidenceGeometry = (element: Element): boolean => {
      const rect = element.getBoundingClientRect()
      const computed = getComputedStyle(element)
      return (
        rect.width >= 4 &&
        rect.height >= 4 &&
        computed.display !== 'none' &&
        computed.visibility !== 'hidden' &&
        computed.visibility !== 'collapse' &&
        Number.parseFloat(computed.opacity || '1') > 0.02 &&
        Boolean(effectivePaintVisibility(element)) &&
        (computed.clip === 'auto' || computed.clip === '') &&
        (computed.clipPath === 'none' || computed.clipPath === '')
      )
    }
    const isActionableStatusCandidate = (element: Element): boolean => {
      const rect = element.getBoundingClientRect()
      const viewportWidth = Math.max(1, window.innerWidth)
      const viewportHeight = Math.max(1, window.innerHeight)
      const areaRatio = (Math.max(0, rect.width) * Math.max(0, rect.height)) / (viewportWidth * viewportHeight)
      const bounded = rect.height <= Math.min(240, viewportHeight * 0.45) && areaRatio <= 0.4
      const compact = rect.height <= Math.min(160, viewportHeight * 0.25) && areaRatio <= 0.2
      const compactWidth = rect.width <= Math.min(720, viewportWidth * 0.8)
      return (
        bounded &&
        (Object.values(statusBoundaryPaint(element)).some(Boolean) ||
          (directlyOwnsRenderedStatusText(element) && compact && compactWidth))
      )
    }
    const preferredStatusCandidates = new Set([...statusCandidates].filter(hasStatusEvidenceGeometry))
    const actionableStatusCandidates = new Set([...preferredStatusCandidates].filter(isActionableStatusCandidate))
    const actionableDescendantCounts = new Map<Element, number>()
    for (const element of actionableStatusCandidates) {
      let ancestor = element.parentElement
      while (ancestor) {
        if (preferredStatusCandidates.has(ancestor)) {
          actionableDescendantCounts.set(ancestor, (actionableDescendantCounts.get(ancestor) || 0) + 1)
          if (actionableStatusCandidates.has(ancestor)) break
        }
        ancestor = ancestor.parentElement
      }
    }
    const statusRoots = new Set(
      [...preferredStatusCandidates].filter((element) => {
        const actionable = actionableStatusCandidates.has(element)
        if (!actionable && (actionableDescendantCounts.get(element) || 0) > 0) return false
        let ancestor = element.parentElement
        while (ancestor) {
          if (preferredStatusCandidates.has(ancestor)) {
            if (actionable && !actionableStatusCandidates.has(ancestor)) {
              ancestor = ancestor.parentElement
              continue
            }
            return false
          }
          ancestor = ancestor.parentElement
        }
        return true
      }),
    )
    const formSubmitterCounts = new WeakMap<HTMLFormElement, number>()
    const enabledVisibleSubmitterCount = (form: HTMLFormElement): number => {
      const cached = formSubmitterCounts.get(form)
      if (cached !== undefined) return cached
      const count = [...document.querySelectorAll<HTMLElement>(candidateRules.formSubmitterSelector)].filter(
        (candidate) => {
          const control = candidate as HTMLButtonElement | HTMLInputElement
          if (
            control.form !== form ||
            control.disabled ||
            candidate.matches(':disabled, [aria-disabled="true"]') ||
            candidate.closest('[hidden], [aria-hidden="true"], [inert]')
          ) {
            return false
          }
          const candidateStyle = getComputedStyle(candidate)
          return Boolean(effectivePaintVisibility(candidate)) && candidateStyle.pointerEvents !== 'none'
        },
      ).length
      formSubmitterCounts.set(form, count)
      return count
    }
    const roleCandidateFor = (element: Element, computed: CSSStyleDeclaration, rect: DOMRect) => {
      if (statusCandidates.has(element)) {
        if (!statusRoots.has(element) || !actionableStatusCandidates.has(element)) return null
        return {
          elementKind: 'status' as const,
          role: 'status' as const,
          statusKind: 'status' as const,
          statusIntent: 'neutral' as const,
        }
      }
      const ancestorCandidate = element.parentElement?.closest(
        `${candidateRules.broadActionSelector}, ${candidateRules.nativeStatusSelector}`,
      )
      if (ancestorCandidate) return null
      const role = element.getAttribute('role') || ''
      const tagName = element.tagName.toLowerCase()
      const nativeButton = tagName === 'button'
      const inputButton =
        tagName === 'input' && ['button', 'submit', 'image'].includes((element as HTMLInputElement).type.toLowerCase())
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
        if (!(paintedFill || paintedBorder || controlGeometry)) return null
      }
      const formControl = nativeButton
        ? (element as HTMLButtonElement)
        : inputButton
          ? (element as HTMLInputElement)
          : null
      const form = formControl?.form || null
      const submitCapable = Boolean(form && ['submit', 'image'].includes(formControl?.type.toLowerCase() || ''))
      const roleCandidate =
        submitCapable && form && enabledVisibleSubmitterCount(form) === 1
          ? ('primary-action' as const)
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
      {
        background: string
        foreground: string
        textRole: 'body' | 'heading' | 'label' | 'other'
        ownerIds: Set<string>
      }
    >()

    for (const el of elements) {
      const computed = computedFor(el)
      const paintVisibility = effectivePaintVisibility(el)
      if (!paintVisibility) continue
      const rect = el.getBoundingClientRect()
      // The structural locator remains stable when the same page is sampled at multiple viewports. This lets evidence
      // union genuinely distinct responsive owners without counting the same element once per capture.
      currentOwner = locatorFor(el)

      // Colors
      const glyphPaint = glyphPaintFor(computed)
      const paintPreservesColor = paintVisibility.opacity >= 0.999 && paintVisibility.filterOpacity >= 0.999
      const color = paintPreservesColor && glyphPaint?.kind === 'solid-color' ? glyphPaint.foreground : null
      const bgColor = paintPreservesColor ? normalizeObservedColor(computed.backgroundColor) : null
      const interactive = Boolean(
        el.closest(
          'a, button, input, select, textarea, [role="button"], [role="link"], [aria-current], [aria-selected="true"]',
        ),
      )
      const structuralRoot = el.matches(
        'body, main, section, article, header, footer, nav, aside, [role="main"], [role="region"], [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]',
      )
      const specializedContent = Boolean(el.closest('pre, code, kbd, samp, math, [role="code"]'))
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
      const linkRoot = Boolean(el.closest('a, [role="link"]'))
      const selectedRoot = Boolean(el.closest('[aria-current], [aria-selected="true"]'))

      const directTextNodes = [...el.childNodes].filter(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.replace(/\s+/g, ' ').trim()),
      )
      const glyphRects = directTextNodes.flatMap((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        return [...range.getClientRects()].filter((glyphRect) => glyphRect.width > 0 && glyphRect.height > 0)
      })
      const visibleGlyphRects = paintVisibility
        ? glyphRects
            .flatMap((glyphRect) => {
              const visibleLeft = rect.left + paintVisibility.visibleBounds.xPx
              const visibleTop = rect.top + paintVisibility.visibleBounds.yPx
              const left = Math.max(glyphRect.left, visibleLeft)
              const top = Math.max(glyphRect.top, visibleTop)
              const right = Math.min(glyphRect.right, visibleLeft + paintVisibility.visibleBounds.widthPx)
              const bottom = Math.min(glyphRect.bottom, visibleTop + paintVisibility.visibleBounds.heightPx)
              const width = Math.max(0, right - left)
              const height = Math.max(0, bottom - top)
              return width > 1 && height > 1 && width * height > 4
                ? [{ xPx: left - rect.left, yPx: top - rect.top, widthPx: width, heightPx: height }]
                : []
            })
            .slice(0, 8)
        : []
      const visibleGlyphAreaPx = visibleGlyphRects.reduce(
        (area, glyphRect) => area + glyphRect.widthPx * glyphRect.heightPx,
        0,
      )
      const glyphRectCount = glyphRects.length
      const textIndent = Number.parseFloat(computed.textIndent || '0')
      const renderedTextSource =
        directTextNodes.length > 0 &&
        glyphRectCount > 0 &&
        visibleGlyphRects.length > 0 &&
        glyphPaint &&
        !paintVisibility.clipPathChain.some((clipPath) => clipPath.owner === 'ancestor') &&
        paintVisibility.nonRectangularClipPathCount === 0 &&
        Number.parseFloat(computed.fontSize || '0') >= 8 &&
        (!Number.isFinite(textIndent) || Math.abs(textIndent) <= Math.max(128, rect.width * 2))
          ? {
              kind: 'direct-text' as const,
              ...paintVisibility,
              glyphRectCount,
              visibleGlyphRects,
              visibleGlyphAreaPx,
              clip: computed.clip.trim().toLowerCase(),
              clipPath: computed.clipPath.trim().toLowerCase().replace(/\s+/g, ' '),
              contentVisibility: computed.getPropertyValue('content-visibility'),
              textIndentPx: Number.isFinite(textIndent) ? textIndent : 0,
              filter: computed.filter.trim().toLowerCase().replace(/\s+/g, ' '),
              glyphPaintKind: glyphPaint.kind,
              ...(glyphPaint.kind === 'solid-color'
                ? { foreground: glyphPaint.foreground }
                : { backgroundClip: glyphPaint.backgroundClip, backgroundImage: glyphPaint.backgroundImage }),
            }
          : undefined
      if (renderedTextSource) {
        const background = paintPreservesColor ? effectiveBackgroundFor(el) : null
        const textRole = semanticTextRole
          ? ('heading' as const)
          : interactive || el.closest('a, button, label, [role="button"], [role="link"]')
            ? ('label' as const)
            : el.matches('p, li, dd, dt, blockquote, figcaption, td, th')
              ? ('body' as const)
              : ('other' as const)
        styles.renderedTextStyleObservations?.push({
          ownerId: currentOwner,
          textRole,
          styles: {
            ...(color ? { color } : {}),
            ...(background ? { backgroundColor: background } : {}),
            fontFamily: computed.fontFamily,
            fontSize: computed.fontSize,
            fontWeight: computed.fontWeight,
            lineHeight: computed.lineHeight,
            letterSpacing: computed.letterSpacing,
          },
          source: renderedTextSource,
        })
        if (background && color) {
          const key = `${background}|${color}|${textRole}`
          const existing = textColorPairFrequency.get(key)
          textColorPairFrequency.set(key, {
            background,
            foreground: color,
            textRole,
            ownerIds: new Set([...(existing?.ownerIds || []), currentOwner]),
          })
        }
      }

      if (color && renderedTextSource) {
        styles.textColors.push(color)
        styles.colors.push(color)
        countUsage('textColor', color)
        addValueSource('textColor', color, 'rendered:text')
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
        if (el === document.documentElement || el === document.body) {
          addValueSource('bgColor', bgColor, 'element:page-background')
        }
        if (selectedRoot && roleCandidate?.role !== 'status') {
          countUsage('selectedColor', bgColor)
          addValueSource('selectedColor', bgColor, 'element:selected')
        }

        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0))
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
        const visibleAreaShare = (visibleWidth * visibleHeight) / viewportArea
        const effectiveBackground = visibleAreaShare > 0 ? effectiveBackgroundFor(el) : null
        if (effectiveBackground) countUsage('bgArea', effectiveBackground, visibleAreaShare)

        const explicitRole = el.getAttribute('role')?.trim().toLowerCase() || undefined
        const searchAncestor = el.closest('search, [role="search"]')
        const formRole = searchAncestor ? 'search' : el.closest('form') ? 'form' : undefined
        const codeSelector = 'pre, code, kbd, samp, math, [role="code"]'
        const mediaSelector = 'figure, picture, video, canvas, svg, img, [role="img"]'
        const directlyOwnedSemanticRoots = (selector: string): Element[] =>
          [...el.querySelectorAll(selector)]
            .filter((candidate) => {
              let ancestor = candidate.parentElement
              while (ancestor && ancestor !== el) {
                if (ancestor.matches(selector)) return false
                ancestor = ancestor.parentElement
              }
              return ancestor === el
            })
            .filter((candidate) => {
              const ownerBackground = directlyPaintedBackground(el)
              const candidateBackground = directlyPaintedBackground(candidate)
              if (hasBackgroundPaint(candidate) && candidateBackground !== ownerBackground) return false
              let ancestor = candidate.parentElement
              while (ancestor && ancestor !== el) {
                if (hasBackgroundPaint(ancestor) && directlyPaintedBackground(ancestor) !== ownerBackground) {
                  return false
                }
                ancestor = ancestor.parentElement
              }
              return ancestor === el
            })
        const ownedAreaRatio = (candidates: Element[]): number =>
          Math.min(
            1,
            candidates.reduce((area, candidate) => {
              const candidateRect = candidate.getBoundingClientRect()
              const width = Math.max(
                0,
                Math.min(rect.right, candidateRect.right) - Math.max(rect.left, candidateRect.left),
              )
              const height = Math.max(
                0,
                Math.min(rect.bottom, candidateRect.bottom) - Math.max(rect.top, candidateRect.top),
              )
              return area + (width * height) / Math.max(1, rect.width * rect.height)
            }, 0),
          )
        const ownedCodeRoots = directlyOwnedSemanticRoots(codeSelector)
        const ownedCodeTextLength = ownedCodeRoots.reduce(
          (length, candidate) => length + (candidate.textContent || '').trim().length,
          0,
        )
        const ownerTextLength = (el.textContent || '').trim().length
        const ownedCodeAreaRatio = ownedAreaRatio(ownedCodeRoots)
        const codeWrapper =
          ownedCodeRoots.length > 0 &&
          (ownedCodeTextLength / Math.max(1, ownerTextLength) >= 0.65 || ownedCodeAreaRatio >= 0.5)
        const codeOwner = specializedContent || codeWrapper
        const ownedMediaRoots = directlyOwnedSemanticRoots(mediaSelector)
        const mediaWrapper = ownedMediaRoots.length > 0 && ownedAreaRatio(ownedMediaRoots) >= 0.5
        const mediaOwner = Boolean(el.closest(mediaSelector)) || mediaWrapper
        const controlOwner = Boolean(
          el.closest(
            'a, button, input, select, textarea, form, search, [role="button"], [role="link"], [role="textbox"], [role="searchbox"], [role="combobox"], [role="dialog"], [role="search"]',
          ),
        )
        const statusOwner = Boolean(el.closest('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])'))
        const chromeOwner = Boolean(
          el.closest('header, footer, nav, [role="banner"], [role="navigation"], [role="contentinfo"]'),
        )
        let paintedAncestor = el.parentElement
        let ancestorBackground: string | null = null
        while (paintedAncestor && !ancestorBackground) {
          ancestorBackground = directlyPaintedBackground(paintedAncestor)
          paintedAncestor = paintedAncestor.parentElement
        }
        const paintsDistinctSurface = !ancestorBackground || ancestorBackground !== bgColor
        const repeatedContentOwner = (() => {
          const parent = el.parentElement
          if (!parent || el.children.length === 0 || (el.textContent || '').trim().length < 12) return false
          return (
            [...parent.children].filter((sibling) => {
              if (sibling.tagName !== el.tagName) return false
              return directlyPaintedBackground(sibling) === bgColor
            }).length >= 2
          )
        })()
        const foundationContentOwner = structuralRoot || repeatedContentOwner
        const semanticSurface =
          el === pageCanvasOwner
            ? null
            : codeOwner
              ? { domain: 'specialized-content' as const, role: 'code-surface' as const }
              : mediaOwner
                ? { domain: 'specialized-content' as const, role: 'media-surface' as const }
                : statusOwner
                  ? { domain: 'component' as const, role: 'status-surface' as const }
                  : controlOwner
                    ? { domain: 'component' as const, role: 'control-surface' as const }
                    : chromeOwner
                      ? { domain: 'component' as const, role: 'chrome-surface' as const }
                      : foundationContentOwner && paintsDistinctSurface
                        ? { domain: 'foundation' as const, role: 'content-surface' as const }
                        : { domain: 'local' as const, role: 'unknown' as const }
        const semanticPaintValue = pureDirectlyPaintedBackground(el)
        if (semanticSurface && semanticPaintValue && visibleAreaShare > 0) {
          styles.semanticSurfaceObservations?.push({
            captureId,
            ownerId: currentOwner,
            value: semanticPaintValue,
            ...semanticSurface,
            rendered: true,
            declared: false,
            elementKind: el.tagName.toLowerCase(),
            ...(explicitRole ? { landmarkRole: explicitRole } : {}),
            ...(formRole ? { formRole } : {}),
            areaRatio: visibleAreaShare,
            viewportCoverage: Math.min(1, visibleAreaShare),
          })
          addValueSource('bgColor', bgColor, `semantic:${semanticSurface.role}`)
        }
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
        const borderColor = paintPreservesColor
          ? [
              [computed.borderTopWidth, computed.borderTopStyle, computed.borderTopColor],
              [computed.borderRightWidth, computed.borderRightStyle, computed.borderRightColor],
              [computed.borderBottomWidth, computed.borderBottomStyle, computed.borderBottomColor],
              [computed.borderLeftWidth, computed.borderLeftStyle, computed.borderLeftColor],
            ]
              .flatMap(([width, style, value]) =>
                Number.parseFloat(width) > 0 && !['none', 'hidden'].includes(style)
                  ? [normalizeObservedColor(value)]
                  : [],
              )
              .find((value): value is string => Boolean(value))
          : undefined
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
      const borderSides = paintPreservesColor
        ? ([
            [
              computed.borderTopWidth,
              computed.borderTopStyle,
              normalizeObservedColor(computed.borderTopColor),
              rect.width,
            ],
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
          ] as const)
        : []
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
          addValueSource('border', borderValue, 'computed:border')
        }
      }

      // Font families
      const fontFamily = computed.fontFamily
      if (fontFamily && renderedTextSource && !seen.has(`font:${fontFamily}`)) {
        seen.add(`font:${fontFamily}`)
        styles.fontFamilies.push(fontFamily)
      }
      if (fontFamily && renderedTextSource) countUsage('fontFamily', fontFamily)
      if (fontFamily && renderedTextSource) {
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
      if (fontSize && renderedTextSource) {
        styles.fontSizes.push(fontSize)
        countUsage('fontSize', fontSize)
        addValueSource('fontSize', fontSize, 'rendered:text')
        if (semanticTextRole) countUsage(`${semanticTextRole}FontSize`, fontSize)
      }

      // Font weights
      const fontWeight = computed.fontWeight
      if (fontWeight && renderedTextSource) {
        styles.fontWeights.push(fontWeight)
        countUsage('fontWeight', fontWeight)
        addValueSource('fontWeight', fontWeight, 'rendered:text')
        if (semanticTextRole) countUsage(`${semanticTextRole}FontWeight`, fontWeight)
      }

      // Line heights
      const lineHeight = computed.lineHeight
      if (renderedTextSource && lineHeight && lineHeight !== 'normal') {
        styles.lineHeights.push(lineHeight)
        countUsage('lineHeight', lineHeight)
        addValueSource('lineHeight', lineHeight, 'rendered:text')
        if (fontSize) {
          countUsage('typeMetric', `${fontSize}|${lineHeight}`)
          addValueSource('typeMetric', `${fontSize}|${lineHeight}`, 'rendered:text')
        }
      }

      // Letter spacing
      const letterSpacing = computed.letterSpacing
      if (renderedTextSource && letterSpacing && letterSpacing !== 'normal' && letterSpacing !== '0px') {
        styles.letterSpacings.push(letterSpacing)
        countUsage('letterSpacing', letterSpacing)
        addValueSource('letterSpacing', letterSpacing, 'rendered:text')
      }

      // Z-index
      const zIndex = computed.zIndex
      if (zIndex && zIndex !== 'auto' && zIndex !== '0') {
        styles.zIndices.push(zIndex)
        countUsage('zIndex', zIndex)
        addValueSource('zIndex', zIndex, 'computed:stacking')
      }

      // Transition duration
      const transitionDuration = computed.transitionDuration
      if (transitionDuration && transitionDuration !== '0s') {
        const durations = transitionDuration.split(',').map((d) => d.trim())
        for (const d of durations) {
          if (d && d !== '0s') {
            styles.transitions.push(d)
            countUsage('transition', d)
            addValueSource('transition', d, 'computed:transition')
          }
        }
      }

      // Spacing (margin and padding). `gap` is a shorthand alias of row/column gap in computed styles, so count each
      // distinct axis value once per element instead of counting the same authored decision up to three times.
      const spacingSource = interactive
        ? 'element:control-spacing'
        : specializedContent
          ? 'element:specialized-spacing'
          : structuralRoot
            ? 'element:structural-spacing'
            : 'element:content-spacing'
      const horizontalMargins = [computed.marginLeft, computed.marginRight].map(Number.parseFloat)
      const parentRect = el.parentElement?.getBoundingClientRect()
      const parentComputed = el.parentElement ? getComputedStyle(el.parentElement) : null
      const parentInnerWidth = parentRect
        ? parentRect.width -
          Number.parseFloat(parentComputed?.paddingLeft || '0') -
          Number.parseFloat(parentComputed?.paddingRight || '0')
        : 0
      const centeredInlineOffset =
        parentInnerWidth > 0 &&
        horizontalMargins.every((value) => Number.isFinite(value) && value > 0) &&
        Math.abs(horizontalMargins[0] - horizontalMargins[1]) <= 1 &&
        Math.abs(rect.width + horizontalMargins[0] + horizontalMargins[1] - parentInnerWidth) <= 4
      const recordSpacing = (value: string, source = spacingSource) => {
        if (!value || value === '0px' || value === 'auto' || value === 'normal') return
        const numeric = Number.parseFloat(value)
        const observedSource = Number.isFinite(numeric) && numeric < 0 ? 'geometry:negative-offset' : source
        styles.spacings.push(value)
        countUsage('spacing', value)
        addValueSource('spacing', value, observedSource)
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
        const centeredMargin = centeredInlineOffset && (prop === 'marginLeft' || prop === 'marginRight')
        recordSpacing(
          computed[prop as keyof CSSStyleDeclaration] as string,
          centeredMargin ? 'geometry:centered-inline-offset' : spacingSource,
        )
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
        addValueSource(
          'radius',
          radius,
          interactive
            ? 'element:control-radius'
            : specializedContent
              ? 'element:specialized-radius'
              : structuralRoot
                ? 'element:structural-radius'
                : 'element:content-radius',
        )
      }

      // Box shadow
      const shadow = computed.boxShadow
      if (paintPreservesColor && shadow && shadow !== 'none') {
        styles.shadows.push(shadow)
        countUsage('shadow', shadow)
        addValueSource(
          'shadow',
          shadow,
          interactive
            ? 'element:control-shadow'
            : specializedContent
              ? 'element:specialized-shadow'
              : structuralRoot
                ? 'element:structural-shadow'
                : 'element:content-shadow',
        )
      }
    }

    styles.usageOwnerCounts = Object.fromEntries(
      [...usageOwners.entries()]
        .map(([key, owners]): [string, number] => [key, owners.size])
        .sort(([first], [second]) => first.localeCompare(second)),
    )
    styles.usageOwnerIds = Object.fromEntries(
      [...usageOwners.entries()]
        .map(([key, owners]): [string, string[]] => [
          key,
          [...owners].sort((first, second) => first.localeCompare(second)),
        ])
        .sort(([first], [second]) => first.localeCompare(second)),
    )
    const sourceOwnerIds: Record<string, Record<string, string[]>> = {}
    for (const [ownerKey, owners] of valueSourceOwners) {
      const separator = ownerKey.indexOf('\u0000')
      if (separator < 0) continue
      const key = ownerKey.slice(0, separator)
      const source = ownerKey.slice(separator + 1)
      const sources = sourceOwnerIds[key] || {}
      sources[source] = [...owners].sort((first, second) => first.localeCompare(second))
      sourceOwnerIds[key] = sources
    }
    styles.valueSourceOwnerIds = Object.fromEntries(
      Object.entries(sourceOwnerIds)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, sources]) => [
          key,
          Object.fromEntries(Object.entries(sources).sort(([first], [second]) => first.localeCompare(second))),
        ]),
    )

    styles.textColorPairObservations = [...textColorPairFrequency.values()]
      .sort((first, second) => second.ownerIds.size - first.ownerIds.size)
      .slice(0, 80)
      .map((observation) => ({
        captureId,
        background: observation.background,
        foreground: observation.foreground,
        textRole: observation.textRole,
        count: observation.ownerIds.size,
        ownerIds: [...observation.ownerIds].sort(),
      }))

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
