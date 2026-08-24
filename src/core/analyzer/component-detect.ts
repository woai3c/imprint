import type { Page } from 'playwright-core'

import { normalizeColorValue } from './color-cluster.js'

export type ComponentType = 'button' | 'card' | 'navigation' | 'input' | 'table' | 'modal' | 'list' | 'tab' | 'status'

export interface ComponentCandidate {
  type: ComponentType
  confidence: number
  evidence: string[]
  styles: Record<string, string>
}

export interface ComponentPattern {
  type: ComponentType
  count: number
  selectors: string[]
  styles: Record<string, string>
  confidence: number
  evidence: string[]
  elementKinds?: string[]
  semanticRole?: string
  sampleSize?: { width: number; height: number }
}

export type ComponentVariant = 'primary' | 'secondary' | 'destructive' | 'text' | 'icon'

export interface ComponentVariantContext {
  tokenRefs?: readonly string[]
  primaryColor?: string
  surfaceColors?: readonly string[]
  role?: string
  widthPx?: number
  heightPx?: number
  elementKind?: string
}

export interface ComponentVariantCandidate extends ComponentCandidate, ComponentVariantContext {}

export interface ComponentVariantPattern extends ComponentPattern {
  name: string
  variant?: ComponentVariant
}

const COMPONENT_ORDER: ComponentType[] = [
  'button',
  'tab',
  'status',
  'card',
  'navigation',
  'input',
  'table',
  'modal',
  'list',
]

const MIN_MEANINGFUL_TINT_ALPHA = 0.03

const COMPONENT_SELECTORS: Record<ComponentType, string[]> = {
  button: ['button', 'input[type="submit"]', '[role="button"]'],
  card: [],
  navigation: ['nav', '[role="navigation"]'],
  input: ['input', 'textarea', 'select', '[role="textbox"]', '[role="combobox"]'],
  table: ['table', '[role="table"]', '[role="grid"]'],
  modal: ['dialog', '[role="dialog"]', '[role="alertdialog"]'],
  list: ['ul', 'ol', '[role="list"]'],
  tab: ['[role="tab"]'],
  status: ['[role="status"]', '[role="alert"]', '[aria-live]:not([aria-live="off"])'],
}

function numericDimensions(value: string | undefined): number[] {
  if (!value) return []
  return [...value.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number.parseFloat(match[0]))
}

function colorAlpha(value: string | undefined): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'transparent') return 0
  const legacyAlpha = trimmed.match(/^(?:rgba|hsla)\([^,]+,[^,]+,[^,]+,\s*([\d.]+)(%)?\)$/)
  if (legacyAlpha) {
    const alpha = Number.parseFloat(legacyAlpha[1])
    return legacyAlpha[2] ? alpha / 100 : alpha
  }
  const modern = trimmed.match(/\/\s*([\d.]+)%?\s*\)$/)
  if (modern) {
    const alpha = Number.parseFloat(modern[1])
    return modern[0].includes('%') ? alpha / 100 : alpha
  }
  const hex = trimmed.match(/^#[\da-f]{8}$/)
  if (hex) return Number.parseInt(trimmed.slice(7, 9), 16) / 255
  return normalizeColorValue(trimmed) ? 1 : undefined
}

export function isTransparentColor(value: string | undefined): boolean {
  const alpha = colorAlpha(value)
  return alpha !== undefined && alpha <= 0.001
}

export function isContextDependentColor(value: string | undefined): boolean {
  const alpha = colorAlpha(value)
  return alpha !== undefined && alpha < 0.999
}

function borderColor(value: string): string | undefined {
  return value.match(/(transparent|(?:rgba?|hsla?|oklch|oklab|hsl|lab|lch)\([^)]+\)|#[\da-f]{3,8})\s*$/i)?.[1]
}

function colorsEqual(first: string | undefined, second: string | undefined): boolean {
  if (!first || !second) return false
  const normalizedFirst = normalizeColorValue(first)
  const normalizedSecond = normalizeColorValue(second)
  if (normalizedFirst && normalizedSecond) return normalizedFirst === normalizedSecond
  return first.trim().toLowerCase() === second.trim().toLowerCase()
}

export function hasVisibleBorder(value: string | undefined): boolean {
  if (!value || /\b(?:none|hidden)\b/i.test(value)) return false
  const [width = 0] = numericDimensions(value)
  if (width <= 0) return false
  const color = borderColor(value)
  return !color || !isTransparentColor(color)
}

function hasNonzeroDimension(value: string | undefined): boolean {
  return numericDimensions(value).some((dimension) => Math.abs(dimension) > 0.01)
}

interface VisibleShadowLayer {
  blur: number
  inset: boolean
  offsetX: number
  offsetY: number
  spread: number
}

function visibleShadowLayers(value: string | undefined): VisibleShadowLayer[] {
  if (!value || value.trim().toLowerCase() === 'none') return []
  const layers: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1
    else if (value[index] === ')') depth = Math.max(0, depth - 1)
    else if (value[index] === ',' && depth === 0) {
      layers.push(value.slice(start, index))
      start = index + 1
    }
  }
  layers.push(value.slice(start))

  const colorPattern = /transparent|#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)/gi
  return layers.flatMap((layer) => {
    const colors = layer.match(colorPattern) || []
    if (colors.length > 0 && colors.every((color) => isTransparentColor(color))) return []
    const geometry = layer
      .replace(colorPattern, ' ')
      .replace(/\binset\b/gi, ' ')
      .match(/-?(?:\d+(?:\.\d+)?|\.\d+)(?:[a-z%]+)?/gi)
    if (!geometry || geometry.length < 2) return []
    const lengths = geometry.slice(0, 4).map((dimension) => Number.parseFloat(dimension))
    const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = lengths
    if (Math.abs(offsetX) <= 0.01 && Math.abs(offsetY) <= 0.01 && blur <= 0.01 && spread <= 0.01) return []
    return [{ blur, inset: /\binset\b/i.test(layer), offsetX, offsetY, spread }]
  })
}

function isCrispEdgeShadowLayer(layer: VisibleShadowLayer): boolean {
  if (layer.blur > 0.01) return false
  if (layer.inset || layer.spread > 0.01) return true
  return Math.max(Math.abs(layer.offsetX), Math.abs(layer.offsetY)) <= 1.01
}

export function hasVisibleShadow(value: string | undefined): boolean {
  return visibleShadowLayers(value).length > 0
}

/** A zero-blur outline or separator painted with box-shadow rather than a CSS border. */
export function hasCrispEdgeShadow(value: string | undefined): boolean {
  return visibleShadowLayers(value).some(isCrispEdgeShadowLayer)
}

/** A shadow that conveys spatial depth rather than only painting a crisp edge. */
export function hasDepthShadow(value: string | undefined): boolean {
  return visibleShadowLayers(value).some((layer) => !isCrispEdgeShadowLayer(layer))
}

export function classifyCardStyle(styles: Readonly<Record<string, string>>): string {
  const radius = Math.max(0, ...numericDimensions(styles.borderRadius))
  const corner = radius > 0 ? `r${Number(radius.toFixed(2))}` : 'square'
  const surface = hasDepthShadow(styles.boxShadow)
    ? 'elevated'
    : hasVisibleBorder(styles.border) || hasCrispEdgeShadow(styles.boxShadow)
      ? 'outlined'
      : 'flat'
  return `${surface}-${corner}`
}

export function isPillRadius(
  styles: Readonly<Record<string, string>>,
  context: Pick<ComponentVariantContext, 'heightPx'> = {},
): boolean {
  const radius = styles.borderRadius || ''
  const dimensions = numericDimensions(radius)
  const maximumRadius = dimensions.length > 0 ? Math.max(...dimensions) : 0
  if (/%/.test(radius) || maximumRadius >= 999 || maximumRadius >= 64) return true
  return Boolean(context.heightPx && context.heightPx > 0 && maximumRadius >= Math.max(12, context.heightPx / 2 - 1))
}

export function isOutlinedButton(styles: Readonly<Record<string, string>>): boolean {
  const background = styles.backgroundColor
  return hasVisibleBorder(styles.border) && (!background || isContextDependentColor(background))
}

function classifyButtonStyleFamily(candidate: ComponentVariantCandidate): string {
  const corner = isPillRadius(candidate.styles, candidate)
    ? 'pill'
    : hasNonzeroDimension(candidate.styles.borderRadius)
      ? 'rounded'
      : 'sharp'
  const background = candidate.styles.backgroundColor
  const backgroundAlpha = colorAlpha(background)
  const visibleBorder = hasVisibleBorder(candidate.styles.border)
  const observedBorderColor = candidate.styles.border ? borderColor(candidate.styles.border) : undefined
  const matchesKnownSurface = candidate.surfaceColors?.some((color) => colorsEqual(background, color)) ?? false
  const borderMatchesFill = colorsEqual(background, observedBorderColor)
  const surface =
    !background || isTransparentColor(background)
      ? visibleBorder
        ? 'outlined'
        : 'flat'
      : backgroundAlpha !== undefined && backgroundAlpha < MIN_MEANINGFUL_TINT_ALPHA
        ? visibleBorder
          ? 'outlined'
          : 'flat'
        : backgroundAlpha !== undefined && backgroundAlpha < 0.5
          ? 'tinted'
          : visibleBorder && matchesKnownSurface && !borderMatchesFill
            ? 'outlined'
            : 'filled'
  return `${corner}-${surface}${hasDepthShadow(candidate.styles.boxShadow) ? '-shadowed' : ''}`
}

function isIconSized(styles: Record<string, string>, context: ComponentVariantContext): boolean {
  const { widthPx, heightPx } = context
  const hasKnownGeometry = widthPx !== undefined && heightPx !== undefined && widthPx > 0 && heightPx > 0
  const hasSquareGeometry =
    hasKnownGeometry && Math.max(widthPx, heightPx) <= 64 && widthPx / heightPx >= 0.75 && widthPx / heightPx <= 1.33
  const fullyRounded = isPillRadius(styles, context)
  const hasHorizontalPadding = (() => {
    const values = numericDimensions(styles.padding)
    if (values.length === 0) return false
    if (values.length === 1) return values[0] > 0
    return (values[1] || 0) > 0 || (values[3] || values[1] || 0) > 0
  })()
  return (
    (hasSquareGeometry && (fullyRounded || !hasHorizontalPadding)) ||
    (!hasKnownGeometry && fullyRounded && !hasHorizontalPadding)
  )
}

export function classifyComponentVariant(
  type: ComponentType,
  styles: Record<string, string>,
  context: ComponentVariantContext = {},
): ComponentVariant | undefined {
  if (type !== 'button') return undefined
  if (context.role === 'destructive-action') return 'destructive'
  const background = styles.backgroundColor
  const transparent = !background || isTransparentColor(background)
  const alpha = colorAlpha(background)
  const normalizedBackground = background ? normalizeColorValue(background) : null
  const normalizedPrimary = context.primaryColor ? normalizeColorValue(context.primaryColor) : null
  const referencesPrimaryFill =
    !transparent &&
    (alpha === undefined || alpha >= 0.5) &&
    (context.tokenRefs?.includes('color.primary') ||
      Boolean(normalizedBackground && normalizedPrimary && normalizedBackground === normalizedPrimary))
  const hasPrimarySemanticRole = /^(?:primary|main|cta)(?:-action)?$/i.test(context.role || '')

  const iconSized = isIconSized(styles, context)
  const compactIconGeometry =
    context.widthPx !== undefined && context.heightPx !== undefined && Math.max(context.widthPx, context.heightPx) <= 36

  // Very compact square geometry wins even when an accessible label describes a primary action.
  // Larger semantically primary circles may still be text-bearing floating action controls.
  if (iconSized && (!hasPrimarySemanticRole || compactIconGeometry)) return 'icon'

  // Semantic labels identify intent, but they cannot turn a transparent compound-control segment
  // into a visually filled primary button.
  if (hasPrimarySemanticRole && (referencesPrimaryFill || (!transparent && alpha !== undefined && alpha >= 0.5))) {
    return 'primary'
  }
  if (iconSized) return 'icon'
  if (referencesPrimaryFill) return 'primary'
  if (transparent) return hasVisibleBorder(styles.border) ? 'secondary' : 'text'

  if (alpha !== undefined && alpha < 0.5) return 'secondary'
  const referencesPrimary =
    context.tokenRefs?.includes('color.primary') ||
    Boolean(normalizedBackground && normalizedPrimary === normalizedBackground)
  return referencesPrimary || (!context.primaryColor && !context.tokenRefs) ? 'primary' : 'secondary'
}

function representativeStyleRank(type: ComponentType, styles: Record<string, string>): number {
  const variant = classifyComponentVariant(type, styles)
  if (type === 'button') return { primary: 5, destructive: 4, secondary: 3, icon: 2, text: 1 }[variant || 'text']
  return [
    styles.backgroundColor && !isTransparentColor(styles.backgroundColor),
    hasVisibleBorder(styles.border),
    hasNonzeroDimension(styles.borderRadius),
    hasNonzeroDimension(styles.padding),
    hasVisibleShadow(styles.boxShadow),
  ].filter(Boolean).length
}

function representativeDetailScore(styles: Record<string, string>): number {
  let score = 0
  if (styles.fontSize) score += 1
  if (styles.fontWeight && !/^(?:400|normal)$/.test(styles.fontWeight)) score += 1
  if (/^(?:flex|inline-flex|grid|inline-grid)$/.test(styles.display || '')) score += 1
  if (styles.gap && styles.gap !== 'normal' && hasNonzeroDimension(styles.gap)) score += 1
  return score
}

function selectRepresentativeStyles(
  type: ComponentType,
  candidates: ComponentCandidate[],
  prioritizeSemanticRank = true,
): Record<string, string> {
  const groups = new Map<string, { count: number; candidate: ComponentCandidate; rank: number; detail: number }>()

  for (const candidate of candidates) {
    const key = JSON.stringify(candidate.styles)
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      if (candidate.confidence > existing.candidate.confidence) existing.candidate = candidate
    } else {
      groups.set(key, {
        count: 1,
        candidate,
        rank: prioritizeSemanticRank ? representativeStyleRank(type, candidate.styles) : 0,
        detail: representativeDetailScore(candidate.styles),
      })
    }
  }

  const representative = [...groups.values()].sort(
    (a, b) =>
      b.rank - a.rank ||
      b.count - a.count ||
      b.detail - a.detail ||
      b.candidate.confidence - a.candidate.confidence ||
      JSON.stringify(a.candidate.styles).localeCompare(JSON.stringify(b.candidate.styles)),
  )[0]
  return representative?.candidate.styles || {}
}

export function summarizeComponentCandidates(candidates: ComponentCandidate[]): ComponentPattern[] {
  const patterns: ComponentPattern[] = []

  for (const type of COMPONENT_ORDER) {
    const matches = candidates.filter((candidate) => candidate.type === type)
    if (matches.length === 0) continue

    const confidence = matches.reduce((sum, candidate) => sum + candidate.confidence, 0) / matches.length
    patterns.push({
      type,
      count: matches.length,
      selectors: COMPONENT_SELECTORS[type],
      styles: selectRepresentativeStyles(type, matches),
      confidence: Math.round(confidence * 100) / 100,
      evidence: [...new Set(matches.flatMap((candidate) => candidate.evidence))].sort(),
    })
  }

  return patterns
}

const COMPONENT_VARIANT_ORDER: ReadonlyArray<ComponentVariant | undefined> = [
  'primary',
  'destructive',
  'secondary',
  'text',
  'icon',
  undefined,
]

export function summarizeComponentVariants(candidates: ComponentVariantCandidate[]): ComponentVariantPattern[] {
  // Tiny semantic elements are retained in raw evidence, but they are not useful as reusable controls in DESIGN.md.
  // Filtering by rendered geometry avoids promoting decorative dots or nested hit-area fragments as icon buttons.
  const reusableCandidates = candidates.filter(
    (candidate) =>
      candidate.type !== 'button' ||
      candidate.widthPx === undefined ||
      candidate.heightPx === undefined ||
      (candidate.widthPx >= 12 && candidate.heightPx >= 12),
  )
  const groups = new Map<
    string,
    {
      type: ComponentType
      variant?: ComponentVariant
      size?: 'sm' | 'md' | 'lg'
      semanticRole?: string
      cardStyle?: string
      buttonStyle?: string
      candidates: ComponentVariantCandidate[]
    }
  >()
  const cardStyles = new Set(
    reusableCandidates
      .filter((candidate) => candidate.type === 'card')
      .map((candidate) => classifyCardStyle(candidate.styles)),
  )
  const sizeVariants = new Map<string, Set<string>>()
  const buttonStyles = new Map<string, Set<string>>()
  for (const candidate of reusableCandidates) {
    if (candidate.type !== 'button') continue
    const variant = classifyComponentVariant(candidate.type, candidate.styles, candidate)
    const key = `${candidate.type}|${variant || ''}`
    const styles = buttonStyles.get(key) || new Set<string>()
    styles.add(classifyButtonStyleFamily(candidate))
    buttonStyles.set(key, styles)
    if (candidate.heightPx) {
      const size = candidate.heightPx <= 36 ? 'sm' : candidate.heightPx <= 48 ? 'md' : 'lg'
      const sizes = sizeVariants.get(key) || new Set<string>()
      sizes.add(size)
      sizeVariants.set(key, sizes)
    }
  }
  for (const candidate of reusableCandidates) {
    const variant = classifyComponentVariant(candidate.type, candidate.styles, candidate)
    const measuredSize =
      candidate.type === 'button' && candidate.heightPx
        ? candidate.heightPx <= 36
          ? 'sm'
          : candidate.heightPx <= 48
            ? 'md'
            : 'lg'
        : undefined
    const size = (sizeVariants.get(`${candidate.type}|${variant || ''}`)?.size || 0) > 1 ? measuredSize : undefined
    const semanticRole = candidate.type === 'status' ? candidate.role : undefined
    const cardStyle = candidate.type === 'card' ? classifyCardStyle(candidate.styles) : undefined
    const buttonStyleKey = `${candidate.type}|${variant || ''}`
    const buttonStyle =
      candidate.type === 'button' && (buttonStyles.get(buttonStyleKey)?.size || 0) > 1
        ? classifyButtonStyleFamily(candidate)
        : undefined
    const key = `${candidate.type}|${variant || ''}|${size || ''}|${semanticRole || ''}|${cardStyle || ''}|${buttonStyle || ''}`
    const group = groups.get(key) || {
      type: candidate.type,
      variant,
      size,
      semanticRole,
      cardStyle,
      buttonStyle,
      candidates: [],
    }
    group.candidates.push(candidate)
    groups.set(key, group)
  }

  return [...groups.values()]
    .flatMap((group) => {
      if (group.candidates.length === 0) return []
      const confidence =
        group.candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / group.candidates.length
      const measuredCandidates = group.candidates
        .filter((candidate): candidate is ComponentVariantCandidate & { widthPx: number; heightPx: number } =>
          Boolean(candidate.widthPx && candidate.heightPx),
        )
        .sort((first, second) => first.widthPx * first.heightPx - second.widthPx * second.heightPx)
      const sample = measuredCandidates[Math.floor(measuredCandidates.length / 2)]
      return [
        {
          type: group.type,
          count: group.candidates.length,
          selectors: COMPONENT_SELECTORS[group.type],
          styles: selectRepresentativeStyles(group.type, group.candidates, group.variant === undefined),
          confidence: Math.round(confidence * 100) / 100,
          evidence: [...new Set(group.candidates.flatMap((candidate) => candidate.evidence))].sort(),
          name:
            group.semanticRole ||
            [
              group.type,
              group.variant,
              group.size,
              group.buttonStyle,
              group.type === 'card' && cardStyles.size > 1 ? group.cardStyle : undefined,
            ]
              .filter(Boolean)
              .join('-'),
          ...(group.variant ? { variant: group.variant } : {}),
          ...(group.semanticRole ? { semanticRole: group.semanticRole } : {}),
          ...(sample ? { sampleSize: { width: Math.round(sample.widthPx), height: Math.round(sample.heightPx) } } : {}),
          elementKinds: [...new Set(group.candidates.flatMap((candidate) => candidate.elementKind || []))].sort(),
        },
      ]
    })
    .sort(
      (first, second) =>
        COMPONENT_ORDER.indexOf(first.type) - COMPONENT_ORDER.indexOf(second.type) ||
        COMPONENT_VARIANT_ORDER.indexOf(first.variant) - COMPONENT_VARIANT_ORDER.indexOf(second.variant) ||
        first.name.localeCompare(second.name),
    )
}

export function mergeComponentPatterns(patternGroups: ComponentPattern[][]): ComponentPattern[] {
  return COMPONENT_ORDER.flatMap((type) => {
    const patterns = patternGroups.flat().filter((pattern) => pattern.type === type)
    if (patterns.length === 0) return []
    const count = patterns.reduce((sum, pattern) => sum + pattern.count, 0)
    const representative = [...patterns].sort(
      (first, second) =>
        representativeStyleRank(type, second.styles) - representativeStyleRank(type, first.styles) ||
        second.count - first.count ||
        representativeDetailScore(second.styles) - representativeDetailScore(first.styles) ||
        second.confidence - first.confidence ||
        JSON.stringify(first.styles).localeCompare(JSON.stringify(second.styles)),
    )[0]
    const confidence = patterns.reduce((sum, pattern) => sum + pattern.confidence * pattern.count, 0) / count
    return [
      {
        type,
        count,
        selectors: [...new Set(patterns.flatMap((pattern) => pattern.selectors))],
        styles: representative.styles,
        confidence: Math.round(confidence * 100) / 100,
        evidence: [...new Set(patterns.flatMap((pattern) => pattern.evidence))].sort(),
      },
    ]
  })
}

/**
 * Detect common UI component patterns from visible DOM semantics and visual evidence.
 * Native HTML and ARIA candidates carry stronger confidence than class-name or card heuristics.
 */
export async function detectComponents(page: Page): Promise<ComponentPattern[]> {
  const candidates = await page.evaluate(() => {
    type BrowserComponentType = 'button' | 'card' | 'navigation' | 'input' | 'table' | 'modal' | 'list'

    interface BrowserCandidate {
      type: BrowserComponentType
      confidence: number
      evidence: string[]
      styles: Record<string, string>
    }

    const candidatesByType = new Map<BrowserComponentType, Map<Element, BrowserCandidate>>()
    const computedStyleCache = new WeakMap<Element, CSSStyleDeclaration>()
    const visibilityCache = new WeakMap<Element, boolean>()
    const signatureCache = new WeakMap<Element, string>()
    const siblingSignatureCountCache = new WeakMap<Element, Map<string, number>>()

    const computedStyleFor = (element: Element): CSSStyleDeclaration => {
      const cached = computedStyleCache.get(element)
      if (cached) return cached

      const computed = getComputedStyle(element)
      computedStyleCache.set(element, computed)
      return computed
    }

    const isVisible = (element: Element): boolean => {
      const cached = visibilityCache.get(element)
      if (cached !== undefined) return cached

      const computed = computedStyleFor(element)
      const hiddenByAttribute = Boolean(element.closest('[hidden], [aria-hidden="true"], [inert]'))
      const rect = element.getBoundingClientRect()
      const visible =
        !hiddenByAttribute &&
        computed.display !== 'none' &&
        computed.visibility !== 'hidden' &&
        computed.visibility !== 'collapse' &&
        parseFloat(computed.opacity || '1') > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        element.getClientRects().length > 0

      visibilityCache.set(element, visible)
      return visible
    }

    const stylesFor = (type: BrowserComponentType, element: Element): Record<string, string> => {
      const computed = computedStyleFor(element)

      if (type === 'button') {
        return {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          borderRadius: computed.borderRadius,
          padding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
        }
      }
      if (type === 'card') {
        return {
          backgroundColor: computed.backgroundColor,
          borderRadius: computed.borderRadius,
          boxShadow: computed.boxShadow,
          border: `${computed.borderTopWidth} ${computed.borderTopStyle} ${computed.borderTopColor}`,
          padding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
        }
      }
      if (type === 'navigation') {
        return {
          backgroundColor: computed.backgroundColor,
          display: computed.display,
          gap: computed.gap,
        }
      }
      if (type === 'input') {
        return {
          backgroundColor: computed.backgroundColor,
          border: `${computed.borderTopWidth} ${computed.borderTopStyle} ${computed.borderTopColor}`,
          borderRadius: computed.borderRadius,
          padding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
          fontSize: computed.fontSize,
        }
      }
      return {}
    }

    const addCandidate = (
      type: BrowserComponentType,
      element: Element,
      confidence: number,
      evidence: string[],
    ): void => {
      if (!isVisible(element)) return

      let candidates = candidatesByType.get(type)
      if (!candidates) {
        candidates = new Map()
        candidatesByType.set(type, candidates)
      }

      const existing = candidates.get(element)
      if (existing) {
        existing.confidence = Math.max(existing.confidence, confidence)
        existing.evidence = [...new Set([...existing.evidence, ...evidence])]
        return
      }

      candidates.set(element, {
        type,
        confidence,
        evidence,
        styles: stylesFor(type, element),
      })
    }

    const visualInputRoot = (source: Element): Element => {
      const sourceRect = source.getBoundingClientRect()
      const sourceStyle = computedStyleFor(source)
      const transparent = (color: string) =>
        color === 'transparent' || /^rgba?\([^)]*(?:,|\/)\s*0(?:\.0+)?\s*\)$/i.test(color.trim())
      let ancestor = source.parentElement
      for (let depth = 0; ancestor && depth < 3; depth += 1, ancestor = ancestor.parentElement) {
        if (!isVisible(ancestor)) continue
        const rect = ancestor.getBoundingClientRect()
        const computed = computedStyleFor(ancestor)
        const reasonableBounds =
          rect.width >= sourceRect.width &&
          rect.height >= sourceRect.height &&
          rect.width <= Math.max(sourceRect.width * 1.8, sourceRect.width + 160) &&
          rect.height <= Math.max(sourceRect.height * 3, 72)
        const paintedBorder =
          Number.parseFloat(computed.borderTopWidth || '0') > 0 && !['none', 'hidden'].includes(computed.borderTopStyle)
        const rounded = Number.parseFloat(computed.borderTopLeftRadius || '0') > 0
        const shadowed = computed.boxShadow !== 'none'
        const distinctBackground =
          !transparent(computed.backgroundColor) && computed.backgroundColor !== sourceStyle.backgroundColor
        const addsVisibleBounds = rect.width > sourceRect.width + 2 || rect.height > sourceRect.height + 2
        if (reasonableBounds && addsVisibleBounds && (paintedBorder || rounded || shadowed || distinctBackground)) {
          return ancestor
        }
      }
      return source
    }

    const collect = (
      type: BrowserComponentType,
      selector: string,
      confidence: number,
      evidence: string[],
      predicate: (element: Element) => boolean = () => true,
      resolveElement: (element: Element) => Element = (element) => element,
    ): void => {
      for (const element of document.querySelectorAll(selector)) {
        if (predicate(element)) addCandidate(type, resolveElement(element), confidence, evidence)
      }
    }

    collect('button', 'button, input[type="button"], input[type="submit"], input[type="reset"]', 0.98, [
      'native-element',
    ])
    collect('button', '[role="button"]', 0.9, ['aria-role'])
    collect(
      'button',
      'a.btn, a.button, .btn, .button',
      0.65,
      ['class-name', 'interactive-behavior'],
      (element) =>
        element.matches('a[href], button, input') ||
        element.hasAttribute('onclick') ||
        element.getAttribute('tabindex') === '0',
    )

    collect('navigation', 'nav', 0.98, ['native-element'])
    collect('navigation', '[role="navigation"]', 0.9, ['aria-role'])

    collect(
      'input',
      'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select',
      0.98,
      ['native-element'],
      () => true,
      visualInputRoot,
    )
    collect(
      'input',
      '[role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]',
      0.88,
      ['aria-role'],
      () => true,
      visualInputRoot,
    )

    collect('table', 'table', 0.98, ['native-element'])
    collect('table', '[role="table"]', 0.9, ['aria-role'])
    collect('table', '[role="grid"], [role="treegrid"]', 0.82, ['aria-grid-role'])

    collect('modal', 'dialog', 0.98, ['native-element'])
    collect('modal', '[role="dialog"], [role="alertdialog"]', 0.9, ['aria-role'])
    collect(
      'modal',
      '.modal, [class*="modal"], [class*="Modal"]',
      0.65,
      ['class-name', 'overlay-position'],
      (element) => {
        const computed = computedStyleFor(element)
        return (
          element.getAttribute('aria-modal') === 'true' ||
          ((computed.position === 'fixed' || computed.position === 'absolute') && computed.zIndex !== 'auto')
        )
      },
    )

    collect('list', 'ul, ol', 0.98, ['native-element'])
    collect('list', '[role="list"]', 0.9, ['aria-role'])

    const isTransparent = (color: string): boolean =>
      color === 'transparent' || color === 'rgba(0, 0, 0, 0)' || color.endsWith(', 0)')

    const structuralSignature = (element: Element): string => {
      const cached = signatureCache.get(element)
      if (cached) return cached

      const classNames = [...element.classList]
        .filter((className) => className.length <= 48)
        .sort()
        .slice(0, 3)
        .join('.')
      const childTags = [...element.children]
        .slice(0, 5)
        .map((child) => child.tagName)
        .join(',')
      const signature = `${element.tagName}|${classNames}|${childTags}`
      signatureCache.set(element, signature)
      return signature
    }

    const repeatedSiblingCount = (element: Element): number => {
      const parent = element.parentElement
      if (!parent) return 1

      let signatureCounts = siblingSignatureCountCache.get(parent)
      if (!signatureCounts) {
        signatureCounts = new Map()
        for (const sibling of parent.children) {
          if (!isVisible(sibling)) continue
          const signature = structuralSignature(sibling)
          signatureCounts.set(signature, (signatureCounts.get(signature) || 0) + 1)
        }
        siblingSignatureCountCache.set(parent, signatureCounts)
      }

      return signatureCounts.get(structuralSignature(element)) || 0
    }

    const excludedCardTags = new Set([
      'HTML',
      'BODY',
      'MAIN',
      'NAV',
      'HEADER',
      'FOOTER',
      'FORM',
      'UL',
      'OL',
      'TABLE',
      'DIALOG',
      'BUTTON',
      'INPUT',
      'TEXTAREA',
      'SELECT',
    ])
    const allElements = [...document.querySelectorAll('body *')].slice(0, 10_000)

    for (const element of allElements) {
      if (excludedCardTags.has(element.tagName) || !isVisible(element)) continue

      const computed = computedStyleFor(element)
      const rect = element.getBoundingClientRect()
      if (rect.width < 120 || rect.height < 72) continue
      const isFullWidthPageSection =
        rect.width >= window.innerWidth * 0.9 &&
        Boolean(element.matches('main > section, main > article, [role="region"]'))
      if (isFullWidthPageSection) continue

      const radii = [
        computed.borderTopLeftRadius,
        computed.borderTopRightRadius,
        computed.borderBottomRightRadius,
        computed.borderBottomLeftRadius,
      ].map((value) => parseFloat(value) || 0)
      const hasRadius = Math.max(...radii) > 4
      const hasShadow = computed.boxShadow !== 'none'
      const hasBorder =
        [computed.borderTopWidth, computed.borderRightWidth, computed.borderBottomWidth, computed.borderLeftWidth]
          .map((value) => parseFloat(value) || 0)
          .some((width) => width > 0) && computed.borderStyle !== 'none'
      const paddings = [computed.paddingTop, computed.paddingRight, computed.paddingBottom, computed.paddingLeft].map(
        (value) => parseFloat(value) || 0,
      )
      const hasPadding = Math.max(...paddings) >= 12
      if (!hasPadding || (!hasRadius && !hasShadow && !hasBorder)) continue

      const parentBackground = element.parentElement ? computedStyleFor(element.parentElement).backgroundColor : ''
      const hasDistinctSurface =
        !isTransparent(computed.backgroundColor) && computed.backgroundColor !== parentBackground
      const textLength = (element.textContent || '').replace(/\s+/g, ' ').trim().length
      const hasContent = textLength >= 12
      const hasStructure = element.children.length >= 2
      const hasMediaOrAction = Boolean(
        element.querySelector('img, picture, svg, button, a[href], [role="button"], input, textarea, select'),
      )
      const siblings = repeatedSiblingCount(element)
      const isRepeated = siblings >= 2
      const isLargeLayout = rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.5

      let confidence = 0
      const evidence: string[] = []
      if (hasRadius) {
        confidence += 0.16
        evidence.push('rounded-container')
      }
      if (hasShadow || hasBorder) {
        confidence += 0.22
        if (hasShadow) evidence.push('shadow-boundary')
        if (hasBorder) evidence.push('border-boundary')
      }
      if (hasPadding) {
        confidence += 0.16
        evidence.push('contained-spacing')
      }
      if (hasDistinctSurface) {
        confidence += 0.1
        evidence.push('distinct-surface')
      }
      if (hasContent) {
        confidence += 0.12
        evidence.push('content-region')
      }
      if (hasStructure) {
        confidence += 0.08
        evidence.push('structured-children')
      }
      if (isRepeated) {
        confidence += 0.12
        evidence.push('repeated-sibling-structure')
      }
      if (hasMediaOrAction) {
        confidence += 0.08
        evidence.push('media-or-action')
      }
      if (isLargeLayout) {
        confidence -= 0.2
        evidence.push('large-layout-penalty')
      }

      if (confidence >= 0.62) {
        addCandidate('card', element, Math.min(0.94, confidence), evidence)
      }
    }

    return [...candidatesByType.values()].flatMap((candidates) => [...candidates.values()])
  })

  return summarizeComponentCandidates(candidates)
}
