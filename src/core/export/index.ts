import { stringify } from 'yaml'

import { generateAgentGuide, generateDesignPrinciples, generateDosAndDonts } from '../analyzer/agent-guide.js'
import type { DocLanguage } from '../analyzer/agent-guide.js'
import { clusterColors, normalizeColorValue } from '../analyzer/color-cluster.js'
import {
  classifyComponentVariant,
  hasVisibleBorder,
  hasVisibleShadow,
  isContextDependentColor,
  isPillRadius,
  isTransparentColor,
  summarizeComponentVariants,
} from '../analyzer/component-detect.js'
import type { ComponentPattern, ComponentType, ComponentVariantPattern } from '../analyzer/component-detect.js'
import { buildDesignTokens, colorContrast } from '../analyzer/token-builder.js'
import type { DarkModeResult, DesignToken } from '../analyzer/types.js'
import { generateDesignProfileJson, generateDesignProfileMarkdown } from '../design-context/profile-export.js'
import type { DesignProfile } from '../design-context/types.js'
import { resolveScreenshotAssetCoverage } from '../design-evidence/asset-integrity.js'
import { generateDesignEvidenceBrief, generateDesignEvidenceJson } from '../design-evidence/evidence-export.js'
import { resolveDesignSystemName } from '../design-evidence/page-identity.js'
import {
  hasConsistentResponsiveSectionIdentity,
  topLevelGridColumnCount,
  usefulResponsiveChanges,
} from '../design-evidence/responsive-reliability.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { coreT } from '../i18n/index.js'
import { designMdColorEntries } from './design-md-color-names.js'

export { generateDesignEvidenceJson, generateDesignProfileJson }
export { buildComponentSpecs, generateComponentSpecsJson } from './component-specs.js'
export type { ComponentSpec } from './component-specs.js'
export { comparePixelBuffers, generateLocalVisualQa } from './visual-qa.js'
export type { VisualQaCheck, VisualQaReport, VisualQaStatus } from './visual-qa.js'

export const FONT_SIZE_NAMES = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl']
export const RADIUS_NAMES = ['sm', 'md', 'lg', 'xl', '2xl']
export const SHADOW_NAMES = ['sm', 'md', 'lg', 'xl']
const LETTER_SPACING_NAMES = ['tight', 'normal', 'wide', 'wider', 'widest']
const LINE_HEIGHT_NAMES = ['tight', 'snug', 'normal', 'relaxed', 'loose']
const DURATION_NAMES = ['fast', 'normal', 'slow', 'slower', 'slowest']

function proseDurationName(index: number): string {
  return DURATION_NAMES[index] || `duration-${index + 1}`
}

function usageForColor(tokens: DesignToken, category: string, value: string): number {
  const normalized = normalizeColorValue(value)
  if (!normalized) return 0
  const prefix = `${category}:`
  return Object.entries(tokens.usageCount || {}).reduce((total, [key, count]) => {
    if (!key.startsWith(prefix)) return total
    return normalizeColorValue(key.slice(prefix.length)) === normalized ? total + count : total
  }, 0)
}

const RENDERED_COLOR_USAGE_CATEGORIES = [
  'primaryActionBackgroundColor',
  'primaryActionForegroundColor',
  'primaryActionColor',
  'actionBackgroundColor',
  'actionForegroundColor',
  'actionColor',
  'selectedColor',
  'accentColor',
  'linkColor',
  'statusBackgroundColor',
  'statusForegroundColor',
  'statusColor',
  'bgColor',
  'bgArea',
  'textColor',
  'borderColor',
  'structuralBorderColor',
] as const

function renderedColorUsageCount(tokens: DesignToken, value: string): number {
  return RENDERED_COLOR_USAGE_CATEGORIES.reduce((total, category) => total + usageForColor(tokens, category, value), 0)
}

function isDeclaredOnlyColor(tokens: DesignToken, value: string): boolean {
  if (renderedColorUsageCount(tokens, value) > 0) return false
  return usageForColor(tokens, 'declaredColor', value) + usageForColor(tokens, 'brandTokenColor', value) > 0
}

function observedColorGroups(
  tokens: DesignToken,
  publicNames: ReadonlyMap<string, string>,
): Array<{ label: string; names: string[] }> {
  const groups = new Map<string, Array<{ name: string; score: number }>>([
    ['action', []],
    ['editorial', []],
    ['status', []],
    ['decorative', []],
    ['text', []],
    ['surface', []],
    ['border', []],
    ['declared', []],
    ['fallback', []],
  ])
  const roleCategories = {
    action: [
      'primaryActionBackgroundColor',
      'primaryActionColor',
      'actionBackgroundColor',
      'actionColor',
      'selectedColor',
    ],
    editorial: ['actionForegroundColor', 'linkColor'],
    status: ['statusBackgroundColor', 'statusForegroundColor', 'statusColor'],
    decorative: ['accentColor', 'bgColor'],
    text: ['textColor'],
    surface: ['bgColor', 'bgArea'],
    border: ['borderColor', 'structuralBorderColor'],
    fallback: [],
  } as const
  const colorValues = new Map<string, Array<{ name: string; value: string }>>()
  for (const [name, value] of Object.entries(tokens.colors)) {
    const normalized = normalizeColorValue(value)
    if (!normalized) continue
    const aliases = colorValues.get(normalized) || []
    aliases.push({ name, value })
    colorValues.set(normalized, aliases)
  }
  const namePriority = (name: string): number => {
    if (
      /^(?:background|surface|secondary|foreground|muted-foreground|primary|accent|border(?:-.+)?|danger|warning|success|status|.*badge.*)$/.test(
        name,
      )
    )
      return 3
    if (/^(?:dark-)?palette-\d+$/.test(name)) return 0
    return 1
  }
  const rolePriority = ['action', 'editorial', 'status', 'decorative', 'text', 'surface', 'border', 'fallback'] as const
  for (const aliases of colorValues.values()) {
    const value = aliases[0].value
    const sources = new Set(aliases.flatMap(({ name }) => tokens.evidence?.[`colors.${name}`]?.sources || []))
    const scores = Object.fromEntries(
      rolePriority.map((role) => [
        role,
        roleCategories[role].reduce(
          (total, category) =>
            total + usageForColor(tokens, category, value) + (sources.has(`usage:${category}`) ? 1 : 0),
          0,
        ),
      ]),
    ) as Record<(typeof rolePriority)[number], number>
    const dominantRole = rolePriority
      .map((role) => ({ role, score: scores[role] }))
      .sort(
        (first, second) =>
          second.score - first.score || rolePriority.indexOf(first.role) - rolePriority.indexOf(second.role),
      )[0]
    if (!dominantRole) continue
    const canonical = [...aliases].sort((first, second) => {
      const firstEvidence = tokens.evidence?.[`colors.${first.name}`]?.observationCount || 0
      const secondEvidence = tokens.evidence?.[`colors.${second.name}`]?.observationCount || 0
      return (
        namePriority(second.name) - namePriority(first.name) ||
        secondEvidence - firstEvidence ||
        first.name.localeCompare(second.name)
      )
    })[0]
    const semanticRole = (
      [
        [/danger|warning|success|status|delta|badge/i, 'status'],
        [/^editorial-accent$/i, 'editorial'],
        [/^decorative-accent$/i, 'decorative'],
        [/^accent$/i, tokens.colors.primary ? 'action' : 'decorative'],
        [/^(?:background|surface|secondary)(?:-|$)/i, 'surface'],
        [/^(?:foreground|muted-foreground|text)(?:-|$)/i, 'text'],
        [/^border(?:-|$)/i, 'border'],
        [/^(?:primary|action)(?:-|$)/i, 'action'],
      ] as const
    ).find(([pattern]) => pattern.test(canonical.name))?.[1]
    const assignedRole = isDeclaredOnlyColor(tokens, value)
      ? 'declared'
      : semanticRole || (dominantRole.score > 0 ? dominantRole.role : 'fallback')
    groups.get(assignedRole)?.push({
      name: publicNames.get(canonical.name) || canonical.name,
      score:
        assignedRole === 'declared'
          ? Math.max(1, usageForColor(tokens, 'declaredColor', value) + usageForColor(tokens, 'brandTokenColor', value))
          : Math.max(1, scores[assignedRole]),
    })
  }
  return [...groups].flatMap(([label, entries]) =>
    entries.length > 0
      ? [
          {
            label,
            names: entries
              .sort((first, second) => second.score - first.score)
              .slice(0, 6)
              .map(({ name }) => name),
          },
        ]
      : [],
  )
}

function isDesignMdDimension(value: string): boolean {
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem)$/i.test(value.trim())
}

function designMdScaleValue(value: string): string | number | undefined {
  const trimmed = value.trim()
  if (isDesignMdDimension(trimmed)) return trimmed
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? numeric : undefined
}

export function buildDesignMdColorTokens(tokens: DesignToken, fallbackPrefix = 'observed'): Record<string, string> {
  return Object.fromEntries(
    designMdColorEntries(tokens, fallbackPrefix).map(({ publicName, value }) => [publicName, value]),
  )
}

function designMdTypographyTokens(tokens: DesignToken): Record<string, Record<string, string | number>> {
  const typography: Record<string, Record<string, string | number>> = {}
  const fontFamilies = [tokens.typography.fontStacks?.[0], ...tokens.typography.fontFamilies].filter(
    (value, index, values): value is string => !!value && values.indexOf(value) === index,
  )
  fontFamilies.forEach((fontFamily, index) => {
    typography[`font-family-${index + 1}`] = { fontFamily }
  })
  tokens.typography.fontSizes.forEach((fontSize, index) => {
    if (isDesignMdDimension(fontSize)) typography[`size-${FONT_SIZE_NAMES[index] || index + 1}`] = { fontSize }
  })
  tokens.typography.fontWeights.forEach((fontWeight, index) => {
    const numeric = Number(fontWeight)
    if (Number.isFinite(numeric)) {
      typography[`weight-${tailwindFontWeightName(fontWeight, index)}`] = { fontWeight: numeric }
    }
  })
  tokens.typography.lineHeights.forEach((lineHeight, index) => {
    const value = designMdScaleValue(lineHeight)
    if (value !== undefined) typography[`line-height-${LINE_HEIGHT_NAMES[index] || index + 1}`] = { lineHeight: value }
  })
  tokens.typography.letterSpacings.forEach((letterSpacing, index) => {
    if (isDesignMdDimension(letterSpacing)) {
      typography[`letter-spacing-${LETTER_SPACING_NAMES[index] || index + 1}`] = { letterSpacing }
    }
  })
  return typography
}

function findTokenReference(
  group: string,
  entries: ReadonlyArray<readonly [string, string]>,
  value: string,
  normalize: (candidate: string) => string | null = (candidate) => candidate.trim().toLowerCase(),
): string | undefined {
  const normalized = normalize(value)
  if (!normalized) return undefined
  const match = entries.find(([name, candidate]) => /^[\w-]+$/.test(name) && normalize(candidate) === normalized)
  return match ? `{${group}.${match[0]}}` : undefined
}

function singleDimensionFromShorthand(value: string): string | undefined {
  const dimensions = value.trim().split(/\s+/)
  if (dimensions.length === 0 || dimensions.some((dimension) => !isDesignMdDimension(dimension))) return undefined
  return dimensions.every((dimension) => dimension === dimensions[0]) ? dimensions[0] : undefined
}

function isZeroDimension(value: string): boolean {
  return Math.abs(Number.parseFloat(value)) <= 0.001
}

function observedPillRadius(components: readonly ComponentVariantPattern[]): string | undefined {
  return components.flatMap((component) => {
    if (component.type !== 'button' || !isPillRadius(component.styles)) return []
    const radius = component.styles.borderRadius
    if (!radius) return []
    const dimension = singleDimensionFromShorthand(radius)
    return dimension && !isZeroDimension(dimension) ? [dimension] : []
  })[0]
}

function designMdComponentTokens(
  components: readonly ComponentVariantPattern[],
  colors: Readonly<Record<string, string>>,
  typography: Readonly<Record<string, Record<string, string | number>>>,
  rounded: Readonly<Record<string, string>>,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  const colorEntries = Object.entries(colors)
  const roundedEntries = Object.entries(rounded)
  const typographyEntries = Object.entries(typography).flatMap(([name, value]) =>
    typeof value.fontSize === 'string' ? ([[name, value.fontSize]] as const) : [],
  )

  components.forEach((component) => {
    const properties: Record<string, string> = {}
    const backgroundColor = component.styles.backgroundColor
    if (backgroundColor && !isContextDependentColor(backgroundColor)) {
      properties.backgroundColor =
        findTokenReference('colors', colorEntries, backgroundColor, normalizeColorValue) ||
        normalizeColorValue(backgroundColor) ||
        ''
    }
    const textColor = component.styles.color
    if (textColor && !isTransparentColor(textColor)) {
      properties.textColor =
        findTokenReference('colors', colorEntries, textColor, normalizeColorValue) ||
        normalizeColorValue(textColor) ||
        ''
    }
    const borderRadius = component.styles.borderRadius
    if (borderRadius) {
      const dimension = singleDimensionFromShorthand(borderRadius)
      if (dimension && !isZeroDimension(dimension)) {
        properties.rounded = findTokenReference('rounded', roundedEntries, dimension) || dimension
      }
    }
    const padding = component.styles.padding ? singleDimensionFromShorthand(component.styles.padding) : undefined
    if (padding && !isZeroDimension(padding)) properties.padding = padding
    const fontSize = component.styles.fontSize
    if (fontSize) {
      const typographyRef = findTokenReference('typography', typographyEntries, fontSize)
      if (typographyRef) properties.typography = typographyRef
    }
    const usableProperties = Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== ''))
    if (Object.keys(usableProperties).length > 0) result[component.name] = usableProperties
  })
  return result
}

interface DesignDocFrontMatterInput {
  tokens: DesignToken
  language: DocLanguage
  url?: string
  featureTags?: string[]
  darkMode?: DarkModeExportData
  breakpoints?: Array<{ width: number; label: string; layoutChanges?: string[] }>
  components?: ComponentVariantPattern[]
  componentSummary?: Array<{
    name: string
    type: string
    count: number
    semanticRole?: string
    elementKinds?: string[]
  }>
  evidence?: DesignEvidence
  profile?: DesignProfile | null
}

interface GoogleDesignMdFrontMatter {
  version: 'alpha'
  name: string
  description: string
  omitted?: Array<{ section: string; reason: string }>
  colors?: Record<string, string>
  typography?: Record<string, Record<string, string | number>>
  rounded?: Record<string, string>
  spacing?: Record<string, string | number>
  components?: Record<string, Record<string, string>>
  'x-imprint': [Record<string, unknown>]
}

const DESIGN_MD_COMPONENT_TYPES = new Set<ComponentType>([
  'button',
  'card',
  'navigation',
  'input',
  'table',
  'modal',
  'list',
])

const VIEWPORT_PREFERENCE = ['desktop', 'tablet', 'mobile'] as const

function canonicalEvidencePageIds(evidence: DesignEvidence): Set<string> {
  const pagesByUrl = new Map<string, DesignEvidence['pages']>()
  for (const page of evidence.pages) {
    const pages = pagesByUrl.get(page.url) || []
    pages.push(page)
    pagesByUrl.set(page.url, pages)
  }
  return new Set(
    [...pagesByUrl.values()].flatMap((pages) => {
      const selected = [...pages].sort((first, second) => {
        const firstRank = VIEWPORT_PREFERENCE.indexOf(first.viewport as (typeof VIEWPORT_PREFERENCE)[number])
        const secondRank = VIEWPORT_PREFERENCE.indexOf(second.viewport as (typeof VIEWPORT_PREFERENCE)[number])
        return (
          (firstRank === -1 ? VIEWPORT_PREFERENCE.length : firstRank) -
          (secondRank === -1 ? VIEWPORT_PREFERENCE.length : secondRank)
        )
      })[0]
      return selected ? [selected.id] : []
    }),
  )
}

function canonicalEvidenceComponents(evidence: DesignEvidence): DesignEvidence['components'] {
  const pageIds = canonicalEvidencePageIds(evidence)
  return pageIds.size > 0
    ? evidence.components.filter((component) => pageIds.has(component.pageId))
    : evidence.components
}

function resolveDesignDocComponents(
  detectedComponents: readonly ComponentPattern[],
  tokens: DesignToken,
  evidence?: DesignEvidence,
): ComponentVariantPattern[] {
  if (!evidence?.components.length) {
    return detectedComponents.map((component) => {
      const variant = classifyComponentVariant(component.type, component.styles, {
        primaryColor: tokens.colors.primary,
      })
      return {
        ...component,
        name: variant ? `${component.type}-${variant}` : component.type,
        ...(variant ? { variant } : {}),
      }
    })
  }

  const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const evidencePatterns = summarizeComponentVariants(
    canonicalEvidenceComponents(evidence).flatMap((component) => {
      if (!DESIGN_MD_COMPONENT_TYPES.has(component.type as ComponentType)) return []
      const page = pageById.get(component.pageId)
      const pageWidth = page?.contentWidth || page?.viewportWidth
      const pageHeight = page?.contentHeight || page?.viewportHeight
      return [
        {
          type: component.type as ComponentType,
          confidence: component.confidence,
          evidence: [component.id, ...component.evidenceRefs],
          styles: component.styles,
          tokenRefs: component.tokenRefs,
          primaryColor: tokens.colors.primary,
          surfaceColors: [tokens.colors.background, tokens.colors.surface, tokens.colors.secondary].filter(
            (color): color is string => Boolean(color),
          ),
          role: component.role,
          elementKind: component.elementKind,
          ...(pageWidth ? { widthPx: component.rect.width * pageWidth } : {}),
          ...(pageHeight ? { heightPx: component.rect.height * pageHeight } : {}),
        },
      ]
    }),
  )
  const evidenceKeys = new Set(
    evidencePatterns.map((pattern) => `${pattern.type}|${pattern.variant || ''}|${pattern.semanticRole || ''}`),
  )
  const evidenceTypes = new Set(evidencePatterns.map((pattern) => pattern.type))
  const detectorSupplements = detectedComponents.flatMap((component) => {
    const variant = classifyComponentVariant(component.type, component.styles, {
      primaryColor: tokens.colors.primary,
    })
    const key = `${component.type}|${variant || ''}|${component.semanticRole || ''}`
    if (evidenceKeys.has(key) || (!variant && evidenceTypes.has(component.type))) return []
    return [
      {
        ...component,
        name: variant ? `${component.type}-${variant}` : component.type,
        ...(variant ? { variant } : {}),
        evidence: [...component.evidence, 'component-detector:supplemental:no-instance-provenance'],
      },
    ]
  })
  const resolvedPatterns = [...evidencePatterns, ...detectorSupplements]
  const primaryAction = tokens.colorRoles?.primaryAction
  if (
    primaryAction &&
    !resolvedPatterns.some((pattern) => pattern.type === 'button' && pattern.variant === 'primary')
  ) {
    const canonicalPageIds = canonicalEvidencePageIds(evidence)
    const canonicalCaptureIds = new Set(
      evidence.pages
        .filter((page) => canonicalPageIds.has(page.id))
        .map((page) => `${page.url}|${page.viewportWidth}x${page.viewportHeight}`),
    )
    const provenance = primaryAction.provenance.filter(
      (item) => canonicalCaptureIds.size === 0 || canonicalCaptureIds.has(item.captureId),
    )
    if (provenance.length > 0) {
      resolvedPatterns.unshift({
        type: 'button',
        count: new Set(provenance.map((item) => `${item.captureId}|${item.elementRef}`)).size,
        selectors: [],
        styles: {
          backgroundColor: primaryAction.observedBackground,
          ...(primaryAction.observedForeground ? { color: primaryAction.observedForeground } : {}),
        },
        confidence: 0.9,
        evidence: ['color-role:primary-action', ...provenance.map((item) => item.elementRef)],
        elementKinds: [...new Set(provenance.map((item) => item.elementKind))].sort(),
        semanticRole: 'primary-action',
        name: 'button-primary',
        variant: 'primary',
      })
    }
  }
  return resolvedPatterns
}

function summarizeFreeformEvidenceComponents(evidence: DesignEvidence | undefined): Array<{
  name: string
  type: string
  count: number
  confidence: number
  styles: Record<string, string>
  elementKinds: string[]
  sampleSize?: { width: number; height: number }
}> {
  if (!evidence) return []
  const pageById = new Map(evidence.pages.map((page) => [page.id, page]))
  const groups = new Map<string, DesignEvidence['components']>()
  for (const component of canonicalEvidenceComponents(evidence)) {
    if (DESIGN_MD_COMPONENT_TYPES.has(component.type as ComponentType)) continue
    const name = component.type === 'status' && component.role ? component.role : component.type
    const group = groups.get(name) || []
    group.push(component)
    groups.set(name, group)
  }
  return [...groups.entries()].map(([name, components]) => {
    const measured = components
      .flatMap((component) => {
        const page = pageById.get(component.pageId)
        const pageWidth = page?.contentWidth || page?.viewportWidth
        const pageHeight = page?.contentHeight || page?.viewportHeight
        if (!pageWidth || !pageHeight) return []
        const width = Math.round(component.rect.width * pageWidth)
        const height = Math.round(component.rect.height * pageHeight)
        return width > 0 && height > 0 ? [{ width, height }] : []
      })
      .sort((first, second) => first.width * first.height - second.width * second.height)
    const sampleSize = measured[Math.floor(measured.length / 2)]
    return {
      name,
      type: components[0]?.type || name,
      count: components.length,
      confidence:
        Math.round((components.reduce((sum, component) => sum + component.confidence, 0) / components.length) * 100) /
        100,
      styles: components[0]?.styles || {},
      elementKinds: [...new Set(components.flatMap((component) => component.elementKind || []))],
      ...(sampleSize ? { sampleSize } : {}),
    }
  })
}

function tokenConfidenceSummary(tokens: DesignToken): Record<'high' | 'medium' | 'low', number> | undefined {
  if (!tokens.evidence || Object.keys(tokens.evidence).length === 0) return undefined
  return Object.values(tokens.evidence).reduce(
    (counts, item) => ({ ...counts, [item.confidence]: counts[item.confidence] + 1 }),
    { high: 0, medium: 0, low: 0 },
  )
}

function designDocColorRoleSummary(tokens: DesignToken): Record<string, unknown> | undefined {
  const colorRoles = tokens.colorRoles
  if (!colorRoles) return undefined
  const primaryAction = colorRoles.primaryAction
    ? {
        observedBackground: colorRoles.primaryAction.observedBackground,
        ...(colorRoles.primaryAction.observedForeground
          ? { observedForeground: colorRoles.primaryAction.observedForeground }
          : {}),
        ...(colorRoles.primaryAction.contrastRatio !== undefined
          ? { contrastRatio: colorRoles.primaryAction.contrastRatio }
          : {}),
        ...(colorRoles.primaryAction.contrastWarning
          ? { contrastWarning: colorRoles.primaryAction.contrastWarning }
          : {}),
        ...(colorRoles.primaryAction.recommendedOnPrimary
          ? { recommendedOnPrimary: colorRoles.primaryAction.recommendedOnPrimary }
          : {}),
        observationCount: colorRoles.primaryAction.provenance.length,
      }
    : undefined
  const semanticPairs = colorRoles.semanticPairs
    ? Object.fromEntries(
        Object.entries(colorRoles.semanticPairs).map(([name, pair]) => [
          name,
          {
            ...(pair.observedBackground ? { observedBackground: pair.observedBackground } : {}),
            ...(pair.observedForeground ? { observedForeground: pair.observedForeground } : {}),
            observationCount: pair.provenance.length,
          },
        ]),
      )
    : undefined
  if (!primaryAction && (!semanticPairs || Object.keys(semanticPairs).length === 0)) return undefined
  return {
    ...(primaryAction ? { primaryAction } : {}),
    ...(semanticPairs && Object.keys(semanticPairs).length > 0 ? { semanticPairs } : {}),
  }
}

function buildDesignDocFrontMatter(input: DesignDocFrontMatterInput): GoogleDesignMdFrontMatter {
  const {
    tokens,
    language,
    url,
    featureTags,
    darkMode,
    breakpoints,
    components = [],
    componentSummary = components,
    evidence,
    profile,
  } = input
  const source = evidence?.source.finalUrl || url
  const colors = buildDesignMdColorTokens(tokens)
  const typography = designMdTypographyTokens(tokens)
  const rounded: Record<string, string> = Object.fromEntries(
    tokens.radii.flatMap((value, index) =>
      isDesignMdDimension(value) ? [[RADIUS_NAMES[index] || `${index + 1}`, value]] : [],
    ),
  )
  const pillRadius = observedPillRadius(components)
  if (pillRadius && !Object.values(rounded).includes(pillRadius)) rounded.pill = pillRadius
  const spacing = Object.fromEntries(
    tokens.spacing.flatMap((value, index) => {
      const scaleValue = designMdScaleValue(value)
      return scaleValue !== undefined ? [[`space-${index + 1}`, scaleValue]] : []
    }),
  )
  const componentTokens = designMdComponentTokens(components, colors, typography, rounded)
  const omitted = [
    Object.keys(colors).length === 0
      ? { section: 'colors', reason: 'No valid color tokens were observed.' }
      : undefined,
    Object.keys(typography).length === 0
      ? { section: 'typography', reason: 'No valid typography tokens were observed.' }
      : undefined,
    Object.keys(spacing).length === 0
      ? { section: 'spacing', reason: 'No valid spacing tokens were observed.' }
      : undefined,
    Object.keys(rounded).length === 0
      ? { section: 'rounded', reason: 'No valid corner radius tokens were observed.' }
      : undefined,
    Object.keys(componentTokens).length === 0
      ? { section: 'components', reason: 'No safely mappable component tokens were observed.' }
      : undefined,
  ].filter((value): value is { section: string; reason: string } => value !== undefined)
  const pageCount = evidence ? new Set(evidence.pages.map((page) => page.url)).size : undefined
  const requestedUrl = evidence?.source.requestedUrl || url
  const resolvedBreakpoints =
    breakpoints ||
    evidence?.breakpoints.map((breakpoint) => ({ width: breakpoint.width, label: breakpoint.label })) ||
    []
  const confidence = tokenConfidenceSummary(tokens)
  const colorRoleSummary = designDocColorRoleSummary(tokens)
  const unsupportedRadii = tokens.radii.filter((radius) => !isDesignMdDimension(radius))
  const nonstandardTokens = {
    ...(tokens.shadows.length > 0 ? { shadows: tokens.shadows } : {}),
    ...(tokens.borders.length > 0 ? { borders: tokens.borders } : {}),
    ...(unsupportedRadii.length > 0 ? { radii: unsupportedRadii } : {}),
    ...(tokens.zIndices.length > 0 ? { zIndices: tokens.zIndices } : {}),
    ...(tokens.transitions.length > 0 ? { transitions: tokens.transitions } : {}),
  }
  const frontMatter: GoogleDesignMdFrontMatter = {
    version: 'alpha',
    name: resolveDesignSystemName({
      url: source,
      siteName: evidence?.source.siteName,
      title: evidence?.source.title,
    }),
    description:
      language === 'zh-CN'
        ? '由 Imprint 从已观察的网站样式和结构证据中提取。'
        : 'Extracted by Imprint from observed website styles and structural evidence.',
    ...(omitted.length > 0 ? { omitted } : {}),
    ...(Object.keys(colors).length > 0 ? { colors } : {}),
    ...(Object.keys(typography).length > 0 ? { typography } : {}),
    ...(Object.keys(rounded).length > 0 ? { rounded } : {}),
    ...(Object.keys(spacing).length > 0 ? { spacing } : {}),
    ...(Object.keys(componentTokens).length > 0 ? { components: componentTokens } : {}),
    // Unknown top-level maps that contain token-like values trigger the official
    // token-like-ignored warning. An extension envelope list remains structured,
    // preserved by consumers, and unambiguous without masquerading as a token group.
    'x-imprint': [
      {
        schema: 'imprint.design-system/2',
        language,
        source: {
          ...(requestedUrl ? { requestedUrl } : {}),
          ...(source ? { finalUrl: source } : {}),
          ...(evidence ? { accessMode: evidence.source.accessMode } : {}),
        },
        featureTags: (featureTags || evidence?.featureTags || []).map((tag) => localizedFeatureTag(tag, language)),
        evidence: {
          layer: evidence ? 'observed' : 'tokens',
          ...(evidence
            ? {
                analysisId: evidence.analysisId,
                pageCount,
                captureCount: evidence.pages.length,
                coverage: {
                  ...evidence.coverage,
                  assetCoverage: resolveScreenshotAssetCoverage(evidence),
                },
              }
            : {}),
          ...(confidence ? { tokenConfidence: confidence } : {}),
        },
        analysis: {
          mode: 'deterministic',
          ...(profile?.claimSource ? { claimSource: profile.claimSource } : {}),
          ...(profile?.catalogVersion ? { catalogVersion: profile.catalogVersion } : {}),
        },
        ...(Object.keys(nonstandardTokens).length > 0 ? { nonstandardTokens } : {}),
        ...(componentSummary.length > 0
          ? {
              componentSummary: {
                source: evidence?.components.length ? 'design-evidence' : 'component-detector',
                ...(evidence?.components.length
                  ? {
                      countBasis: 'one canonical capture per page; desktop preferred',
                      canonicalViewports: [
                        ...new Set(
                          evidence.pages
                            .filter((page) => canonicalEvidencePageIds(evidence).has(page.id))
                            .map((page) => page.viewport),
                        ),
                      ],
                    }
                  : {}),
                patterns: componentSummary.length,
                instances: componentSummary.reduce((total, component) => total + component.count, 0),
                details: componentSummary.map((component) => ({
                  name: component.name,
                  type: component.type,
                  count: component.count,
                  ...(component.semanticRole ? { semanticRole: component.semanticRole } : {}),
                  ...(component.elementKinds?.length ? { elementKinds: component.elementKinds } : {}),
                })),
              },
            }
          : {}),
        ...(colorRoleSummary ? { colorRoles: colorRoleSummary } : {}),
        ...(resolvedBreakpoints.length > 0
          ? {
              responsive: {
                breakpointSource: 'declared-css',
                breakpoints: resolvedBreakpoints,
                ...(evidence?.responsiveObservations.length
                  ? {
                      observedViewportTransitions: [
                        ...new Set(
                          evidence.responsiveObservations.map(
                            (observation) => `${observation.fromViewport}->${observation.toViewport}`,
                          ),
                        ),
                      ],
                    }
                  : {}),
              },
            }
          : {}),
        ...(darkMode?.hasDarkMode
          ? {
              darkMode: {
                method: darkMode.method || 'none',
                ...(darkMode.selector ? { selector: normalizeDarkSelector(darkMode.selector) } : {}),
                ...(darkMode.darkTokens
                  ? { colors: buildDesignMdColorTokens(darkMode.darkTokens, 'dark-observed') }
                  : {}),
              },
            }
          : {}),
      },
    ],
  }

  return frontMatter
}

export interface DarkModeExportData {
  hasDarkMode: boolean
  darkTokens?: DesignToken
  method?: 'media-query' | 'class-toggle' | 'none'
  selector?: string
}

function namespaceDarkPaletteTokens(tokens: DesignToken): DesignToken {
  const rename = (name: string): string => (/^palette-\d+$/.test(name) ? `dark-${name}` : name)
  const colors = Object.fromEntries(Object.entries(tokens.colors).map(([name, value]) => [rename(name), value]))
  const evidence = tokens.evidence
    ? Object.fromEntries(
        Object.entries(tokens.evidence).map(([key, value]) => {
          const match = /^colors\.(palette-\d+)$/.exec(key)
          return [match ? `colors.${rename(match[1])}` : key, value]
        }),
      )
    : undefined
  return { ...tokens, colors, ...(evidence ? { evidence } : {}) }
}

export function buildDarkModeExportData(darkMode: DarkModeResult | null | undefined): DarkModeExportData | undefined {
  if (!darkMode?.hasDarkMode || !darkMode.darkStyles) return undefined

  const clusteredColors = clusterColors(darkMode.darkStyles.colors, darkMode.darkStyles.usageCount)
  return {
    hasDarkMode: true,
    // Residual palette indexes are local to each independently clustered snapshot. Keeping
    // the same palette-N key would falsely imply a semantic light/dark override relationship.
    darkTokens: namespaceDarkPaletteTokens(buildDesignTokens(darkMode.darkStyles, clusteredColors)),
    method: darkMode.method,
    selector: darkMode.selector,
  }
}

function normalizeDarkSelector(value: unknown): string {
  if (value === '.dark') return value
  if (typeof value === 'string' && /^\[data-[\w-]+="dark"\]$/.test(value)) return value
  return '.dark'
}

function isDesignToken(value: unknown): value is DesignToken {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<DesignToken>
  return (
    !!candidate.colors &&
    typeof candidate.colors === 'object' &&
    !!candidate.typography &&
    typeof candidate.typography === 'object' &&
    Array.isArray(candidate.spacing) &&
    Array.isArray(candidate.radii) &&
    Array.isArray(candidate.shadows)
  )
}

export function restoreDarkModeExportData(
  storedDarkTokens: unknown,
  baseTokens: DesignToken,
  method: unknown,
  selector?: unknown,
): DarkModeExportData | undefined {
  if (!storedDarkTokens || typeof storedDarkTokens !== 'object' || Array.isArray(storedDarkTokens)) return undefined

  const restoredDarkTokens = isDesignToken(storedDarkTokens)
    ? storedDarkTokens
    : { ...baseTokens, colors: storedDarkTokens as Record<string, string> }
  if (Object.keys(restoredDarkTokens.colors).length === 0) return undefined
  const darkTokens = namespaceDarkPaletteTokens(restoredDarkTokens)
  const normalizedMethod = method === 'media-query' || method === 'class-toggle' ? method : 'media-query'

  return {
    hasDarkMode: true,
    darkTokens,
    method: normalizedMethod,
    selector: normalizedMethod === 'class-toggle' ? normalizeDarkSelector(selector) : undefined,
  }
}

interface ThemeCustomPropertyOptions {
  fontFamily?: string
  includeFontSizes?: boolean
  includeFontWeights?: boolean
  includeLineHeights?: boolean
  includeShadows?: boolean
  includeBorders?: boolean
  includeLetterSpacings?: boolean
  includeZIndices?: boolean
  indent?: string
}

function appendColorCustomProperties(lines: string[], colors: Readonly<Record<string, string>>, indent = '  '): void {
  for (const [name, value] of Object.entries(colors)) {
    lines.push(`${indent}--color-${name}: ${value};`)
  }
}

function appendIndexedCustomProperties(
  lines: string[],
  values: readonly string[] | undefined,
  prefix: string,
  names: readonly string[] | ((index: number) => string) = [],
  indent = '  ',
): void {
  values?.forEach((value, index) => {
    const name = typeof names === 'function' ? names(index) : names[index] || `${index + 1}`
    lines.push(`${indent}--${prefix}-${name}: ${value};`)
  })
}

function appendThemeCustomProperties(lines: string[], tokens: DesignToken, options: ThemeCustomPropertyOptions): void {
  const indent = options.indent || '  '
  appendColorCustomProperties(lines, tokens.colors, indent)

  if (options.fontFamily !== undefined) {
    lines.push(`${indent}--font-sans: ${options.fontFamily};`)
  }

  if (options.includeFontSizes) {
    appendIndexedCustomProperties(lines, tokens.typography.fontSizes, 'font-size', FONT_SIZE_NAMES, indent)
  }

  if (options.includeFontWeights) {
    appendIndexedCustomProperties(lines, tokens.typography.fontWeights, 'font-weight', [], indent)
  }

  if (options.includeLineHeights) {
    appendIndexedCustomProperties(lines, tokens.typography.lineHeights, 'line-height', [], indent)
  }

  appendIndexedCustomProperties(lines, tokens.spacing, 'spacing', [], indent)
  appendIndexedCustomProperties(lines, tokens.radii, 'radius', RADIUS_NAMES, indent)

  if (options.includeShadows) {
    appendIndexedCustomProperties(lines, tokens.shadows, 'shadow', SHADOW_NAMES, indent)
  }

  if (options.includeBorders) {
    appendIndexedCustomProperties(lines, tokens.borders, 'border', [], indent)
  }

  if (options.includeLetterSpacings) {
    appendIndexedCustomProperties(
      lines,
      tokens.typography.letterSpacings,
      'letter-spacing',
      LETTER_SPACING_NAMES,
      indent,
    )
  }

  if (options.includeZIndices) {
    appendIndexedCustomProperties(lines, tokens.zIndices, 'z', (index) => `${(index + 1) * 10}`, indent)
  }

  appendIndexedCustomProperties(lines, tokens.transitions, 'duration', DURATION_NAMES, indent)
}

function tailwindFontWeightName(value: string, index: number): string {
  const standardNames: Record<string, string> = {
    '100': 'thin',
    '200': 'extralight',
    '300': 'light',
    '400': 'normal',
    '500': 'medium',
    '600': 'semibold',
    '700': 'bold',
    '800': 'extrabold',
    '900': 'black',
  }
  return standardNames[value] || value.replace(/[^\w-]/g, '') || `${index + 1}`
}

function appendTailwindThemeProperties(lines: string[], tokens: DesignToken, indent = '  '): void {
  appendColorCustomProperties(lines, tokens.colors, indent)

  const fontFamily = tokens.typography.fontStacks?.[0] || tokens.typography.fontFamilies[0]
  if (fontFamily) lines.push(`${indent}--font-sans: ${fontFamily};`)

  const lineHeights = tokens.typography.lineHeights || []
  const bodyLineHeight = lineHeights[Math.floor(lineHeights.length / 2)]
  const headingLineHeight = lineHeights[0]
  tokens.typography.fontSizes.forEach((value, index) => {
    const name = FONT_SIZE_NAMES[index] || `${index + 1}`
    lines.push(`${indent}--text-${name}: ${value};`)
    const lineHeight = index >= 3 ? headingLineHeight : bodyLineHeight
    if (lineHeight) lines.push(`${indent}--text-${name}--line-height: ${lineHeight};`)
  })

  tokens.typography.fontWeights.forEach((value, index) => {
    lines.push(`${indent}--font-weight-${tailwindFontWeightName(value, index)}: ${value};`)
  })
  appendIndexedCustomProperties(lines, lineHeights, 'leading', LINE_HEIGHT_NAMES, indent)
  appendIndexedCustomProperties(lines, tokens.typography.letterSpacings, 'tracking', LETTER_SPACING_NAMES, indent)
  appendIndexedCustomProperties(lines, tokens.spacing, 'spacing', [], indent)
  appendIndexedCustomProperties(lines, tokens.radii, 'radius', RADIUS_NAMES, indent)
  appendIndexedCustomProperties(lines, tokens.shadows, 'shadow', SHADOW_NAMES, indent)
}

function appendTailwindSupplementalProperties(lines: string[], tokens: DesignToken, indent = '  '): void {
  appendIndexedCustomProperties(lines, tokens.borders, 'border', [], indent)
  appendIndexedCustomProperties(lines, tokens.zIndices, 'z', (index) => `${(index + 1) * 10}`, indent)
  appendIndexedCustomProperties(lines, tokens.transitions, 'duration', DURATION_NAMES, indent)
  const defaultDuration = tokens.transitions?.[Math.min(1, tokens.transitions.length - 1)]
  if (defaultDuration) lines.push(`${indent}--default-transition-duration: ${defaultDuration};`)
}

export function generateCssVariables(
  tokens: DesignToken,
  darkMode?: DarkModeExportData,
  breakpoints?: Array<{ width: number; label: string }>,
): string {
  const lines: string[] = [':root {']

  appendThemeCustomProperties(lines, tokens, {
    fontFamily:
      tokens.typography.fontFamilies.length > 0
        ? tokens.typography.fontStacks?.[0] || tokens.typography.fontFamilies[0]
        : undefined,
    includeFontSizes: true,
    includeFontWeights: true,
    includeLineHeights: true,
    includeShadows: true,
    includeBorders: true,
    includeLetterSpacings: true,
    includeZIndices: true,
  })

  if (breakpoints && breakpoints.length > 0) {
    breakpoints.forEach((bp) => {
      lines.push(`  --breakpoint-${bp.label}: ${bp.width}px;`)
    })
  }

  lines.push('}')

  if (darkMode?.hasDarkMode && darkMode.darkTokens) {
    const selector =
      darkMode.method === 'media-query'
        ? '@media (prefers-color-scheme: dark)'
        : normalizeDarkSelector(darkMode.selector)
    lines.push('')
    lines.push(`${selector} {`)
    if (darkMode.method === 'media-query') lines.push('  :root {')
    const indent = darkMode.method === 'media-query' ? '    ' : '  '

    appendThemeCustomProperties(lines, darkMode.darkTokens, {
      fontFamily:
        darkMode.darkTokens.typography.fontFamilies.length > 0
          ? darkMode.darkTokens.typography.fontStacks?.[0] || darkMode.darkTokens.typography.fontFamilies[0]
          : undefined,
      includeFontSizes: true,
      includeFontWeights: true,
      includeLineHeights: true,
      includeShadows: true,
      includeBorders: true,
      includeLetterSpacings: true,
      includeZIndices: true,
      indent,
    })

    if (darkMode.method === 'media-query') lines.push('  }')
    lines.push('}')
  }

  return lines.join('\n')
}

export function generateTailwindTheme(
  tokens: DesignToken,
  darkMode?: DarkModeExportData,
  breakpoints?: Array<{ width: number; label: string }>,
): string {
  const lines: string[] = ['@theme {']

  appendTailwindThemeProperties(lines, tokens)
  breakpoints?.forEach((breakpoint) => {
    lines.push(`  --breakpoint-${breakpoint.label}: ${breakpoint.width / 16}rem;`)
  })

  lines.push('}')
  if (tokens.borders.length > 0 || tokens.zIndices?.length > 0 || tokens.transitions?.length > 0) {
    lines.push('', ':root {')
    appendTailwindSupplementalProperties(lines, tokens)
    lines.push('}')
  }

  if (darkMode?.hasDarkMode && darkMode.darkTokens) {
    lines.push('')
    lines.push('/* Dark mode overrides */')
    const selector =
      darkMode.method === 'media-query'
        ? '@media (prefers-color-scheme: dark)'
        : normalizeDarkSelector(darkMode.selector)
    lines.push(`${selector} {`)
    if (darkMode.method === 'media-query') lines.push('  :root {')
    const indent = darkMode.method === 'media-query' ? '    ' : '  '
    appendTailwindThemeProperties(lines, darkMode.darkTokens, indent)
    appendTailwindSupplementalProperties(lines, darkMode.darkTokens, indent)
    if (darkMode.method === 'media-query') lines.push('  }')
    lines.push('}')
  }

  return lines.join('\n')
}

const GOOGLE_DESIGN_MD_SECTIONS = [
  ['overview', 'Overview'],
  ['colors', 'Colors'],
  ['typography', 'Typography'],
  ['layout', 'Layout'],
  ['elevation', 'Elevation & Depth'],
  ['shapes', 'Shapes'],
  ['components', 'Components'],
  ['dosAndDonts', "Do's and Don'ts"],
] as const

type DesignMdSectionKey = (typeof GOOGLE_DESIGN_MD_SECTIONS)[number][0]

interface DesignMdDocumentModel {
  frontMatter: GoogleDesignMdFrontMatter
  title: string
  sections: Record<DesignMdSectionKey, string[]>
  appendices: string[]
}

function renderDesignMdDocument(model: DesignMdDocumentModel): string {
  const blocks = [
    `---\n${stringify(model.frontMatter, { aliasDuplicateObjects: false, lineWidth: 0 }).trimEnd()}\n---`,
    `# ${model.title}`,
    ...GOOGLE_DESIGN_MD_SECTIONS.map(([key, heading]) => {
      const body = model.sections[key].join('\n').trim()
      return `## ${heading}${body ? `\n\n${body}` : ''}`
    }),
    ...model.appendices.map((appendix) => appendix.trim()).filter(Boolean),
  ]
  return `${blocks.join('\n\n')}\n`
}

function withoutCanonicalHeading(markdown: string): string {
  return markdown.replace(/^## Do's and Don'ts\s*/, '').trim()
}

interface ReconstructionFact {
  fact: string
  guidance: string
  priority: number
  pageCount?: number
  kind?: 'structure' | 'interaction'
}

function reconstructionPageContext(evidence: DesignEvidence, pageId: string | undefined): string {
  if (!pageId || new Set(evidence.pages.map((page) => page.url)).size <= 1) return ''
  const page = evidence.pages.find((candidate) => candidate.id === pageId)
  if (!page) return ''
  try {
    const parsed = new URL(page.url)
    return parsed.pathname === '/' && !parsed.search ? 'entry' : `${parsed.pathname}${parsed.search}`
  } catch {
    return page.url
  }
}

function scopedReconstructionFact(pageContext: string, fact: string): string {
  return pageContext ? `[${pageContext}] ${fact}` : fact
}

function splitReconstructionFactScope(fact: string): { scope?: string; body: string } {
  const match = fact.match(/^\[([^\]]+)]\s+(.+)$/s)
  return match ? { scope: match[1], body: match[2] } : { body: fact }
}

function rankReconstructionFacts(facts: readonly ReconstructionFact[]): ReconstructionFact[] {
  const exactFacts = [
    ...new Map(
      [...facts].sort((first, second) => first.priority - second.priority).map((fact) => [fact.fact, fact]),
    ).values(),
  ]
  const groups = new Map<string, ReconstructionFact[]>()
  for (const fact of exactFacts) {
    const { body } = splitReconstructionFactScope(fact.fact)
    const group = groups.get(body) || []
    group.push(fact)
    groups.set(body, group)
  }

  return [...groups.entries()]
    .map(([body, group]) => {
      const representative = [...group].sort((first, second) => first.priority - second.priority)[0]
      const pageScopes = new Set(
        group
          .map((fact) => splitReconstructionFactScope(fact.fact).scope)
          .filter((scope): scope is string => Boolean(scope)),
      )
      return pageScopes.size > 1 ? { ...representative, fact: body, pageCount: pageScopes.size } : representative
    })
    .sort(
      (first, second) =>
        Number(second.pageCount !== undefined) - Number(first.pageCount !== undefined) ||
        (second.pageCount || 0) - (first.pageCount || 0) ||
        first.priority - second.priority ||
        first.fact.localeCompare(second.fact),
    )
}

function scopedReconstructionGuidance(pageContext: string): string {
  return pageContext ? ` on ${pageContext}` : ''
}

function localizeReconstructionFact(value: string, language: DocLanguage): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bdesktop\b/gi, coreT(language, 'export.reconstruction.terms.desktop')],
    [/\btablet\b/gi, coreT(language, 'export.reconstruction.terms.tablet')],
    [/\bmobile\b/gi, coreT(language, 'export.reconstruction.terms.mobile')],
    [/\bentry\b/gi, coreT(language, 'export.reconstruction.terms.entry')],
    [/\bnavigation\b/gi, coreT(language, 'export.reconstruction.terms.navigation')],
    [/\bheader\b/gi, coreT(language, 'export.reconstruction.terms.header')],
    [/\bcontent\b/gi, coreT(language, 'export.reconstruction.terms.content')],
    [/\baside\b/gi, coreT(language, 'export.reconstruction.terms.aside')],
    [/\bfeature-group\b/gi, coreT(language, 'export.reconstruction.terms.featureGroup')],
    [/\bhero\b/gi, coreT(language, 'export.reconstruction.terms.hero')],
    [/\bbody(?=\s+border-(?:top|right|bottom|left)\b)/gi, coreT(language, 'export.reconstruction.terms.body')],
    [/\bbutton\b/gi, coreT(language, 'export.reconstruction.terms.button')],
    [/\bclick\b/gi, coreT(language, 'export.reconstruction.terms.click')],
    [/\baction\b/gi, coreT(language, 'export.reconstruction.terms.action')],
    [/\bfooter\b/gi, coreT(language, 'export.reconstruction.terms.footer')],
    [/\bmax-width\b/gi, coreT(language, 'export.reconstruction.terms.maxWidth')],
    [/\bheading font-size\b/gi, coreT(language, 'export.reconstruction.terms.headingFontSize')],
    [/\bcolumns\b/gi, coreT(language, 'export.reconstruction.terms.columns')],
    [/\blayoutMode\b/g, coreT(language, 'export.reconstruction.terms.layoutMode')],
    [/\bposition\b/gi, coreT(language, 'export.reconstruction.terms.position')],
    [/\bheight\b/gi, coreT(language, 'export.reconstruction.terms.height')],
    [/\border\b/gi, coreT(language, 'export.reconstruction.terms.order')],
    [/\bsequenceIndex\b/g, coreT(language, 'export.reconstruction.terms.order')],
    [/\bariaExpanded\b/g, coreT(language, 'export.reconstruction.terms.ariaExpanded')],
    [/\bariaSelected\b/g, coreT(language, 'export.reconstruction.terms.ariaSelected')],
    [/\bcontrolledVisibility\b/g, coreT(language, 'export.reconstruction.terms.controlledVisibility')],
    [/\bcontrolledOpacity\b/g, coreT(language, 'export.reconstruction.terms.controlledOpacity')],
    [/\bborder-left\b/g, coreT(language, 'export.reconstruction.terms.borderLeft')],
    [/\bborder-right\b/g, coreT(language, 'export.reconstruction.terms.borderRight')],
    [/\bborder-top\b/g, coreT(language, 'export.reconstruction.terms.borderTop')],
    [/\bborder-bottom\b/g, coreT(language, 'export.reconstruction.terms.borderBottom')],
    [/\bborderBottom\b/g, coreT(language, 'export.reconstruction.terms.borderBottom')],
    [/\bboxShadow\b/g, coreT(language, 'export.reconstruction.terms.boxShadow')],
    [/\bsticky\b/gi, coreT(language, 'export.reconstruction.terms.sticky')],
    [/(?<!-)\btop(?=\s+\d)/gi, coreT(language, 'export.reconstruction.terms.top')],
    [/\bfalse(?=\s*→)/g, coreT(language, 'export.reconstruction.terms.false')],
    [/(?<=→\s)\btrue\b(?=\s*(?:,|$))/g, coreT(language, 'export.reconstruction.terms.true')],
    [/\bhidden(?=\s*→)/g, coreT(language, 'export.reconstruction.terms.hidden')],
    [/(?<=→\s)\bvisible\b(?=\s*(?:,|$))/g, coreT(language, 'export.reconstruction.terms.visible')],
  ]
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value)
}

function localizedFeatureTag(tag: string, language: DocLanguage): string {
  const spacing = tag.match(/^spacing rhythm led by (.+)$/)
  if (spacing) {
    const values = spacing[1].replace(/,\s*/g, coreT(language, 'common.listSeparator'))
    return coreT(language, 'export.featureTags.spacingRhythm', { values })
  }
  const keys: Record<string, string> = {
    'monospace typography': 'monospaceTypography',
    'serif editorial style': 'serifEditorialStyle',
    'single-font system': 'singleFontSystem',
    'monochrome palette': 'monochromePalette',
    'large-radius rounded style': 'largeRadiusRoundedStyle',
    'compact-radius surfaces observed': 'compactRadiusSurfaces',
    'no stable shadow scale observed': 'noStableShadowScale',
    'layered elevation system': 'layeredElevationSystem',
    'weight contrast hierarchy': 'weightContrastHierarchy',
    'extensive CSS variable usage': 'extensiveCssVariableUsage',
    'section-level gradient and compound-radius treatments observed': 'sectionGradientAndCompoundRadius',
    'section-level gradient treatments observed': 'sectionGradient',
    'section-level compound-radius treatments observed': 'sectionCompoundRadius',
    'single dominant action family with multicolor decorative accents': 'dominantActionWithDecorativeAccents',
    'neutral palette with a single accent': 'neutralPaletteSingleAccent',
    'rich color system': 'richColorSystem',
  }
  return keys[tag] ? coreT(language, `export.featureTags.${keys[tag]}`) : tag
}

function boundedPixelValue(value: string | number | undefined, maximum = 240): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i)
  if (!match) return null
  const amount = Number.parseFloat(match[1])
  return amount > 0 && amount <= maximum ? value : null
}

function hasNonzeroCssLength(value: string | undefined): boolean {
  return Boolean(value && [...value.matchAll(/-?\d+(?:\.\d+)?/g)].some((match) => Math.abs(Number(match[0])) > 0.01))
}

function normalizedFontFamily(value: string): string {
  return value.replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function usefulComponentStyles(styles: Readonly<Record<string, string>>, tokens: DesignToken): Array<[string, string]> {
  const globalFontFamilies = [...(tokens.typography.fontStacks || []), ...tokens.typography.fontFamilies].map(
    normalizedFontFamily,
  )
  return Object.entries(styles).filter(([property, value]) => {
    if (!value) return false
    if (property === 'backgroundColor') return !isTransparentColor(value)
    if (property === 'border') return hasVisibleBorder(value)
    if (property === 'borderRadius' || property === 'padding' || property === 'gap') {
      return value !== 'normal' && hasNonzeroCssLength(value)
    }
    if (property === 'boxShadow') return hasVisibleShadow(value)
    if (property === 'fontFamily') return !globalFontFamilies.includes(normalizedFontFamily(value))
    if (property === 'fontWeight') return !/^(?:400|normal)$/.test(value)
    if (property === 'display') return /^(?:flex|inline-flex|grid|inline-grid)$/.test(value)
    return ['color', 'fontSize'].includes(property)
  })
}

function componentContrastWarnings(
  components: readonly ComponentVariantPattern[],
  tokens: DesignToken,
): Array<{
  name: string
  foreground: string
  background: string
  ratio: number
  target: number
  inferred: boolean
  schemaTextColorNote?: boolean
}> {
  const surface = tokens.colors.surface || tokens.colors.background
  if (!surface) return []
  const observedPrimary = tokens.colorRoles?.primaryAction
  const warnings = new Map<
    string,
    {
      name: string
      foreground: string
      background: string
      ratio: number
      target: number
      inferred: boolean
      schemaTextColorNote?: boolean
    }
  >()
  for (const component of components) {
    const rawForeground = component.styles.color
    const foreground = rawForeground ? normalizeColorValue(rawForeground) : null
    if (!foreground) continue
    const rawBackground = component.styles.backgroundColor
    const inferred = !rawBackground || isContextDependentColor(rawBackground)
    // A transparent control inherits an ancestor surface that is not captured by this component pattern.
    // Do not turn a generic page-surface assumption into a precise accessibility warning.
    if (inferred) continue
    const background = inferred ? normalizeColorValue(surface) : normalizeColorValue(rawBackground)
    if (!background) continue
    const target = component.variant === 'icon' ? 3 : 4.5
    const ratio = colorContrast(foreground, background)
    if (ratio === null) continue
    const schemaTextColorNote = component.variant === 'icon' && ratio >= 3 && ratio < 4.5
    if (ratio >= target && !schemaTextColorNote) continue
    const duplicatesPrimaryWarning =
      component.variant === 'primary' &&
      Boolean(
        observedPrimary?.observedForeground &&
        normalizeColorValue(observedPrimary.observedForeground) === foreground &&
        normalizeColorValue(observedPrimary.observedBackground) === background,
      )
    if (duplicatesPrimaryWarning) continue
    const key = `${component.name}|${foreground}|${background}|${target}`
    warnings.set(key, {
      name: component.name,
      foreground,
      background,
      ratio: Number(ratio.toFixed(2)),
      target,
      inferred,
      ...(schemaTextColorNote ? { schemaTextColorNote } : {}),
    })
  }
  return [...warnings.values()]
}

function visibleBorderFacts(borders: Readonly<Record<string, string>>): Array<{ label: string; value: string }> {
  const groups = new Map<string, string[]>()
  for (const [side, value] of Object.entries(borders)) {
    if (!hasVisibleBorder(value)) continue
    const sides = groups.get(value) || []
    sides.push(side.replace(/^border/, '').toLowerCase())
    groups.set(value, sides)
  }
  return [...groups.entries()].map(([value, sides]) => ({
    label: sides.length === 4 ? 'border' : `border-${sides.join('/')}`,
    value,
  }))
}

function prominentBorder(value: string): boolean {
  const width = value.match(/^\s*(\d+(?:\.\d+)?)px\b/i)
  return Boolean(width && Number.parseFloat(width[1]) >= 2)
}

function reconstructionRole(role: string | undefined): string {
  return !role || role === 'unknown' ? 'content' : role
}

function compactRoleSequence(roles: readonly string[]): string[] {
  const compacted: string[] = []
  for (let index = 0; index < roles.length;) {
    const role = roles[index]
    let count = 1
    while (roles[index + count] === role) count += 1
    compacted.push(count > 1 ? `${role} ×${count}` : role)
    index += count
  }
  return compacted
}

function isVisiblePseudoValue(property: string, value: string | undefined): boolean {
  if (!value) return false
  if (property === 'backgroundColor') return !isTransparentColor(value)
  if (property === 'boxShadow') return value !== 'none'
  if (/^border(?:Top|Right|Bottom|Left)?$/.test(property)) return hasVisibleBorder(value)
  return !/^(?:none|normal|auto|0px|rgba?\([^)]*(?:,|\/)\s*0(?:\.0+)?\s*\))$/i.test(value)
}

function reconstructionSignatureFacts(evidence: DesignEvidence): ReconstructionFact[] {
  const canonicalPageIds = canonicalEvidencePageIds(evidence)
  const sections = evidence.sections.filter((section) => canonicalPageIds.has(section.pageId))
  const facts: ReconstructionFact[] = []
  for (const section of sections) {
    const styles = section.observedStyles
    if (!styles) continue
    const sectionRole = reconstructionRole(section.role)
    const pageContext = reconstructionPageContext(evidence, section.pageId)
    const guidanceContext = scopedReconstructionGuidance(pageContext)
    if (section.layoutMode !== 'flow') {
      const height = boundedPixelValue(styles.layout?.height)
      const top = styles.layout?.top
      const values = [section.layoutMode, top ? `top ${top}` : '', height ? `${height} high` : ''].filter(Boolean)
      facts.push({
        fact: scopedReconstructionFact(pageContext, `${sectionRole}: ${values.join(', ')}`),
        guidance: `Keep the ${sectionRole}${guidanceContext} ${section.layoutMode}${height ? ` at ${height} high` : ''}.`,
        priority: 0,
      })
    }
    for (const { label, value } of visibleBorderFacts(styles.borders || {})) {
      if (!prominentBorder(value)) continue
      facts.push({
        fact: scopedReconstructionFact(pageContext, `${sectionRole} ${label}: ${value}`),
        guidance: `Preserve the ${sectionRole}${guidanceContext} ${label} treatment at ${value}.`,
        priority: 4,
      })
    }
    if (styles.gradient) {
      const label = [styles.gradient.type, styles.gradient.direction].filter(Boolean).join(' ')
      facts.push({
        fact: scopedReconstructionFact(pageContext, `${sectionRole}: ${label}`),
        guidance: `Preserve the ${sectionRole}${guidanceContext} ${label}.`,
        priority: 2,
      })
    }
    if (styles.borderRadius) {
      facts.push({
        fact: scopedReconstructionFact(pageContext, `${sectionRole} radius: ${styles.borderRadius}`),
        guidance: `Keep the ${sectionRole}${guidanceContext} corner treatment at ${styles.borderRadius}; do not flatten it to one radius.`,
        priority: 3,
      })
    }
    if (styles.layout?.maxWidth && !/^100(?:\.0+)?%$/.test(styles.layout.maxWidth.trim())) {
      facts.push({
        fact: scopedReconstructionFact(pageContext, `${sectionRole} max-width: ${styles.layout.maxWidth}`),
        guidance: `Constrain the ${sectionRole}${guidanceContext} to its observed ${styles.layout.maxWidth} max-width.`,
        priority: 2,
      })
    }
  }

  const layoutBorderFacts = new Map<string, ReconstructionFact>()
  for (const node of evidence.layoutNodes) {
    if (!canonicalPageIds.has(node.pageId)) continue
    const section = evidence.sections.find((candidate) => candidate.id === node.sectionId)
    const pageContext = reconstructionPageContext(evidence, node.pageId)
    const borders = Object.fromEntries(
      Object.entries(node.observedStyles || {}).filter(([property]) =>
        /^border(?:Top|Right|Bottom|Left)$/.test(property),
      ),
    )
    for (const { label: borderLabel, value } of visibleBorderFacts(borders)) {
      if (!prominentBorder(value)) continue
      const sectionRole = reconstructionRole(section?.role)
      const label = [sectionRole, node.role !== section?.role ? node.role : '', `${borderLabel}: ${value}`]
        .filter(Boolean)
        .join(' ')
      layoutBorderFacts.set(`${pageContext}|${node.role}|${borderLabel}|${value}`, {
        fact: scopedReconstructionFact(pageContext, label),
        guidance: `Preserve the ${node.role}${scopedReconstructionGuidance(pageContext)} ${borderLabel} treatment at ${value}.`,
        priority: 2,
      })
    }
  }
  facts.push(...layoutBorderFacts.values())

  const pseudoFacts = new Map<string, ReconstructionFact>()
  for (const pseudo of evidence.pseudoElements || []) {
    if (!canonicalPageIds.has(pseudo.pageId)) continue
    const section = evidence.sections.find((candidate) => candidate.id === pseudo.sectionId)
    const pageContext = reconstructionPageContext(evidence, pseudo.pageId)
    const visibleStyles = Object.entries(pseudo.styles).filter(([property, value]) =>
      isVisiblePseudoValue(property, value),
    )
    const hasProminentBorder = visibleStyles.some(
      ([property, value]) =>
        /^border(?:Top|Right|Bottom|Left)?$/.test(property) && hasVisibleBorder(value) && prominentBorder(value),
    )
    const isMeaningfulDecoration = visibleStyles.some(
      ([property]) => property === 'backgroundColor' || property === 'boxShadow',
    )
    if (
      visibleStyles.length === 0 ||
      (pseudo.kind !== 'first-letter' && !hasProminentBorder && !isMeaningfulDecoration)
    ) {
      continue
    }
    const details = visibleStyles
      .filter(([property]) =>
        [
          'fontSize',
          'float',
          'color',
          'backgroundColor',
          'border',
          'borderTop',
          'borderRight',
          'borderBottom',
          'borderLeft',
        ].includes(property),
      )
      .slice(0, 3)
      .map(([property, value]) => `${property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} ${value}`)
    const label = scopedReconstructionFact(
      pageContext,
      `${reconstructionRole(section?.role)} ::${pseudo.kind}${details.length ? ` (${details.join(', ')})` : ''}`,
    )
    pseudoFacts.set(`${pageContext}|${pseudo.kind}|${JSON.stringify(pseudo.styles)}`, {
      fact: label,
      guidance: `Reproduce the ${label} treatment.`,
      priority: pseudo.kind === 'first-letter' ? 0 : 6,
    })
  }
  facts.push(...pseudoFacts.values())

  const interactionFacts = new Map<string, ReconstructionFact>()
  for (const observation of evidence.interactionObservations) {
    if (observation.safety !== 'safe-active' || !canonicalPageIds.has(observation.pageId)) continue
    const section = evidence.sections.find((candidate) => candidate.id === observation.sectionId)
    const component = evidence.components.find((candidate) => candidate.id === observation.targetId)
    const beforeBackground = observation.before['background-color']
    const primaryColor = evidence.tokens.colors.primary
    const normalizedBeforeBackground =
      typeof beforeBackground === 'string' && !isTransparentColor(beforeBackground)
        ? normalizeColorValue(beforeBackground)
        : null
    const primaryActionHover =
      observation.driver === 'hover' &&
      typeof primaryColor === 'string' &&
      normalizedBeforeBackground !== null &&
      normalizedBeforeBackground === normalizeColorValue(primaryColor)
    const observedComponent = normalizedBeforeBackground
      ? canonicalEvidenceComponents(evidence).find(
          (candidate) =>
            typeof candidate.styles.backgroundColor === 'string' &&
            normalizeColorValue(candidate.styles.backgroundColor) === normalizedBeforeBackground,
        )
      : undefined
    const observedVariant = observedComponent
      ? classifyComponentVariant(observedComponent.type as ComponentType, observedComponent.styles, {
          primaryColor,
          role: observedComponent.role,
        })
      : undefined
    const target =
      (primaryActionHover ? 'primary CTA' : undefined) ||
      component?.type ||
      (observedComponent ? [observedComponent.type, observedVariant].filter(Boolean).join('-') : undefined) ||
      (section ? reconstructionRole(section.role) : undefined) ||
      'element'
    const changes = observation.changedProperties
      .filter(
        (property) =>
          observation.before[property] !== undefined &&
          observation.after[property] !== undefined &&
          observation.before[property] !== observation.after[property],
      )
      .slice(0, 2)
      .map(
        (property) =>
          `${property} ${observation.before[property] ?? 'absent'} → ${observation.after[property] ?? 'absent'}`,
      )
    if (changes.length === 0) continue
    const pageContext = reconstructionPageContext(evidence, observation.pageId)
    const fact = scopedReconstructionFact(pageContext, `${target} ${observation.driver}: ${changes.join(', ')}`)
    interactionFacts.set(`${pageContext}|${target}|${observation.driver}|${changes.join('|')}`, {
      fact,
      guidance: `Implement the observed ${target} ${observation.driver} transition: ${changes.join(', ')}.`,
      priority: observation.changedProperties.includes('ariaSelected') ? 0 : observation.driver === 'hover' ? 1 : 5,
      kind: 'interaction',
    })
  }
  facts.push(...interactionFacts.values())

  return rankReconstructionFacts(facts)
}

function reconstructionResponsiveFacts(evidence: DesignEvidence): ReconstructionFact[] {
  const facts: ReconstructionFact[] = []
  for (const observation of evidence.responsiveObservations) {
    if (!hasConsistentResponsiveSectionIdentity(observation, evidence)) continue
    const section = evidence.sections.find((candidate) => candidate.id === observation.sectionId)
    const pageContext = reconstructionPageContext(evidence, section?.pageId)
    const context = scopedReconstructionFact(
      pageContext,
      `${reconstructionRole(section?.role)} ${observation.fromViewport} → ${observation.toViewport}`,
    )
    for (const [property, values] of usefulResponsiveChanges(observation, section?.role)) {
      const gridProperty = property === 'gridTemplateColumns' || property === 'childGridTemplateColumns'
      const headingProperty = property === 'node.heading.fontSize'
      const layoutProperty = ['layoutMode', 'position', 'order', 'sequenceIndex'].includes(property)
      const heightProperty = property === 'height' || property.endsWith('.height')
      const usefulHeight = heightProperty
      const fromColumns = gridProperty ? topLevelGridColumnCount(values.from) : null
      const toColumns = gridProperty ? topLevelGridColumnCount(values.to) : null
      const label = gridProperty
        ? fromColumns && toColumns
          ? `columns ${fromColumns} → ${toColumns}`
          : `columns ${values.from ?? 'absent'} → ${values.to ?? 'absent'}`
        : headingProperty
          ? `heading font-size ${values.from ?? 'absent'} → ${values.to ?? 'absent'}`
          : `${property}: ${values.from ?? 'absent'} → ${values.to ?? 'absent'}`
      const priority = gridProperty ? 0 : headingProperty ? 1 : layoutProperty || usefulHeight ? 2 : 4
      facts.push({
        fact: `${context}: ${label}`,
        guidance: `Implement the ${context} change as ${label}.`,
        priority,
      })
    }
  }
  return [
    ...new Map(
      facts.sort((first, second) => first.priority - second.priority).map((fact) => [fact.fact, fact]),
    ).values(),
  ]
}

function readableReconstructionComponentName(name: string, language: DocLanguage): string {
  const parts = name.split('-').filter(Boolean)
  const type = parts[0]
  if (type === 'delta' && parts[1]) {
    return coreT(language, 'export.reconstruction.deltaVariant', {
      direction: coreT(language, `export.reconstruction.componentTraits.${parts[1]}`, {
        defaultValue: parts[1],
      }),
    })
  }
  const knownTypes = new Set(['button', 'card', 'navigation', 'input', 'table', 'modal', 'list', 'tab', 'status'])
  if (!type || !knownTypes.has(type)) return localizeReconstructionFact(name.replaceAll('-', ' '), language)

  let label = coreT(language, `export.reconstruction.componentTypes.${type}`, { defaultValue: type })
  let traitStart = 1
  if (type === 'button' && ['primary', 'secondary', 'destructive', 'text', 'icon'].includes(parts[1] || '')) {
    label = coreT(language, `export.reconstruction.buttonVariants.${parts[1]}`, { defaultValue: label })
    traitStart = 2
  }
  const traits = parts.slice(traitStart).map((trait) => {
    const radius = /^r(\d+(?:\.\d+)?)$/.exec(trait)?.[1]
    const traitNamespace =
      type === 'card' && ['flat', 'outlined', 'elevated', 'square'].includes(trait) ? 'cardTraits' : 'componentTraits'
    return radius
      ? coreT(language, 'export.reconstruction.radiusTrait', { radius })
      : coreT(language, `export.reconstruction.${traitNamespace}.${trait}`, { defaultValue: trait })
  })
  return traits.length > 0
    ? coreT(language, 'export.reconstruction.componentVariant', {
        label,
        traits: traits.join(coreT(language, 'export.reconstruction.traitSeparator')),
      })
    : label
}

function reconstructionSummary(
  evidence: DesignEvidence,
  tokens: DesignToken,
  components: ReadonlyArray<{ name: string; count: number; elementKinds?: string[] }>,
  language: DocLanguage,
): string[] {
  const desktopPage = evidence.pages.find((page) => page.viewport === 'desktop') || evidence.pages[0]
  const multiPage = new Set(evidence.pages.map((page) => page.url)).size > 1
  const observedTitle = evidence.source.title || desktopPage?.title
  const pageTitle =
    evidence.source.siteName ||
    (observedTitle
      ? resolveDesignSystemName({ url: evidence.source.finalUrl, title: observedTitle })
      : new URL(evidence.source.finalUrl).hostname)
  const canonicalTopology = evidence.topology.pages.find((page) => page.pageId === desktopPage?.id)
  const sectionRoles = compactRoleSequence(
    canonicalTopology?.sectionIds
      .map((id) => evidence.sections.find((section) => section.id === id)?.role)
      .filter((role): role is NonNullable<typeof role> => Boolean(role) && role !== 'unknown') || [],
  )
  const allSignatureFacts = reconstructionSignatureFacts(evidence)
  const recurringStructureFacts = allSignatureFacts.filter(
    (fact) => fact.pageCount !== undefined && fact.kind !== 'interaction',
  )
  const signatureFacts = (multiPage ? recurringStructureFacts : allSignatureFacts).slice(0, 8)
  const responsiveFacts = reconstructionResponsiveFacts(evidence).slice(0, 6)
  const variants = components
    .slice(0, 12)
    .map((component) => `${readableReconstructionComponentName(component.name, language)} ×${component.count}`)
  // The reconstruction summary is the document's canonical observed layer; profile claims stay separate.
  const scope = coreT(language, `export.reconstruction.${multiPage ? 'siteScope' : 'pageScope'}`, {
    title: pageTitle,
    pageCount: new Set(evidence.pages.map((page) => page.url)).size,
  })
  const readableFact = (fact: ReconstructionFact): string => {
    const localized = localizeReconstructionFact(fact.fact, language)
    return fact.pageCount
      ? coreT(language, 'export.reconstruction.recurringFact', { count: fact.pageCount, fact: localized })
      : localized
  }
  const preserve = [...signatureFacts, ...responsiveFacts].slice(0, 4).map((fact) =>
    coreT(language, 'export.reconstruction.preserveFact', {
      fact: readableFact(fact),
    }),
  )
  const avoid = [
    tokens.colors.primary
      ? coreT(language, 'export.reconstruction.avoidActionSubstitution')
      : coreT(language, 'export.reconstruction.avoidInventedPrimary'),
    coreT(language, 'export.reconstruction.avoidGeometryGeneralization'),
  ]
  const label = (key: string): string => coreT(language, `export.reconstruction.labels.${key}`)
  return [
    coreT(language, 'export.reconstruction.heading'),
    '',
    `- **${label(multiPage ? 'siteThesis' : 'pageThesis')}:** ${scope}`,
    sectionRoles?.length
      ? `- **${label(multiPage ? 'entryHierarchy' : 'sectionHierarchy')}:** ${sectionRoles.map((role) => localizeReconstructionFact(role, language)).join(' → ')}`
      : '',
    signatureFacts.length
      ? `- **${label('keyStructure')}:** ${signatureFacts.map((fact) => `\`${readableFact(fact)}\``).join(' · ')}`
      : '',
    variants.length ? `- **${label(multiPage ? 'siteVariants' : 'pageVariants')}:** ${variants.join(', ')}` : '',
    responsiveFacts.length
      ? `- **${label('responsiveFacts')}:** ${responsiveFacts.map(({ fact }) => localizeReconstructionFact(fact, language)).join('; ')}`
      : '',
    preserve.length ? `- **${label('preserve')}:** ${preserve.join(' ')}` : '',
    avoid.length ? `- **${label('avoid')}:** ${avoid.join(' ')}` : '',
  ].filter(Boolean)
}

export function generateDesignDoc(
  tokens: DesignToken,
  url?: string,
  featureTags?: string[],
  darkMode?: DarkModeExportData,
  breakpoints?: Array<{ width: number; label: string; layoutChanges?: string[] }>,
  components: ComponentPattern[] = [],
  language: DocLanguage = 'en',
  designEvidence?: DesignEvidence,
  designProfile?: DesignProfile | null,
): string {
  const zh = language === 'zh-CN'
  const documentUrl = url || designEvidence?.source.requestedUrl
  const documentFeatureTags = featureTags || designEvidence?.featureTags || []
  const documentBreakpoints =
    breakpoints ||
    designEvidence?.breakpoints.map((breakpoint) => ({
      width: breakpoint.width,
      label: breakpoint.label,
      layoutChanges: breakpoint.layoutChanges,
    })) ||
    []
  const documentComponents = resolveDesignDocComponents(components, tokens, designEvidence)
  const freeformEvidenceComponents = summarizeFreeformEvidenceComponents(designEvidence)
  const sections: Record<DesignMdSectionKey, string[]> = {
    overview: [],
    colors: [],
    typography: [],
    layout: [],
    elevation: [],
    shapes: [],
    components: [],
    dosAndDonts: [],
  }
  const appendixLines: string[] = []
  let lines = sections.overview
  const frontMatter = buildDesignDocFrontMatter({
    tokens,
    language,
    url: documentUrl,
    featureTags: documentFeatureTags,
    darkMode,
    breakpoints: documentBreakpoints,
    components: documentComponents,
    componentSummary: [...documentComponents, ...freeformEvidenceComponents],
    evidence: designEvidence,
    profile: designProfile,
  })
  if (designEvidence)
    lines.push(
      ...reconstructionSummary(
        designEvidence,
        tokens,
        [...freeformEvidenceComponents, ...documentComponents],
        language,
      ),
    )
  if (documentUrl) lines.push(zh ? `\n提取自：${documentUrl}` : `\nExtracted from: ${documentUrl}`)

  if (documentFeatureTags.length > 0) {
    const tags = documentFeatureTags.map((tag) => `\`${localizedFeatureTag(tag, language)}\``).join(' · ')
    lines.push(`\n${coreT(language, 'export.featureTags.line', { tags })}`)
  }

  if (darkMode?.hasDarkMode) {
    const detection =
      darkMode.method === 'class-toggle'
        ? zh
          ? `切换 ${normalizeDarkSelector(darkMode.selector)} 后读取计算样式`
          : `toggling ${normalizeDarkSelector(darkMode.selector)} and reading computed styles`
        : zh
          ? '模拟 prefers-color-scheme: dark 后读取计算样式'
          : 'emulating prefers-color-scheme: dark and reading computed styles'
    lines.push(
      zh
        ? `\n**深色模式：** 支持。暗色令牌通过${detection}主动观察得到；不代表该站点默认以深色加载。`
        : `\n**Dark Mode:** Supported. Dark tokens were observed by ${detection}; this does not imply the site loads in dark by default.`,
    )
  } else {
    lines.push(zh ? `\n**深色模式：** 未检测到` : `\n**Dark Mode:** Not detected`)
  }

  // Colors
  lines = sections.colors
  const publicColorEntries = designMdColorEntries(tokens)
  const publicColorNames = new Map(publicColorEntries.map((entry) => [entry.sourceName, entry.publicName]))
  const colorGroups = observedColorGroups(tokens, publicColorNames)
  if (colorGroups.length > 0) {
    lines.push(zh ? '### 主要观察用途颜色分组\n' : '### Dominant Observed Color Roles\n')
    lines.push(zh ? '| 分组 | 令牌 |' : '| Group | Tokens |')
    lines.push('|---|---|')
    const colorGroupLabels: Record<string, string> = zh
      ? {
          action: '操作',
          editorial: '编辑强调',
          status: '状态/趋势',
          decorative: '装饰',
          text: '文字',
          surface: '表面/背景',
          border: '边框',
          declared: '仅 CSS 声明，未观察到渲染用途',
          fallback: '已观察但未分配语义',
        }
      : {
          action: 'Action',
          editorial: 'Editorial accent',
          status: 'Status/delta',
          decorative: 'Decorative',
          text: 'Text',
          surface: 'Surface/background',
          border: 'Border',
          declared: 'CSS-declared; no rendered use observed',
          fallback: 'Observed, unassigned role',
        }
    for (const group of colorGroups) {
      lines.push(
        `| ${colorGroupLabels[group.label]} | ${group.names.map((name) => `\`--color-${name}\``).join(', ')} |`,
      )
    }
    lines.push('')
    lines.push(zh ? '### 完整颜色令牌\n' : '### Complete Color Tokens\n')
  }
  lines.push(zh ? '| 令牌 | 值 | 用途 | 置信度 |' : '| Token | Value | Usage | Confidence |')
  lines.push('|-------|-------|-------|------------|')
  for (const { sourceName, publicName, value } of publicColorEntries) {
    const bgCount = usageForColor(tokens, 'bgColor', value)
    const textCount = usageForColor(tokens, 'textColor', value)
    const borderCount = usageForColor(tokens, 'borderColor', value)
    const actionCount = [
      'primaryActionBackgroundColor',
      'primaryActionForegroundColor',
      'primaryActionColor',
      'actionBackgroundColor',
      'actionForegroundColor',
      'actionColor',
      'selectedColor',
      'linkColor',
    ].reduce((total, category) => total + usageForColor(tokens, category, value), 0)
    const statusCount = ['statusBackgroundColor', 'statusForegroundColor', 'statusColor'].reduce(
      (total, category) => total + usageForColor(tokens, category, value),
      0,
    )
    const renderedCount = Math.max(bgCount + textCount + borderCount, actionCount, statusCount)
    const declaredOnly = isDeclaredOnlyColor(tokens, value)
    const contexts = [
      actionCount > 0 ? (zh ? '操作' : 'action') : null,
      statusCount > 0 ? (zh ? '状态' : 'status') : null,
      bgCount > 0 ? (zh ? '背景' : 'background') : null,
      textCount > 0 ? (zh ? '文字' : 'text') : null,
      borderCount > 0 ? (zh ? '边框' : 'border') : null,
    ].filter((context): context is string => context !== null)
    const context = contexts.join('+')
    const tokenEvidence = tokens.evidence?.[`colors.${sourceName}`]
    const confidence = tokenEvidence
      ? `${tokenEvidence.confidence} · ${zh ? `${tokenEvidence.pageCount}页` : `${tokenEvidence.pageCount} ${tokenEvidence.pageCount === 1 ? 'page' : 'pages'}`}`
      : '-'
    lines.push(
      `| \`--color-${publicName}\` | \`${value}\` | ${renderedCount > 0 ? `${renderedCount}× (${context})` : declaredOnly ? (zh ? '仅 CSS 声明；未观察到渲染用途' : 'CSS-declared; no rendered use observed') : '-'} | ${confidence} |`,
    )
  }

  const primaryActionRole = tokens.colorRoles?.primaryAction
  if (primaryActionRole) {
    lines.push(zh ? '\n### 已观察的主操作配色\n' : '\n### Observed Primary Action Pair\n')
    const pair = primaryActionRole.observedForeground
      ? `\`${primaryActionRole.observedBackground}\` / \`${primaryActionRole.observedForeground}\``
      : `\`${primaryActionRole.observedBackground}\``
    lines.push(zh ? `- 已观察的主操作配色：${pair}` : `- Observed primary action pair: ${pair}`)
    if (primaryActionRole.contrastRatio !== undefined) {
      lines.push(
        zh
          ? `- 已观察对比度：${primaryActionRole.contrastRatio.toFixed(2)}:1${primaryActionRole.contrastWarning ? '（低于普通文本 4.5:1 目标）' : ''}`
          : `- Observed contrast: ${primaryActionRole.contrastRatio.toFixed(2)}:1${primaryActionRole.contrastWarning ? ' (below the 4.5:1 normal-text target)' : ''}`,
      )
    }
    if (primaryActionRole.recommendedOnPrimary) {
      const recommendation = primaryActionRole.recommendedOnPrimary
      lines.push(
        zh
          ? `- 派生的可访问性建议：\`${recommendation.value}\`（${recommendation.contrastRatio.toFixed(2)}:1，目标 ≥ ${recommendation.targetContrastRatio}:1；非页面观察值）`
          : `- Derived accessible recommendation: \`${recommendation.value}\` (${recommendation.contrastRatio.toFixed(2)}:1, target ≥ ${recommendation.targetContrastRatio}:1; not an observed value)`,
      )
    }
  }

  const semanticPairs = tokens.colorRoles?.semanticPairs
  if (semanticPairs && Object.keys(semanticPairs).length > 0) {
    lines.push(zh ? '\n### 已观察的状态与趋势配色\n' : '\n### Observed Status and Delta Pairs\n')
    for (const [role, pair] of Object.entries(semanticPairs)) {
      lines.push(
        `- \`${role}\`: ${[pair.observedBackground, pair.observedForeground]
          .filter(Boolean)
          .map((value) => `\`${value}\``)
          .join(' / ')}`,
      )
    }
  }

  if (darkMode?.hasDarkMode && darkMode.darkTokens) {
    lines.push(zh ? '\n### 深色模式颜色\n' : '\n### Dark Mode Colors\n')
    lines.push(zh ? '| 令牌 | 值 |' : '| Token | Value |')
    lines.push('|-------|-------|')
    for (const { publicName, value } of designMdColorEntries(darkMode.darkTokens, 'dark-observed')) {
      lines.push(`| \`--color-${publicName}\` | \`${value}\` |`)
    }
  }

  // Typography
  lines = sections.typography
  lines.push(
    zh
      ? `**字体族：** ${tokens.typography.fontFamilies.join(', ') || '系统默认'}`
      : `**Font families:** ${tokens.typography.fontFamilies.join(', ') || 'System default'}`,
  )
  if (tokens.typography.fontStacks?.length > 0) {
    lines.push(zh ? '\n**完整字体栈：**' : '\n**Full font stacks:**')
    tokens.typography.fontStacks.forEach((stack) => {
      lines.push(`- \`${stack}\``)
    })
  }
  lines.push(
    zh
      ? `\n**字号：** ${tokens.typography.fontSizes.join(', ')}`
      : `\n**Font sizes:** ${tokens.typography.fontSizes.join(', ')}`,
  )
  lines.push(
    zh
      ? `\n**字重：** ${tokens.typography.fontWeights.join(', ')}`
      : `\n**Font weights:** ${tokens.typography.fontWeights.join(', ')}`,
  )
  if (tokens.typography.letterSpacings?.length > 0) {
    lines.push(
      zh
        ? `\n**字间距：** ${tokens.typography.letterSpacings.join(', ')}`
        : `\n**Letter spacing:** ${tokens.typography.letterSpacings.join(', ')}`,
    )
  }

  // Layout
  lines = sections.layout
  lines.push(zh ? '### 可复用间距候选\n' : '### Reusable Spacing Candidates\n')
  if (tokens.spacing.length > 0) {
    lines.push(
      tokens.spacing
        .map((s, i) => {
          const count = tokens.usageCount?.[`spacing:${s}`] || 0
          return zh
            ? `- 级别 ${i + 1}: \`${s}\`${count > 0 ? ` (${count}×)` : ''}`
            : `- Level ${i + 1}: \`${s}\`${count > 0 ? ` (${count}×)` : ''}`
        })
        .join('\n'),
    )
  } else {
    lines.push(zh ? '- 未观察到可靠的间距刻度。' : '- No reliable spacing scale was observed.')
  }
  lines.push(
    zh
      ? '\n> 超过 96px 的低频页面几何不进入可复用刻度；有代表性的结构尺寸与响应式变化已保留在本文档中。'
      : '\n> Low-frequency page geometry above 96px is excluded from the reusable scale; representative structural dimensions and responsive changes remain in this document.',
  )
  if (documentBreakpoints.length > 0) {
    lines.push(zh ? '\n### CSS 中声明的响应式断点\n' : '\n### Responsive Breakpoints Declared in CSS\n')
    lines.push(
      zh
        ? '> 下列宽度来自 CSS media/container query；只有列出的变化才经过直接观察，空白不代表页面在该宽度没有变化。\n'
        : '> These widths come from CSS media/container queries. Only listed changes were directly observed; an empty cell does not prove that nothing changes at that width.\n',
    )
    lines.push(zh ? '| 标签 | 宽度 | 直接观察到的变化 |' : '| Label | Width | Directly observed changes |')
    lines.push('|-------|-------|-------|')
    documentBreakpoints.forEach((breakpoint) => {
      lines.push(`| ${breakpoint.label} | \`${breakpoint.width}px\` | ${breakpoint.layoutChanges?.join(', ') || '-'} |`)
    })
  }
  const sectionGradients = [
    ...new Map(
      (designEvidence?.sections || []).flatMap((section) => {
        const gradient = section.observedStyles?.gradient
        const role = reconstructionRole(section.role)
        return gradient ? [[`${role}|${gradient.value}`, { section, gradient, role }] as const] : []
      }),
    ).values(),
  ].slice(0, 8)
  if (sectionGradients.length > 0) {
    lines.push(zh ? '\n### 区块渐变处理\n' : '\n### Section Gradient Treatments\n')
    for (const { section, gradient, role } of sectionGradients) {
      const structure = [gradient.type, gradient.direction, gradient.stops.join(' → ')].filter(Boolean).join(' · ')
      lines.push(`- ${role} · \`${section.id}\`: \`${gradient.value}\` (${structure})`)
    }
  }

  // Elevation
  lines = sections.elevation
  if (tokens.shadows.length > 0) {
    lines.push(zh ? '### 阴影\n' : '### Shadows\n')
    lines.push(tokens.shadows.map((shadow, index) => `- ${SHADOW_NAMES[index] || index}: \`${shadow}\``).join('\n'))
  } else {
    lines.push(
      zh
        ? '未观察到稳定的阴影刻度；应通过边框、表面颜色和内容层级表达深度。'
        : 'No stable shadow scale was observed; express depth through borders, surface colors, and content hierarchy.',
    )
  }
  if (tokens.zIndices?.length > 0) {
    lines.push(zh ? '\n### 层级（Z-Index）\n' : '\n### Z-Index Layers\n')
    lines.push(
      tokens.zIndices
        .map((zIndex, index) => (zh ? `- 层级 ${index + 1}: \`${zIndex}\`` : `- Layer ${index + 1}: \`${zIndex}\``))
        .join('\n'),
    )
  }
  if (tokens.transitions?.length > 0) {
    lines.push(zh ? '\n### 过渡时长\n' : '\n### Transition Durations\n')
    lines.push(
      tokens.transitions.map((transition, index) => `- ${proseDurationName(index)}: \`${transition}\``).join('\n'),
    )
  }

  // Shapes
  lines = sections.shapes
  if (tokens.radii.length > 0) {
    lines.push(zh ? '### 圆角刻度\n' : '### Corner Radius Scale\n')
    lines.push(
      tokens.radii
        .map((radius, index) => {
          const count = tokens.usageCount?.[`radius:${radius}`] || 0
          return `- ${RADIUS_NAMES[index] || index}: \`${radius}\`${count > 0 ? ` (${count}×)` : ''}`
        })
        .join('\n'),
    )
  } else {
    lines.push(zh ? '未观察到可靠的圆角刻度。' : 'No reliable corner radius scale was observed.')
  }
  const structuralRadii = [
    ...new Map(
      (designEvidence?.sections || []).flatMap((section) => {
        const borderRadius = section.observedStyles?.borderRadius
        const role = reconstructionRole(section.role)
        return borderRadius ? [[`${role}|${borderRadius}`, { section, borderRadius, role }] as const] : []
      }),
    ).values(),
  ].slice(0, 8)
  if (structuralRadii.length > 0) {
    lines.push(zh ? '\n### 结构圆角\n' : '\n### Structural Shapes\n')
    for (const { section, borderRadius, role } of structuralRadii) {
      lines.push(`- ${role} · \`${section.id}\`: \`${borderRadius}\``)
    }
  }

  // Components
  lines = sections.components
  const proseComponents = [...documentComponents, ...freeformEvidenceComponents]
  if (proseComponents.length > 0) {
    if (designEvidence) {
      lines.push(
        zh
          ? '> 实例数按每个页面的一次代表性捕获统计；优先使用桌面端。其他视口只用于响应式观察，不重复累计实例。\n'
          : '> Instance counts use one canonical capture per page, preferring desktop. Other viewports inform responsive observations and are not added again.\n',
      )
    }
    lines.push(
      zh ? '| 类型 | 实例数 | 置信度 | 代表样式 |' : '| Type | Instances | Confidence | Representative styles |',
    )
    lines.push('|---|---:|---:|---|')
    proseComponents.forEach((component) => {
      const styles = usefulComponentStyles(component.styles, tokens)
        .map(([property, value]) => `\`${property}: ${value}\``)
        .join('<br>')
      const elementKinds = 'elementKinds' in component ? (component.elementKinds as string[] | undefined) : undefined
      const kinds = elementKinds?.length ? elementKinds.join(', ') : '-'
      const sampleSize =
        'sampleSize' in component ? (component.sampleSize as { width: number; height: number } | undefined) : undefined
      const representative = [
        kinds !== '-' ? `\`elementKind: ${kinds}\`` : '',
        sampleSize ? `\`sample: ${sampleSize.width}×${sampleSize.height}px\`` : '',
        styles,
      ]
        .filter(Boolean)
        .join('<br>')
      lines.push(`| ${component.name} | ${component.count} | ${component.confidence} | ${representative || '-'} |`)
    })
    if (
      documentComponents.some((component) =>
        component.evidence.includes('component-detector:supplemental:no-instance-provenance'),
      )
    ) {
      lines.push(
        zh
          ? '\n> Detector 补充项：仅为聚合模式，不具备 DOM 实例级 provenance；与 Evidence 重叠的计数未相加。'
          : '\n> Detector supplement; aggregated pattern without instance-level provenance. Counts overlapping Evidence were not added.',
      )
    }
    const contrastWarnings = componentContrastWarnings(documentComponents, tokens)
    if (contrastWarnings.length > 0) {
      lines.push(`\n${coreT(language, 'export.contrast.heading')}\n`)
      for (const warning of contrastWarnings) {
        if (warning.schemaTextColorNote) {
          lines.push(
            coreT(language, 'export.contrast.iconSchemaNote', {
              name: warning.name,
              foreground: warning.foreground,
              backgroundKind: coreT(
                language,
                warning.inferred ? 'export.contrast.inferredSurface' : 'export.contrast.observedBackground',
              ),
              background: warning.background,
              ratio: warning.ratio.toFixed(2),
            }),
          )
          continue
        }
        lines.push(
          coreT(language, 'export.contrast.warning', {
            name: warning.name,
            foreground: warning.foreground,
            backgroundKind: coreT(
              language,
              warning.inferred ? 'export.contrast.inferredSurface' : 'export.contrast.observedBackground',
            ),
            background: warning.background,
            ratio: warning.ratio.toFixed(2),
            target: warning.target,
            controlKind: coreT(
              language,
              warning.target === 3 ? 'export.contrast.iconControl' : 'export.contrast.textControl',
            ),
            inferredSuffix: warning.inferred ? coreT(language, 'export.contrast.inferredSuffix') : '',
          }),
        )
      }
    }
  } else {
    lines.push(
      zh
        ? '本次未观察到足够可靠的组件模式；请使用上面的令牌和原页面证据实现组件。'
        : 'No component pattern was observed with enough confidence; implement components from the tokens and source evidence above.',
    )
  }

  lines = sections.dosAndDonts
  lines.push(
    withoutCanonicalHeading(
      generateDosAndDonts(tokens, language, documentComponents, {
        hasDeclaredBreakpoints: (designEvidence?.breakpoints.length || 0) > 0,
        hasObservedResponsiveBehavior: (designEvidence?.responsiveObservations.length || 0) > 0,
      }),
    ),
  )

  lines = appendixLines

  if (designEvidence) {
    lines.push('')
    lines.push(generateDesignEvidenceBrief(designEvidence, language))
  }

  if (designProfile) {
    lines.push('')
    lines.push(generateDesignProfileMarkdown(designProfile, tokens, publicColorNames, designEvidence))
  }

  if (tokens.evidence && Object.keys(tokens.evidence).length > 0) {
    const evidenceValues = Object.values(tokens.evidence)
    const confidenceCounts = evidenceValues.reduce(
      (counts, item) => ({ ...counts, [item.confidence]: counts[item.confidence] + 1 }),
      { high: 0, medium: 0, low: 0 },
    )
    const lowConfidence = Object.entries(tokens.evidence)
      .filter(([, item]) => item.confidence === 'low')
      .map(([tokenPath, item]) => {
        const colorName = /^colors\.(.+)$/.exec(tokenPath)?.[1]
        const publicPath = colorName ? `colors.${publicColorNames.get(colorName) || colorName}` : tokenPath
        return `\`${publicPath}\` (\`${item.value}\`)`
      })
      .slice(0, 12)
    lines.push(zh ? '\n## 提取置信度\n' : '\n## Extraction Confidence\n')
    lines.push(
      zh
        ? `- 高：${confidenceCounts.high}；中：${confidenceCounts.medium}；低：${confidenceCounts.low}`
        : `- High: ${confidenceCounts.high}; medium: ${confidenceCounts.medium}; low: ${confidenceCounts.low}`,
    )
    if (lowConfidence.length > 0) {
      lines.push(
        zh ? `- 建议人工确认：${lowConfidence.join('、')}` : `- Review recommended: ${lowConfidence.join(', ')}`,
      )
    }
  }

  if (!designEvidence) {
    lines.push('')
    lines.push(generateDesignPrinciples(tokens, language))
  }

  if (designEvidence) {
    lines.push('')
    lines.push(coreT(language, 'export.howToUse.heading'))
    lines.push('')
    lines.push(
      !designProfile
        ? coreT(language, 'export.howToUse.observedOnly')
        : coreT(language, 'export.howToUse.catalogComplete'),
    )
    lines.push(coreT(language, 'export.howToUse.catalogImplementation'))
    lines.push(coreT(language, 'export.howToUse.verify'))
    lines.push(coreT(language, 'export.howToUse.formats'))
  } else {
    lines.push(generateAgentGuide(tokens, documentUrl, language))
  }

  return renderDesignMdDocument({
    frontMatter,
    title: zh ? '设计系统' : 'Design System',
    sections,
    appendices: [appendixLines.join('\n')],
  })
}

function createDtcgGroups(tokens: DesignToken): Record<string, unknown> {
  const groups: Record<string, unknown> = {
    color: {},
    typography: {},
    spacing: {},
    borderRadius: {},
    shadow: {},
    zIndex: {},
    transition: {},
    $extensions: {
      'com.imprint.borders': tokens.borders,
      ...(tokens.evidence ? { 'com.imprint.tokenEvidence': tokens.evidence } : {}),
      ...(tokens.colorRoles ? { 'com.imprint.colorRoles': tokens.colorRoles } : {}),
    },
  }

  const colors = groups.color as Record<string, unknown>
  for (const [name, value] of Object.entries(tokens.colors)) {
    colors[name] = { $type: 'color', $value: value }
  }

  const typo = groups.typography as Record<string, unknown>
  typo['fontFamilies'] = {
    $type: 'fontFamily',
    $value: tokens.typography.fontFamilies,
  }
  typo['fontStacks'] = {
    $type: 'fontFamily',
    $value: tokens.typography.fontStacks || [],
  }
  typo['fontSizes'] = {
    $type: 'dimension',
    $value: tokens.typography.fontSizes,
  }
  typo['fontWeights'] = {
    $type: 'fontWeight',
    $value: tokens.typography.fontWeights,
  }
  typo['lineHeights'] = {
    $type: 'number',
    $value: tokens.typography.lineHeights.map((value) => Number(value)).filter(Number.isFinite),
  }
  if (tokens.typography.letterSpacings?.length > 0) {
    typo['letterSpacing'] = {
      $type: 'dimension',
      $value: tokens.typography.letterSpacings,
    }
  }

  const spacing = groups.spacing as Record<string, unknown>
  tokens.spacing.forEach((val, i) => {
    spacing[`${i + 1}`] = { $type: 'dimension', $value: val }
  })

  const radius = groups.borderRadius as Record<string, unknown>
  tokens.radii.forEach((val, i) => {
    radius[RADIUS_NAMES[i] || `${i}`] = { $type: 'dimension', $value: val }
  })

  const shadow = groups.shadow as Record<string, unknown>
  tokens.shadows.forEach((val, i) => {
    shadow[SHADOW_NAMES[i] || `${i}`] = { $type: 'shadow', $value: val }
  })

  const zIndex = groups.zIndex as Record<string, unknown>
  tokens.zIndices?.forEach((val, i) => {
    zIndex[`${(i + 1) * 10}`] = { $type: 'number', $value: parseInt(val) }
  })

  const transition = groups.transition as Record<string, unknown>
  tokens.transitions?.forEach((val, i) => {
    transition[proseDurationName(i)] = { $type: 'duration', $value: val }
  })

  return groups
}

export function generateDtcgJson(tokens: DesignToken, darkMode?: DarkModeExportData): string {
  const dtcg: Record<string, unknown> = {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    ...createDtcgGroups(tokens),
  }

  if (darkMode?.hasDarkMode && darkMode.darkTokens) {
    dtcg.dark = createDtcgGroups(darkMode.darkTokens)
    dtcg.$extensions = {
      ...(dtcg.$extensions as Record<string, unknown>),
      'com.imprint.darkMode': {
        method: darkMode.method || 'none',
        ...(darkMode.method === 'class-toggle' ? { selector: normalizeDarkSelector(darkMode.selector) } : {}),
      },
    }
  }

  return JSON.stringify(dtcg, null, 2)
}

export function generateScssVariables(tokens: DesignToken, darkMode?: DarkModeExportData): string {
  const lines: string[] = ['// Design System SCSS Variables', '// Generated by Imprint', '']

  for (const [name, value] of Object.entries(tokens.colors)) {
    lines.push(`$color-${name}: ${value};`)
  }
  lines.push('')

  if (tokens.typography.fontFamilies.length > 0) {
    lines.push(`$font-sans: ${tokens.typography.fontStacks?.[0] || tokens.typography.fontFamilies[0]};`)
  }
  lines.push('')

  tokens.typography.fontSizes.forEach((val, i) => {
    lines.push(`$font-size-${FONT_SIZE_NAMES[i] || i + 1}: ${val};`)
  })
  tokens.typography.fontWeights.forEach((val, i) => lines.push(`$font-weight-${i + 1}: ${val};`))
  tokens.typography.lineHeights.forEach((val, i) => lines.push(`$line-height-${i + 1}: ${val};`))
  tokens.typography.letterSpacings?.forEach((val, i) => {
    lines.push(`$letter-spacing-${LETTER_SPACING_NAMES[i] || i + 1}: ${val};`)
  })
  lines.push('')

  tokens.spacing.forEach((val, i) => {
    lines.push(`$spacing-${i + 1}: ${val};`)
  })
  lines.push('')

  tokens.radii.forEach((val, i) => {
    lines.push(`$radius-${RADIUS_NAMES[i] || i + 1}: ${val};`)
  })
  lines.push('')

  tokens.shadows.forEach((val, i) => {
    lines.push(`$shadow-${SHADOW_NAMES[i] || i + 1}: ${val};`)
  })

  tokens.borders.forEach((val, i) => lines.push(`$border-${i + 1}: ${val};`))

  if (tokens.zIndices?.length > 0) {
    lines.push('')
    tokens.zIndices.forEach((val, i) => {
      lines.push(`$z-${(i + 1) * 10}: ${val};`)
    })
  }

  if (tokens.transitions?.length > 0) {
    lines.push('')
    tokens.transitions.forEach((val, i) => {
      lines.push(`$duration-${DURATION_NAMES[i] || i + 1}: ${val};`)
    })
  }

  if (darkMode?.hasDarkMode && darkMode.darkTokens) {
    const darkTokens = darkMode.darkTokens
    lines.push('', '// Captured dark mode values')
    for (const [name, value] of Object.entries(darkTokens.colors)) {
      lines.push(`$dark-color-${name}: ${value};`)
    }
    darkTokens.typography.fontSizes.forEach((value, index) => {
      lines.push(`$dark-font-size-${FONT_SIZE_NAMES[index] || index + 1}: ${value};`)
    })
    darkTokens.typography.fontWeights.forEach((value, index) => {
      lines.push(`$dark-font-weight-${index + 1}: ${value};`)
    })
    darkTokens.typography.lineHeights.forEach((value, index) => {
      lines.push(`$dark-line-height-${index + 1}: ${value};`)
    })
    darkTokens.typography.letterSpacings?.forEach((value, index) => {
      lines.push(`$dark-letter-spacing-${LETTER_SPACING_NAMES[index] || index + 1}: ${value};`)
    })
    darkTokens.spacing.forEach((value, index) => lines.push(`$dark-spacing-${index + 1}: ${value};`))
    darkTokens.radii.forEach((value, index) => {
      lines.push(`$dark-radius-${RADIUS_NAMES[index] || index + 1}: ${value};`)
    })
    darkTokens.shadows.forEach((value, index) => {
      lines.push(`$dark-shadow-${SHADOW_NAMES[index] || index + 1}: ${value};`)
    })
    darkTokens.borders.forEach((value, index) => lines.push(`$dark-border-${index + 1}: ${value};`))
    darkTokens.zIndices?.forEach((value, index) => lines.push(`$dark-z-${(index + 1) * 10}: ${value};`))
    darkTokens.transitions?.forEach((value, index) => {
      lines.push(`$dark-duration-${DURATION_NAMES[index] || index + 1}: ${value};`)
    })

    lines.push('', '@mixin imprint-dark-theme {')
    appendThemeCustomProperties(lines, darkTokens, {
      fontFamily:
        darkTokens.typography.fontFamilies.length > 0
          ? darkTokens.typography.fontStacks?.[0] || darkTokens.typography.fontFamilies[0]
          : undefined,
      includeFontSizes: true,
      includeFontWeights: true,
      includeLineHeights: true,
      includeShadows: true,
      includeBorders: true,
      includeLetterSpacings: true,
      includeZIndices: true,
      indent: '  ',
    })
    lines.push('}', '')
    if (darkMode.method === 'media-query') {
      lines.push('@media (prefers-color-scheme: dark) {', '  :root {', '    @include imprint-dark-theme;', '  }', '}')
    } else {
      lines.push(`${normalizeDarkSelector(darkMode.selector)} {`, '  @include imprint-dark-theme;', '}')
    }
  }

  return lines.join('\n')
}

export function generatePdfHtml(
  tokens: DesignToken,
  url?: string,
  featureTags?: string[],
  darkMode?: DarkModeExportData,
): string {
  const colorSwatches = Object.entries(tokens.colors)
    .map(
      ([name, value]) =>
        `<div style="display:inline-flex;align-items:center;gap:8px;margin:4px 0;">
      <div style="width:24px;height:24px;border-radius:4px;background:${value};border:1px solid #ddd;"></div>
      <code>--color-${name}</code>: <code>${value}</code>
    </div>`,
    )
    .join('<br>')
  const darkColorSwatches = darkMode?.darkTokens
    ? Object.entries(darkMode.darkTokens.colors)
        .map(
          ([name, value]) =>
            `<div style="display:inline-flex;align-items:center;gap:8px;margin:4px 0;">
      <div style="width:24px;height:24px;border-radius:4px;background:${value};border:1px solid #555;"></div>
      <code>--color-${name}</code>: <code>${value}</code>
    </div>`,
        )
        .join('<br>')
    : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Design Style Guide</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a; }
  h1 { font-size: 28px; border-bottom: 2px solid #e5e5e5; padding-bottom: 12px; }
  h2 { font-size: 20px; margin-top: 32px; color: #333; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  .tag { display: inline-block; background: #e8f0fe; color: #1967d2; padding: 3px 10px; border-radius: 12px; font-size: 12px; margin: 2px; }
  .section { margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
  th { background: #f9f9f9; font-weight: 600; }
</style>
</head>
<body>
<h1>Design Style Guide</h1>
${url ? `<p>Source: <a href="${url}">${url}</a></p>` : ''}
${featureTags?.length ? `<p>${featureTags.map((t) => `<span class="tag">${t}</span>`).join(' ')}</p>` : ''}

<h2>Colors</h2>
<div class="section">${colorSwatches}</div>
${darkColorSwatches ? `<h2>Dark Mode Colors</h2><div class="section">${darkColorSwatches}</div>` : ''}

<h2>Typography</h2>
<div class="section">
  <p><strong>Font families:</strong> ${tokens.typography.fontFamilies.join(', ') || 'System default'}</p>
  ${tokens.typography.fontStacks?.length ? `<p><strong>Full stacks:</strong></p><ul>${tokens.typography.fontStacks.map((s) => `<li><code>${s}</code></li>`).join('')}</ul>` : ''}
  <p><strong>Font sizes:</strong> ${tokens.typography.fontSizes.join(', ')}</p>
  <p><strong>Font weights:</strong> ${tokens.typography.fontWeights.join(', ')}</p>
  ${tokens.typography.letterSpacings?.length ? `<p><strong>Letter spacing:</strong> ${tokens.typography.letterSpacings.join(', ')}</p>` : ''}
</div>

<h2>Spacing</h2>
<div class="section">
  <table>
    <tr><th>Level</th><th>Value</th></tr>
    ${tokens.spacing.map((s, i) => `<tr><td>${i + 1}</td><td><code>${s}</code></td></tr>`).join('\n    ')}
  </table>
</div>

<h2>Border Radius</h2>
<div class="section">
  <table>
    <tr><th>Size</th><th>Value</th></tr>
    ${tokens.radii.map((r, i) => `<tr><td>${RADIUS_NAMES[i] || i}</td><td><code>${r}</code></td></tr>`).join('\n    ')}
  </table>
</div>

${
  tokens.shadows.length > 0
    ? `<h2>Shadows</h2>
<div class="section">
  ${tokens.shadows.map((s, i) => `<p>${SHADOW_NAMES[i] || i}: <code>${s}</code></p>`).join('\n  ')}
</div>`
    : ''
}
${
  tokens.zIndices?.length
    ? `<h2>Z-Index Layers</h2>
<div class="section"><code>${tokens.zIndices.join(' | ')}</code></div>`
    : ''
}
${
  tokens.transitions?.length
    ? `<h2>Transitions</h2>
<div class="section"><code>${tokens.transitions.join(' | ')}</code></div>`
    : ''
}
</body>
</html>`
}
