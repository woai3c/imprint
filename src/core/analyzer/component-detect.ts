import type { Page } from 'playwright-core'

import { isContextDependentRadius } from '../design-evidence/structural-styles.js'
import { normalizeColorValue } from './color-cluster.js'

export type ComponentType = 'button' | 'card' | 'navigation' | 'input' | 'table' | 'modal' | 'list' | 'tab' | 'status'

export interface ComponentStatusBoundary {
  strongVisualBoundary: boolean
  paintedFill: boolean
  paintedBorder: boolean
  paintedShadow: boolean
  directlyOwnedText: boolean
  widthPx: number
  heightPx: number
  viewportWidth: number
  viewportHeight: number
}

export interface ComponentCandidate {
  type: ComponentType
  confidence: number
  evidence: string[]
  styles: Record<string, string>
  /** The rendered owner used for foreground and typography measurements. */
  textStyleOwner?: 'root' | 'descendant'
  /** Geometry and paint facts used to keep broad live regions out of actionable status recipes. */
  statusBoundary?: ComponentStatusBoundary
}

export interface ComponentPattern {
  type: ComponentType
  count: number
  selectors: string[]
  styles: Record<string, string>
  confidence: number
  evidence: string[]
  /** Confidence that the representative style is reusable, separate from component identity confidence. */
  reuseConfidence?: number
  /** Instances whose complete observed style matches the representative style. */
  styleObservationCount?: number
  /** Evidence belonging to the complete representative style, excluding looser variant-group matches. */
  representativeEvidence?: string[]
  /** Canonical pages on which the representative style was observed. */
  pageCount?: number
  reuseScope?: 'isolated' | 'page-repeated' | 'cross-page'
  /** Semantic roles observed on instances that match the representative style. */
  roleCounts?: Record<string, number>
  /** Normalized complete observed style identity for canonical pattern grouping. */
  styleSignature?: string
  elementKinds?: string[]
  semanticRole?: string
  sampleSize?: { width: number; height: number }
  /** Representative instances that independently satisfy the bounded status-feedback contract. */
  statusBoundarySupport?: number
}

export type ComponentVariant = 'primary' | 'action' | 'secondary' | 'destructive' | 'text' | 'icon'

export interface ComponentVariantContext {
  tokenRefs?: readonly string[]
  primaryColor?: string
  surfaceColors?: readonly string[]
  role?: string
  widthPx?: number
  heightPx?: number
  elementKind?: string
  pageId?: string
  /** Whether the component boundary owns a visibly painted text label. */
  hasVisibleText?: boolean
}

export interface ComponentVariantCandidate extends ComponentCandidate, ComponentVariantContext {}

export interface ComponentVariantPattern extends ComponentPattern {
  name: string
  variant?: ComponentVariant
}

export interface ResolvedComponentReuseEvidence {
  reuseConfidence: number
  styleObservationCount: number
  pageCount: number
  reuseScope: NonNullable<ComponentPattern['reuseScope']>
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
  button: [
    'button',
    'input[type="button" i]',
    'input[type="submit" i]',
    'input[type="image" i]',
    'input[type="reset" i]',
    '[role="button"]',
  ],
  card: [],
  navigation: ['nav', '[role="navigation"]'],
  input: [
    'input:not([type="hidden" i]):not([type="button" i]):not([type="submit" i]):not([type="image" i]):not([type="reset" i])',
    'textarea',
    'select',
    '[role="textbox"]',
    '[role="combobox"]',
  ],
  table: ['table', '[role="table"]', '[role="grid"]'],
  modal: ['dialog', '[role="dialog"]', '[role="alertdialog"]'],
  list: ['ul', 'ol', '[role="list"]'],
  tab: ['[role="tab"]'],
  status: ['[role="status"]', '[role="alert"]', '[aria-live]:not([aria-live="off"])'],
}

const TEXT_STYLE_PROPERTIES = new Set(['color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'])
const TEXT_STYLE_COMPONENT_TYPES = new Set<ComponentType>(['button', 'input', 'tab', 'status'])
const CONTENT_SIZED_COMPONENT_TYPES = new Set<ComponentType>(['card', 'list', 'table', 'modal', 'status'])

/**
 * Keeps reusable component identity scoped to the DOM owner that actually paints each property.
 * Semantic wrappers do not own descendant typography, and content height is not a reusable container style.
 */
export function normalizeComponentStyleRecord(
  type: ComponentType,
  styles: Readonly<Record<string, string>>,
  textStyleOwner?: ComponentCandidate['textStyleOwner'],
): Record<string, string> {
  const ownsRenderedText = Boolean(textStyleOwner) && TEXT_STYLE_COMPONENT_TYPES.has(type)
  return Object.fromEntries(
    Object.entries(styles).filter(([property, value]) => {
      if (property === 'color' && !hasVisibleColor(value)) return false
      if (TEXT_STYLE_PROPERTIES.has(property)) return ownsRenderedText
      if (CONTENT_SIZED_COMPONENT_TYPES.has(type) && (property === 'height' || property === 'minHeight')) return false
      return true
    }),
  )
}

function numericDimensions(value: string | undefined): number[] {
  if (!value) return []
  return [...value.matchAll(/-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/gi)].map((match) => Number.parseFloat(match[0]))
}

function parsedAlphaToken(value: string): number | undefined {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'none') return 0
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)(%)?$/.exec(trimmed)
  if (!match) return undefined
  const alpha = Number.parseFloat(match[1])
  if (!Number.isFinite(alpha)) return undefined
  return match[2] ? alpha / 100 : alpha
}

function validColorComponent(value: string): boolean {
  return (
    value.toLowerCase() === 'none' ||
    /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?:%|deg|grad|rad|turn)?$/i.test(value)
  )
}

function functionalColorAlpha(value: string): number | undefined {
  const match = /^(rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch|color)\((.*)\)$/i.exec(value)
  if (!match || match[2].includes('(') || match[2].includes(')')) return undefined
  const functionName = match[1].toLowerCase()
  const body = match[2].trim()
  if (!body) return undefined

  if (body.includes(',')) {
    if (body.includes('/') || !['rgb', 'rgba', 'hsl', 'hsla'].includes(functionName)) return undefined
    const components = body.split(',').map((component) => component.trim())
    if (
      ![3, 4].includes(components.length) ||
      components.slice(0, 3).some((component) => !validColorComponent(component))
    ) {
      return undefined
    }
    return components.length === 4 ? parsedAlphaToken(components[3]) : 1
  }

  const slashParts = body.split('/')
  if (slashParts.length > 2) return undefined
  const components = slashParts[0].trim().split(/\s+/).filter(Boolean)
  if (functionName === 'color') {
    if (components.length !== 4 || !/^(?:--[\w-]+|[a-z][\w-]*)$/i.test(components[0])) return undefined
    if (components.slice(1).some((component) => !validColorComponent(component))) return undefined
  } else if (components.length !== 3 || components.some((component) => !validColorComponent(component))) {
    return undefined
  }
  return slashParts.length === 2 ? parsedAlphaToken(slashParts[1]) : 1
}

function colorAlpha(value: string | undefined): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'transparent') return 0
  if (/^#[\da-f]{4}$/.test(trimmed)) return Number.parseInt(trimmed[4], 16) / 15
  if (/^#[\da-f]{8}$/.test(trimmed)) return Number.parseInt(trimmed.slice(7, 9), 16) / 255
  if (/^#[\da-f]{3}$|^#[\da-f]{6}$/.test(trimmed)) return 1
  return functionalColorAlpha(trimmed)
}

/** True only when a supported color syntax proves non-zero painted alpha. */
export function hasVisibleColor(value: string | undefined): boolean {
  const alpha = colorAlpha(value)
  return alpha !== undefined && alpha > 0.001
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
  return value.match(/(transparent|(?:rgba?|hsla?|hsl|hwb|oklch|oklab|lab|lch|color)\([^)]+\)|#[\da-f]{3,8})\s*$/i)?.[1]
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
  const alpha = colorAlpha(color)
  return alpha !== undefined && alpha > 0.001
}

const COMPONENT_BORDER_PROPERTIES = ['border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft'] as const

function visibleComponentBorders(styles: Readonly<Record<string, string>>): string[] {
  return COMPONENT_BORDER_PROPERTIES.map((property) => styles[property]).filter((value): value is string =>
    hasVisibleBorder(value),
  )
}

function hasVisibleComponentBorder(styles: Readonly<Record<string, string>>): boolean {
  return visibleComponentBorders(styles).length > 0
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

  const colorPattern = /transparent|#[\da-f]{3,8}\b|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^)]*\)/gi
  return layers.flatMap((layer) => {
    const colors = layer.match(colorPattern) || []
    if (!colors.some((color) => (colorAlpha(color) || 0) > 0.001)) return []
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
  const corner = isContextDependentRadius(styles.borderRadius)
    ? 'rounded'
    : radius > 0
      ? `r${Number(radius.toFixed(2))}`
      : 'square'
  const surface = hasDepthShadow(styles.boxShadow)
    ? 'elevated'
    : hasVisibleComponentBorder(styles) || hasCrispEdgeShadow(styles.boxShadow)
      ? 'outlined'
      : 'flat'
  return `${surface}-${corner}`
}

export function isPillRadius(
  styles: Readonly<Record<string, string>>,
  context: Pick<ComponentVariantContext, 'heightPx'> = {},
): boolean {
  const radius = styles.borderRadius || ''
  if (isContextDependentRadius(radius)) return false
  const dimensions = numericDimensions(radius)
  const maximumRadius = dimensions.length > 0 ? Math.max(...dimensions) : 0
  if (/%/.test(radius) || maximumRadius >= 999 || maximumRadius >= 64) return true
  return Boolean(context.heightPx && context.heightPx > 0 && maximumRadius >= Math.max(12, context.heightPx / 2 - 1))
}

export function isOutlinedButton(styles: Readonly<Record<string, string>>): boolean {
  const background = styles.backgroundColor
  return hasVisibleComponentBorder(styles) && (!hasVisibleColor(background) || isContextDependentColor(background))
}

function classifyButtonStyleFamily(candidate: ComponentVariantCandidate): string {
  const corner = isPillRadius(candidate.styles, candidate)
    ? 'pill'
    : hasNonzeroDimension(candidate.styles.borderRadius)
      ? 'rounded'
      : 'sharp'
  const background = candidate.styles.backgroundColor
  const backgroundAlpha = colorAlpha(background)
  const visibleBorders = visibleComponentBorders(candidate.styles)
  const visibleBorder = visibleBorders.length > 0
  const observedBorderColor = visibleBorders[0] ? borderColor(visibleBorders[0]) : undefined
  const matchesKnownSurface = candidate.surfaceColors?.some((color) => colorsEqual(background, color)) ?? false
  const borderMatchesFill = colorsEqual(background, observedBorderColor)
  const surface = !hasVisibleColor(background)
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
  const transparent = !hasVisibleColor(background)
  const alpha = colorAlpha(background)
  const normalizedBackground = background ? normalizeColorValue(background) : null
  const normalizedPrimary = context.primaryColor ? normalizeColorValue(context.primaryColor) : null
  const referencesPrimaryFill =
    !transparent &&
    alpha !== undefined &&
    alpha >= 0.5 &&
    (context.tokenRefs?.includes('color.primary') ||
      Boolean(normalizedBackground && normalizedPrimary && normalizedBackground === normalizedPrimary))
  const hasPrimarySemanticRole = context.role === 'primary-action'

  const iconSized = isIconSized(styles, context)
  const hasVisibleText =
    context.hasVisibleText ?? Boolean(styles.fontFamily || styles.fontSize || styles.fontWeight || styles.lineHeight)
  const compactIconGeometry =
    context.widthPx !== undefined && context.heightPx !== undefined && Math.max(context.widthPx, context.heightPx) <= 36
  const squareIconGeometry =
    context.widthPx !== undefined &&
    context.heightPx !== undefined &&
    Math.max(context.widthPx, context.heightPx) <= 64 &&
    context.widthPx / context.heightPx >= 0.75 &&
    context.widthPx / context.heightPx <= 1.33

  // Very compact square geometry wins even when an accessible label describes a primary action.
  // Larger semantically primary circles may still be text-bearing floating action controls.
  if ((iconSized || squareIconGeometry) && !hasVisibleText && (!hasPrimarySemanticRole || compactIconGeometry)) {
    return 'icon'
  }

  // Semantic labels identify intent, but they cannot turn a transparent compound-control segment
  // into a visually filled primary button.
  if (hasPrimarySemanticRole && (referencesPrimaryFill || (!transparent && alpha !== undefined && alpha >= 0.5))) {
    return 'primary'
  }
  if ((iconSized || squareIconGeometry) && !hasVisibleText) return 'icon'
  if (referencesPrimaryFill) return 'action'
  if (transparent) return hasVisibleBorder(styles.border) ? 'action' : 'text'

  return 'action'
}

function classifyCatalogVariant(candidate: ComponentVariantCandidate): ComponentVariant | undefined {
  // Primary intent is evaluated as a consensus over the complete representative style below. Ignoring it during
  // grouping keeps identical ordinary and primary-action instances together instead of making each subgroup appear
  // semantically unanimous by construction.
  return classifyComponentVariant(candidate.type, candidate.styles, {
    ...candidate,
    hasVisibleText: Boolean(candidate.textStyleOwner),
    ...(candidate.role === 'primary-action' ? { role: 'action' } : {}),
  })
}

function promotedCatalogVariant(
  variant: ComponentVariant | undefined,
  candidates: readonly ComponentVariantCandidate[],
): ComponentVariant | undefined {
  if (variant !== 'action' || candidates.length === 0) return variant
  const primarySupport =
    candidates.filter((candidate) => candidate.role === 'primary-action').length / candidates.length
  const background = candidates[0].styles.backgroundColor
  const alpha = colorAlpha(background)
  return primarySupport >= 0.8 && hasVisibleColor(background) && alpha !== undefined && alpha >= 0.5
    ? 'primary'
    : variant
}

function representativeStyleRank(type: ComponentType, styles: Record<string, string>): number {
  const variant = classifyComponentVariant(type, styles)
  if (type === 'button') {
    return { primary: 6, destructive: 5, action: 4, secondary: 3, icon: 2, text: 1 }[variant || 'text']
  }
  return [
    hasVisibleColor(styles.backgroundColor),
    hasVisibleComponentBorder(styles),
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

interface RepresentativeStyleGroup {
  styles: Record<string, string>
  count: number
  pageCount: number
  candidates: Array<ComponentCandidate & { pageId?: string; role?: string }>
}

function styleSignature(styles: Record<string, string>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(styles).sort(([first], [second]) => first.localeCompare(second))),
  )
}

function selectRepresentativeStyleGroup(
  type: ComponentType,
  candidates: Array<ComponentCandidate & { pageId?: string }>,
  prioritizeSemanticRank = true,
): RepresentativeStyleGroup {
  const groups = new Map<
    string,
    {
      count: number
      candidate: ComponentCandidate & { pageId?: string }
      candidates: Array<ComponentCandidate & { pageId?: string; role?: string }>
      pageIds: Set<string>
      rank: number
      detail: number
    }
  >()

  for (const candidate of candidates) {
    const key = styleSignature(candidate.styles)
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      existing.candidates.push(candidate)
      if (candidate.pageId) existing.pageIds.add(candidate.pageId)
      if (candidate.confidence > existing.candidate.confidence) existing.candidate = candidate
    } else {
      groups.set(key, {
        count: 1,
        candidate,
        candidates: [candidate],
        pageIds: new Set(candidate.pageId ? [candidate.pageId] : []),
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
      styleSignature(a.candidate.styles).localeCompare(styleSignature(b.candidate.styles)),
  )[0]
  return {
    styles: representative?.candidate.styles || {},
    count: representative?.count || 0,
    pageCount: representative ? Math.max(1, representative.pageIds.size) : 0,
    candidates: representative?.candidates || [],
  }
}

function reuseEvidence(
  identityConfidence: number,
  totalCount: number,
  styleObservationCount: number,
  pageCount: number,
): Pick<ComponentPattern, 'reuseConfidence' | 'reuseScope'> {
  const agreement = totalCount > 0 ? styleObservationCount / totalCount : 0
  const support =
    styleObservationCount <= 1
      ? 0.25
      : pageCount >= 2
        ? Math.min(1, 0.75 + pageCount * 0.05)
        : Math.min(0.8, 0.5 + styleObservationCount * 0.1)
  return {
    reuseConfidence: Math.round(Math.min(identityConfidence, agreement * support) * 100) / 100,
    reuseScope: styleObservationCount <= 1 ? 'isolated' : pageCount >= 2 ? 'cross-page' : 'page-repeated',
  }
}

function roleCountsFor(candidates: ReadonlyArray<{ role?: string }>): Record<string, number> | undefined {
  const counts = new Map<string, number>()
  for (const candidate of candidates) {
    const role = candidate.role?.trim()
    if (role) counts.set(role, (counts.get(role) || 0) + 1)
  }
  return counts.size > 0
    ? Object.fromEntries([...counts.entries()].sort(([first], [second]) => first.localeCompare(second)))
    : undefined
}

export function resolveComponentReuseEvidence(pattern: ComponentPattern): ResolvedComponentReuseEvidence {
  const styleObservationCount = pattern.styleObservationCount ?? pattern.count
  const pageCount = pattern.pageCount || 1
  const inferred = reuseEvidence(pattern.confidence, pattern.count, styleObservationCount, pageCount)
  return {
    reuseConfidence: pattern.reuseConfidence ?? inferred.reuseConfidence ?? 0,
    styleObservationCount,
    pageCount,
    reuseScope: pattern.reuseScope || inferred.reuseScope || 'isolated',
  }
}

export function isReusableComponentPattern(pattern: ComponentPattern): boolean {
  const reuse = resolveComponentReuseEvidence(pattern)
  return reuse.styleObservationCount >= 2 && reuse.reuseConfidence >= 0.55
}

/** A live region is reusable feedback only when its observed boundary is visually and geometrically bounded. */
export function hasActionableStatusBoundary(boundary: ComponentStatusBoundary | undefined): boolean {
  if (!boundary) return false
  const independentlyStrong = boundary.paintedFill || boundary.paintedBorder || boundary.paintedShadow
  if (boundary.strongVisualBoundary !== independentlyStrong) return false
  const viewportWidth = Math.max(1, boundary.viewportWidth)
  const viewportHeight = Math.max(1, boundary.viewportHeight)
  const width = Math.max(0, boundary.widthPx)
  const height = Math.max(0, boundary.heightPx)
  const areaRatio = (width * height) / (viewportWidth * viewportHeight)
  const bounded = height <= Math.min(240, viewportHeight * 0.45) && areaRatio <= 0.4
  const compact = height <= Math.min(160, viewportHeight * 0.25) && areaRatio <= 0.2
  const compactWidth = width <= Math.min(720, viewportWidth * 0.8)
  return bounded && (boundary.strongVisualBoundary || (boundary.directlyOwnedText && compact && compactWidth))
}

export function summarizeComponentCandidates(candidates: ComponentCandidate[]): ComponentPattern[] {
  const patterns: ComponentPattern[] = []

  for (const type of COMPONENT_ORDER) {
    const matches = candidates
      .filter((candidate) => candidate.type === type)
      .map((candidate) => ({
        ...candidate,
        styles: normalizeComponentStyleRecord(candidate.type, candidate.styles, candidate.textStyleOwner),
      }))
    if (matches.length === 0) continue

    const confidence = matches.reduce((sum, candidate) => sum + candidate.confidence, 0) / matches.length
    const roundedConfidence = Math.round(confidence * 100) / 100
    const representative = selectRepresentativeStyleGroup(type, matches)
    patterns.push({
      type,
      count: matches.length,
      selectors: COMPONENT_SELECTORS[type],
      styles: representative.styles,
      confidence: roundedConfidence,
      styleObservationCount: representative.count,
      representativeEvidence: [...new Set(representative.candidates.flatMap((candidate) => candidate.evidence))].sort(),
      pageCount: representative.pageCount,
      ...reuseEvidence(roundedConfidence, matches.length, representative.count, representative.pageCount),
      evidence: [...new Set(matches.flatMap((candidate) => candidate.evidence))].sort(),
    })
  }

  return patterns
}

const COMPONENT_VARIANT_ORDER: ReadonlyArray<ComponentVariant | undefined> = [
  'primary',
  'destructive',
  'action',
  'secondary',
  'text',
  'icon',
  undefined,
]

function semanticComponentSubtype(candidate: ComponentVariantCandidate): string | undefined {
  const role = candidate.role?.trim().toLowerCase()
  if (candidate.type === 'input') {
    if (role === 'searchbox' || role === 'search') return 'search'
    if (role === 'combobox' || role === 'listbox') return 'combobox'
    if (role === 'spinbutton') return 'number'
    if (role === 'textbox' || !role) return 'text'
    return role.replace(/[^a-z0-9-]+/g, '-')
  }
  if (candidate.type === 'modal') return role === 'alertdialog' ? 'alert' : 'default'
  return undefined
}

export function summarizeComponentVariants(candidates: ComponentVariantCandidate[]): ComponentVariantPattern[] {
  // Tiny semantic elements are retained in raw evidence, but they are not useful as reusable controls in DESIGN.md.
  // Filtering by rendered geometry avoids promoting decorative dots or nested hit-area fragments as icon buttons.
  const reusableCandidates = candidates
    .filter(
      (candidate) =>
        candidate.type !== 'button' ||
        candidate.widthPx === undefined ||
        candidate.heightPx === undefined ||
        (candidate.widthPx >= 12 && candidate.heightPx >= 12),
    )
    .map((candidate) => ({
      ...candidate,
      styles: normalizeComponentStyleRecord(candidate.type, candidate.styles, candidate.textStyleOwner),
    }))
  const groups = new Map<
    string,
    {
      type: ComponentType
      variant?: ComponentVariant
      size?: 'sm' | 'md' | 'lg'
      semanticRole?: string
      semanticSubtype?: string
      cardStyle?: string
      buttonStyle?: string
      styleSignature: string
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
    const variant = classifyCatalogVariant(candidate)
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
    const variant = classifyCatalogVariant(candidate)
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
    const semanticSubtype = semanticComponentSubtype(candidate)
    const cardStyle = candidate.type === 'card' ? classifyCardStyle(candidate.styles) : undefined
    const buttonStyleKey = `${candidate.type}|${variant || ''}`
    const buttonStyle =
      candidate.type === 'button' && (buttonStyles.get(buttonStyleKey)?.size || 0) > 1
        ? classifyButtonStyleFamily(candidate)
        : undefined
    const completeStyleSignature = styleSignature(candidate.styles)
    const key = `${candidate.type}|${variant || ''}|${size || ''}|${semanticRole || ''}|${semanticSubtype || ''}|${cardStyle || ''}|${buttonStyle || ''}|${completeStyleSignature}`
    const group = groups.get(key) || {
      type: candidate.type,
      variant,
      size,
      semanticRole,
      semanticSubtype,
      cardStyle,
      buttonStyle,
      styleSignature: completeStyleSignature,
      candidates: [],
    }
    group.candidates.push(candidate)
    groups.set(key, group)
  }

  const patterns = [...groups.values()]
    .flatMap((group) => {
      if (group.candidates.length === 0) return []
      const confidence =
        group.candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / group.candidates.length
      const roundedConfidence = Math.round(confidence * 100) / 100
      const catalogVariant = promotedCatalogVariant(group.variant, group.candidates)
      const representative = selectRepresentativeStyleGroup(group.type, group.candidates, group.variant === undefined)
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
          styles: representative.styles,
          confidence: roundedConfidence,
          styleObservationCount: representative.count,
          representativeEvidence: [
            ...new Set(representative.candidates.flatMap((candidate) => candidate.evidence)),
          ].sort(),
          pageCount: representative.pageCount,
          styleSignature: group.styleSignature,
          ...reuseEvidence(roundedConfidence, group.candidates.length, representative.count, representative.pageCount),
          evidence: [...new Set(group.candidates.flatMap((candidate) => candidate.evidence))].sort(),
          name:
            group.semanticRole ||
            (group.semanticSubtype
              ? `${group.type}-${group.semanticSubtype}`
              : [
                  group.type,
                  catalogVariant,
                  group.size,
                  group.buttonStyle,
                  group.type === 'card' && cardStyles.size > 1 ? group.cardStyle : undefined,
                ]
                  .filter(Boolean)
                  .join('-')),
          ...(catalogVariant ? { variant: catalogVariant } : {}),
          ...(group.semanticRole ? { semanticRole: group.semanticRole } : {}),
          ...(roleCountsFor(representative.candidates) ? { roleCounts: roleCountsFor(representative.candidates) } : {}),
          ...(sample ? { sampleSize: { width: Math.round(sample.widthPx), height: Math.round(sample.heightPx) } } : {}),
          ...(group.type === 'status'
            ? {
                statusBoundarySupport: representative.candidates.filter((candidate) =>
                  hasActionableStatusBoundary(candidate.statusBoundary),
                ).length,
              }
            : {}),
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

  const patternsByName = new Map<string, ComponentVariantPattern[]>()
  for (const pattern of patterns) {
    const sameName = patternsByName.get(pattern.name) || []
    sameName.push(pattern)
    patternsByName.set(pattern.name, sameName)
  }
  for (const sameName of patternsByName.values()) {
    if (sameName.length <= 1) continue
    sameName
      .sort(
        (first, second) =>
          second.count - first.count || (first.styleSignature || '').localeCompare(second.styleSignature || ''),
      )
      .forEach((pattern, index) => {
        pattern.name = `${pattern.name}-style-${index + 1}`
      })
  }
  return patterns.sort(
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
        styleSignature(first.styles).localeCompare(styleSignature(second.styles)),
    )[0]
    const confidence = patterns.reduce((sum, pattern) => sum + pattern.confidence * pattern.count, 0) / count
    const matchingPatterns = patterns.filter(
      (pattern) => styleSignature(pattern.styles) === styleSignature(representative.styles),
    )
    const styleObservationCount = matchingPatterns.reduce(
      (sum, pattern) => sum + (pattern.styleObservationCount ?? pattern.count),
      0,
    )
    const pageCount = matchingPatterns.reduce((sum, pattern) => sum + (pattern.pageCount || 1), 0)
    const roundedConfidence = Math.round(confidence * 100) / 100
    const roleCounts = new Map<string, number>()
    for (const pattern of matchingPatterns) {
      for (const [role, roleCount] of Object.entries(pattern.roleCounts || {})) {
        roleCounts.set(role, (roleCounts.get(role) || 0) + roleCount)
      }
    }
    return [
      {
        type,
        count,
        selectors: [...new Set(patterns.flatMap((pattern) => pattern.selectors))],
        styles: representative.styles,
        confidence: roundedConfidence,
        styleObservationCount,
        representativeEvidence: [
          ...new Set(matchingPatterns.flatMap((pattern) => pattern.representativeEvidence || [])),
        ].sort(),
        pageCount,
        ...reuseEvidence(roundedConfidence, count, styleObservationCount, pageCount),
        ...(roleCounts.size > 0
          ? {
              roleCounts: Object.fromEntries(
                [...roleCounts.entries()].sort(([first], [second]) => first.localeCompare(second)),
              ),
            }
          : {}),
        evidence: [...new Set(patterns.flatMap((pattern) => pattern.evidence))].sort(),
      },
    ]
  })
}

/**
 * Detect common UI component patterns from visible DOM semantics and visual evidence.
 * Native HTML and ARIA candidates carry stronger confidence than behavioral or card heuristics.
 */
export async function detectComponents(page: Page): Promise<ComponentPattern[]> {
  const candidates = await page.evaluate(() => {
    type BrowserComponentType = 'button' | 'card' | 'navigation' | 'input' | 'table' | 'modal' | 'list'

    interface BrowserCandidate {
      type: BrowserComponentType
      confidence: number
      evidence: string[]
      styles: Record<string, string>
      textStyleOwner?: 'root' | 'descendant'
    }

    interface BrowserTextStyleOwner {
      element: Element
      computed: CSSStyleDeclaration
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

    const hasVisiblePaintChain = (element: Element): boolean => {
      let effectiveOpacity = 1
      let effectiveFilterOpacity = 1
      for (let current: Element | null = element; current; current = current.parentElement) {
        const computed = computedStyleFor(current)
        const opacity = Number.parseFloat(computed.opacity || '1')
        const filterOpacity = filterOpacityFor(computed.filter)
        if (
          !Number.isFinite(opacity) ||
          filterOpacity === undefined ||
          hasUnsupportedMask(computed) ||
          hasContextDependentBlend(computed)
        ) {
          return false
        }
        effectiveOpacity *= opacity
        effectiveFilterOpacity *= filterOpacity
        if (effectiveOpacity < 0.999 || effectiveFilterOpacity < 0.999) {
          return false
        }
      }
      return true
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

    const paintCanvas = document.createElement('canvas')
    paintCanvas.width = paintCanvas.height = 1
    const paintContext = paintCanvas.getContext('2d', { willReadFrequently: true })
    const normalizedPaintColor = (value: string): string | undefined => {
      const input = value.trim()
      if (!input || input.toLowerCase() === 'transparent' || !paintContext) return undefined
      try {
        paintContext.clearRect(0, 0, 1, 1)
        paintContext.fillStyle = '#010203'
        paintContext.fillStyle = input
        const firstParse = paintContext.fillStyle
        paintContext.fillStyle = '#040506'
        paintContext.fillStyle = input
        if (firstParse !== paintContext.fillStyle) return undefined
        paintContext.fillStyle = firstParse
        paintContext.fillRect(0, 0, 1, 1)
        const [red, green, blue, alphaByte] = paintContext.getImageData(0, 0, 1, 1).data
        if (alphaByte === 0) return undefined
        const alpha = Number((alphaByte / 255).toFixed(3))
        return alpha >= 0.999 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha})`
      } catch {
        return undefined
      }
    }
    const glyphPaintFor = (
      computed: CSSStyleDeclaration,
    ):
      | { kind: 'solid-color'; foreground: string }
      | { kind: 'background-clip'; backgroundClip: string; backgroundImage: string }
      | undefined => {
      const textFill = computed.getPropertyValue('-webkit-text-fill-color').trim()
      const fill = textFill && textFill.toLowerCase() !== 'currentcolor' ? textFill : computed.color
      const foreground = normalizedPaintColor(fill)
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
        const values = inset[1]
          .split(/\bround\b/)[0]
          .trim()
          .split(/\s+/)
          .filter(Boolean)
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
    const effectiveTextVisibility = (
      element: Element,
      paintedComputed: CSSStyleDeclaration,
    ): { left: number; top: number; right: number; bottom: number } | undefined => {
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
      let effectiveOpacity = 1
      let filterOpacity = 1
      let effectiveClipPathAreaRatio = 1
      for (let current: Element | null = element; current; current = current.parentElement) {
        const currentComputed = computedStyleFor(current)
        if (
          currentComputed.display === 'none' ||
          currentComputed.visibility === 'hidden' ||
          currentComputed.visibility === 'collapse' ||
          currentComputed.getPropertyValue('content-visibility') === 'hidden' ||
          hasUnsupportedMask(currentComputed) ||
          hasContextDependentBlend(currentComputed)
        ) {
          return undefined
        }
        const currentOpacity = Number.parseFloat(currentComputed.opacity || '1')
        effectiveOpacity *= Number.isFinite(currentOpacity) ? currentOpacity : 1
        const filter = currentComputed.filter.trim().toLowerCase().replace(/\s+/g, ' ')
        if (filter && filter !== 'none') {
          const currentFilterOpacity = filterOpacityFor(filter)
          if (currentFilterOpacity === undefined) return undefined
          filterOpacity *= currentFilterOpacity
        }
        const currentRect = current.getBoundingClientRect()
        const clipPath = clipPathMetrics(currentComputed.clipPath, currentRect.width, currentRect.height)
        if (!clipPath) return undefined
        if (currentComputed.clipPath !== 'none' && currentComputed.clipPath !== '') {
          const normalizedClipPath = currentComputed.clipPath.trim().toLowerCase().replace(/\s+/g, ' ')
          if (/^(?:circle|ellipse|polygon)\(/.test(normalizedClipPath)) return undefined
          left = Math.max(left, currentRect.left + clipPath.left)
          top = Math.max(top, currentRect.top + clipPath.top)
          right = Math.min(right, currentRect.left + clipPath.right)
          bottom = Math.min(bottom, currentRect.top + clipPath.bottom)
          effectiveClipPathAreaRatio *= clipPath.fillRatio
        }
        if (currentComputed.clip !== 'auto' && currentComputed.clip !== '') return undefined
        if (current !== element) {
          const clipsX = ['auto', 'scroll', 'hidden', 'clip'].includes(currentComputed.overflowX)
          const clipsY = ['auto', 'scroll', 'hidden', 'clip'].includes(currentComputed.overflowY)
          const containsPaint = currentComputed.contain.split(/\s+/).includes('paint')
          if (clipsX || containsPaint) {
            left = Math.max(left, currentRect.left)
            right = Math.min(right, currentRect.right)
          }
          if (clipsY || containsPaint) {
            top = Math.max(top, currentRect.top)
            bottom = Math.min(bottom, currentRect.bottom)
          }
        }
      }
      const hostComputed = computedStyleFor(element)
      const hostOpacity = Number.parseFloat(hostComputed.opacity || '1')
      const paintOpacity = Number.parseFloat(paintedComputed.opacity || '1')
      const ancestorOpacity = effectiveOpacity / Math.max(Number.isFinite(hostOpacity) ? hostOpacity : 1, 0.000001)
      effectiveOpacity =
        paintedComputed === hostComputed
          ? effectiveOpacity
          : ancestorOpacity *
            (Number.isFinite(hostOpacity) ? hostOpacity : 1) *
            (Number.isFinite(paintOpacity) ? paintOpacity : 1)
      if (paintedComputed !== hostComputed) {
        if (hasUnsupportedMask(paintedComputed) || hasContextDependentBlend(paintedComputed)) return undefined
        const paintFilterOpacity = filterOpacityFor(paintedComputed.filter)
        if (paintFilterOpacity === undefined) return undefined
        filterOpacity *= paintFilterOpacity
      }
      const visibleWidth = Math.max(0, right - left)
      const visibleHeight = Math.max(0, bottom - top)
      const effectiveScale = Math.sqrt(Math.max(0, Math.min(1, effectiveClipPathAreaRatio)))
      return visibleWidth > 2 &&
        visibleHeight > 2 &&
        visibleWidth * effectiveScale > 2 &&
        visibleHeight * effectiveScale > 2 &&
        visibleWidth * visibleHeight * effectiveClipPathAreaRatio > 16 &&
        effectiveOpacity > 0.02 &&
        filterOpacity > 0.02
        ? { left, top, right, bottom }
        : undefined
    }
    const hasRenderedTextHost = (
      element: Element,
      paintedComputed: CSSStyleDeclaration,
      glyphRects?: readonly DOMRect[],
      requireCompleteNativeTextBox = false,
    ): boolean => {
      if (!isVisible(element)) return false
      const computed = computedStyleFor(element)
      const rect = element.getBoundingClientRect()
      const textIndent = Number.parseFloat(computed.textIndent || '0')
      const visibility = effectiveTextVisibility(element, paintedComputed)
      const dimension = (value: string): number => {
        const parsed = Number.parseFloat(value || '0')
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
      }
      const nativeTextBox = requireCompleteNativeTextBox
        ? {
            left: rect.left + dimension(computed.borderLeftWidth) + dimension(computed.paddingLeft),
            top: rect.top + dimension(computed.borderTopWidth) + dimension(computed.paddingTop),
            right: rect.right - dimension(computed.borderRightWidth) - dimension(computed.paddingRight),
            bottom: rect.bottom - dimension(computed.borderBottomWidth) - dimension(computed.paddingBottom),
          }
        : undefined
      const completeNativeTextBox =
        !nativeTextBox ||
        (nativeTextBox.right - nativeTextBox.left > 2 &&
          nativeTextBox.bottom - nativeTextBox.top > 2 &&
          Boolean(visibility) &&
          visibility!.left <= nativeTextBox.left + 1 &&
          visibility!.top <= nativeTextBox.top + 1 &&
          visibility!.right >= nativeTextBox.right - 1 &&
          visibility!.bottom >= nativeTextBox.bottom - 1)
      const visibleGlyph =
        !glyphRects ||
        glyphRects.some((glyphRect) => {
          if (!visibility) return false
          const width = Math.max(
            0,
            Math.min(glyphRect.right, visibility.right) - Math.max(glyphRect.left, visibility.left),
          )
          const height = Math.max(
            0,
            Math.min(glyphRect.bottom, visibility.bottom) - Math.max(glyphRect.top, visibility.top),
          )
          return width > 1 && height > 1 && width * height > 4
        })
      return (
        Boolean(glyphPaintFor(paintedComputed)) &&
        Boolean(visibility) &&
        visibleGlyph &&
        completeNativeTextBox &&
        (!Number.isFinite(textIndent) ||
          Math.abs(textIndent) <= (requireCompleteNativeTextBox ? 1 : Math.max(128, rect.width * 2)))
      )
    }
    const directlyOwnsRenderedText = (element: Element): boolean => {
      const textNodes = [...element.childNodes].filter(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.replace(/\s+/g, ' ').trim()),
      )
      if (textNodes.length === 0) return false

      const computed = computedStyleFor(element)
      const glyphRects = textNodes.flatMap((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        return [...range.getClientRects()].filter((glyphRect) => glyphRect.width > 0 && glyphRect.height > 0)
      })
      return glyphRects.length > 0 && hasRenderedTextHost(element, computed, glyphRects)
    }
    const visibleTextStyleOwner = (element: Element): BrowserTextStyleOwner | undefined =>
      directlyOwnsRenderedText(element) ? { element, computed: computedStyleFor(element) } : undefined
    const inputTextStyleOwner = (element: Element): BrowserTextStyleOwner | undefined => {
      if (element instanceof HTMLInputElement) {
        const type = element.type.toLowerCase()
        if (['hidden', 'image', 'checkbox', 'radio', 'range', 'color'].includes(type)) return undefined
        const computed = computedStyleFor(element)
        const nativeEmptyText = ['date', 'datetime-local', 'file', 'month', 'time', 'week'].includes(type)
        if (
          (Boolean(element.value.trim()) || nativeEmptyText) &&
          hasRenderedTextHost(element, computed, undefined, true)
        ) {
          return { element, computed }
        }
        if (element.placeholder.trim()) {
          const placeholder = getComputedStyle(element, '::placeholder')
          if (hasRenderedTextHost(element, placeholder, undefined, true)) return { element, computed: placeholder }
        }
        return undefined
      }
      if (element instanceof HTMLTextAreaElement) {
        const computed = computedStyleFor(element)
        if (element.value.trim() && hasRenderedTextHost(element, computed, undefined, true))
          return { element, computed }
        if (element.placeholder.trim()) {
          const placeholder = getComputedStyle(element, '::placeholder')
          if (hasRenderedTextHost(element, placeholder, undefined, true)) return { element, computed: placeholder }
        }
        return undefined
      }
      if (element instanceof HTMLSelectElement) {
        const computed = computedStyleFor(element)
        return element.selectedOptions[0]?.textContent?.trim() &&
          hasRenderedTextHost(element, computed, undefined, true)
          ? { element, computed }
          : undefined
      }
      return (
        visibleTextStyleOwner(element) || [...element.querySelectorAll('*')].map(visibleTextStyleOwner).find(Boolean)
      )
    }
    const renderedTextOwner = (type: BrowserComponentType, element: Element): BrowserTextStyleOwner | undefined => {
      if (type === 'input') {
        const inputSelector =
          'input:not([type="hidden"]), textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]'
        const source = element.matches(inputSelector) ? element : element.querySelector(inputSelector)
        const sourceStyle = source ? inputTextStyleOwner(source) : undefined
        if (sourceStyle) return sourceStyle
        return [...element.querySelectorAll('*')]
          .filter((candidate) => candidate !== source && !source?.contains(candidate))
          .map(visibleTextStyleOwner)
          .find(Boolean)
      }
      if (type !== 'button') return undefined
      if (element instanceof HTMLInputElement) {
        const inputType = element.type.toLowerCase()
        if (inputType === 'image') return undefined
        const computed = computedStyleFor(element)
        const explicitValue = Boolean(element.value.trim())
        const userAgentDefault = ['reset', 'submit'].includes(inputType) && !element.hasAttribute('value')
        return (explicitValue || userAgentDefault) && hasRenderedTextHost(element, computed, undefined, true)
          ? { element, computed }
          : undefined
      }
      return (
        visibleTextStyleOwner(element) || [...element.querySelectorAll('*')].map(visibleTextStyleOwner).find(Boolean)
      )
    }
    const stylesFor = (
      type: BrowserComponentType,
      element: Element,
    ): { styles: Record<string, string>; textStyleOwner?: 'root' | 'descendant' } => {
      const computed = computedStyleFor(element)
      const textOwner = renderedTextOwner(type, element)
      const textComputed = textOwner?.computed
      const textPaint = textComputed ? glyphPaintFor(textComputed) : undefined
      const textColor = textPaint?.kind === 'solid-color' ? textPaint.foreground : undefined
      const borders = {
        borderTop: `${computed.borderTopWidth} ${computed.borderTopStyle} ${computed.borderTopColor}`,
        borderRight: `${computed.borderRightWidth} ${computed.borderRightStyle} ${computed.borderRightColor}`,
        borderBottom: `${computed.borderBottomWidth} ${computed.borderBottomStyle} ${computed.borderBottomColor}`,
        borderLeft: `${computed.borderLeftWidth} ${computed.borderLeftStyle} ${computed.borderLeftColor}`,
      }
      const borderValues = Object.values(borders)
      const equalBorders = borderValues.every((border) => border === borderValues[0])
      return {
        styles: {
          backgroundColor: computed.backgroundColor,
          ...(textComputed
            ? {
                ...(textColor ? { color: textColor } : {}),
                fontFamily: textComputed.fontFamily,
                fontSize: textComputed.fontSize,
                fontWeight: textComputed.fontWeight,
                lineHeight: textComputed.lineHeight,
                letterSpacing: textComputed.letterSpacing,
              }
            : {}),
          ...(equalBorders ? { border: borderValues[0] } : borders),
          borderRadius: computed.borderRadius,
          boxShadow: computed.boxShadow,
          padding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
          ...(!['card', 'list', 'table', 'modal'].includes(type)
            ? { height: computed.height, minHeight: computed.minHeight }
            : {}),
          display: computed.display,
          gap: computed.gap,
        },
        ...(textOwner ? { textStyleOwner: textOwner.element === element ? 'root' : 'descendant' } : {}),
      }
    }

    const addCandidate = (
      type: BrowserComponentType,
      element: Element,
      confidence: number,
      evidence: string[],
    ): void => {
      if (!isVisible(element) || !hasVisiblePaintChain(element)) return

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

      const componentStyle = stylesFor(type, element)
      candidates.set(element, {
        type,
        confidence,
        evidence,
        styles: componentStyle.styles,
        textStyleOwner: componentStyle.textStyleOwner,
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

    const isTransparent = (color: string): boolean =>
      color === 'transparent' || color === 'rgba(0, 0, 0, 0)' || color.endsWith(', 0)')

    collect(
      'button',
      'button, input[type="button" i], input[type="submit" i], input[type="image" i], input[type="reset" i]',
      0.98,
      ['native-element'],
    )
    collect('button', '[role="button"]', 0.9, ['aria-role'])
    collect('button', 'a[href]', 0.78, ['native-link', 'visual-control-boundary'], (element) => {
      const computed = computedStyleFor(element)
      const rect = element.getBoundingClientRect()
      const paintedBackground = !isTransparent(computed.backgroundColor)
      const paintedBorder =
        Number.parseFloat(computed.borderTopWidth || '0') > 0 && !['none', 'hidden'].includes(computed.borderTopStyle)
      const horizontalPadding =
        Number.parseFloat(computed.paddingLeft || '0') + Number.parseFloat(computed.paddingRight || '0')
      return rect.width >= 44 && rect.height >= 28 && (paintedBackground || paintedBorder || horizontalPadding >= 16)
    })

    collect('navigation', 'nav', 0.98, ['native-element'])
    collect('navigation', '[role="navigation"]', 0.9, ['aria-role'])

    collect(
      'input',
      'input:not([type="hidden" i]):not([type="button" i]):not([type="submit" i]):not([type="image" i]):not([type="reset" i]), textarea, select',
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
    collect('modal', '[aria-modal="true"]', 0.86, ['aria-modal', 'overlay-position'], (element) => {
      const computed = computedStyleFor(element)
      return computed.position === 'fixed' || computed.position === 'absolute' || element.tagName === 'DIALOG'
    })

    collect('list', 'ul, ol', 0.98, ['native-element'])
    collect('list', '[role="list"]', 0.9, ['aria-role'])

    const structuralSignature = (element: Element): string => {
      const cached = signatureCache.get(element)
      if (cached) return cached

      const childTags = [...element.children]
        .slice(0, 5)
        .map((child) => child.tagName)
        .join(',')
      const signature = `${element.tagName}|${element.getAttribute('role') || ''}|${childTags}`
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
