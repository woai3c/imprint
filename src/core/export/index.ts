import { stringify } from 'yaml'

import { generateAgentGuide, generateDesignPrinciples, generateDosAndDonts } from '../analyzer/agent-guide.js'
import type { DocLanguage } from '../analyzer/agent-guide.js'
import { normalizeColorValue } from '../analyzer/color-cluster.js'
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
import { colorContrast } from '../analyzer/token-builder.js'
import type { DesignToken } from '../analyzer/types.js'
import {
  redactUrlsInText,
  sanitizeDesignEvidenceForPersistence,
  sanitizeDesignTokensForPersistence,
  sanitizeUrlForPersistence,
} from '../analyzer/url-privacy.js'
import {
  generateDesignProfileJson,
  generateDesignProfileMarkdown,
  generateTransferBoundariesMarkdown,
  generateTransferComponentsMarkdown,
  generateTransferOverviewMarkdown,
} from '../design-context/profile-export.js'
import { validateDesignProfileTokenReferences } from '../design-context/profile-integrity.js'
import type { DesignProfile } from '../design-context/types.js'
import { resolveScreenshotAssetCoverage } from '../design-evidence/asset-integrity.js'
import { generateDesignEvidenceBrief, generateDesignEvidenceJson } from '../design-evidence/evidence-export.js'
import { resolveDesignSystemName } from '../design-evidence/page-identity.js'
import {
  hasConsistentResponsiveSectionIdentity,
  topLevelGridColumnCount,
  usefulResponsiveChanges,
} from '../design-evidence/responsive-reliability.js'
import { validateEvidenceTokenReferences } from '../design-evidence/token-reference.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { localizeFeatureTag } from '../i18n/feature-tags.js'
import { coreT, coreTranslator } from '../i18n/index.js'
import { type DarkModeExportData, normalizeDarkSelector } from './dark-mode.js'
import { designMdColorEntries } from './design-md-color-names.js'
import {
  FONT_SIZE_NAMES,
  LETTER_SPACING_NAMES,
  LINE_HEIGHT_NAMES,
  RADIUS_NAMES,
  SHADOW_NAMES,
  proseDurationName,
  tailwindFontWeightName,
} from './token-names.js'

export { generateDesignEvidenceJson, generateDesignProfileJson }
export { buildComponentSpecs, generateComponentSpecsJson } from './component-specs.js'
export type { ComponentSpec } from './component-specs.js'
export { buildDarkModeExportData, restoreDarkModeExportData } from './dark-mode.js'
export type { DarkModeExportData } from './dark-mode.js'
export { generateDtcgJson } from './dtcg.js'
export { generatePdfHtml } from './pdf-html.js'
export { generateCssVariables, generateScssVariables, generateTailwindTheme } from './stylesheet-formats.js'
export { FONT_SIZE_NAMES, RADIUS_NAMES, SHADOW_NAMES }
export { comparePixelBuffers, generateLocalVisualQa } from './visual-qa.js'
export type { VisualQaCheck, VisualQaReport, VisualQaStatus } from './visual-qa.js'

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
        featureTags: (featureTags || evidence?.featureTags || []).map((tag) => localizeFeatureTag(tag, language)),
        evidence: {
          layer: evidence ? 'observed' : 'tokens',
          ...(evidence
            ? {
                pageCount,
                captureCount: evidence.pages.length,
                coverage: {
                  ...evidence.coverage,
                  limitations: evidence.coverage.limitations.filter(
                    (limitation) =>
                      !limitation.startsWith('page-health:') &&
                      !limitation.startsWith('skipped:') &&
                      !limitation.startsWith('skipped-interaction:') &&
                      !limitation.startsWith('extraction-issue:'),
                  ),
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

export interface GenerateDesignDocOptions {
  tokens: DesignToken
  url?: string
  featureTags?: string[]
  darkMode?: DarkModeExportData
  breakpoints?: Array<{ width: number; label: string; layoutChanges?: string[] }>
  components?: ComponentPattern[]
  language?: DocLanguage
  designEvidence?: DesignEvidence
  designProfile?: DesignProfile | null
}

export function generateDesignDoc(options: GenerateDesignDocOptions): string
/** @deprecated Prefer the options object overload so optional inputs cannot shift position. */
export function generateDesignDoc(
  inputTokens: DesignToken,
  url?: string,
  featureTags?: string[],
  darkMode?: DarkModeExportData,
  breakpoints?: Array<{ width: number; label: string; layoutChanges?: string[] }>,
  components?: ComponentPattern[],
  language?: DocLanguage,
  inputDesignEvidence?: DesignEvidence,
  designProfile?: DesignProfile | null,
): string
export function generateDesignDoc(
  input: DesignToken | GenerateDesignDocOptions,
  legacyUrl?: string,
  legacyFeatureTags?: string[],
  legacyDarkMode?: DarkModeExportData,
  legacyBreakpoints?: Array<{ width: number; label: string; layoutChanges?: string[] }>,
  legacyComponents: ComponentPattern[] = [],
  legacyLanguage: DocLanguage = 'en',
  legacyDesignEvidence?: DesignEvidence,
  legacyDesignProfile?: DesignProfile | null,
): string {
  const options: GenerateDesignDocOptions =
    'tokens' in input
      ? input
      : {
          tokens: input,
          url: legacyUrl,
          featureTags: legacyFeatureTags,
          darkMode: legacyDarkMode,
          breakpoints: legacyBreakpoints,
          components: legacyComponents,
          language: legacyLanguage,
          designEvidence: legacyDesignEvidence,
          designProfile: legacyDesignProfile,
        }
  const {
    tokens: inputTokens,
    url,
    featureTags,
    darkMode,
    breakpoints,
    components = [],
    language = 'en',
    designEvidence: inputDesignEvidence,
    designProfile,
  } = options
  // Keep the complete portable token tables while resolving every evidence claim against its evidence-owned catalog.
  // The two catalogs have different scopes, so positional references must never cross this boundary.
  const tokens = sanitizeDesignTokensForPersistence(inputTokens)
  const designEvidence = inputDesignEvidence ? sanitizeDesignEvidenceForPersistence(inputDesignEvidence) : undefined
  const evidenceTokens = designEvidence?.tokens || tokens
  if (designEvidence) {
    const evidenceIntegrity = validateEvidenceTokenReferences(designEvidence)
    if (!evidenceIntegrity.valid) {
      throw new Error(
        `Design Evidence token reference integrity failed: ${evidenceIntegrity.errors.slice(0, 8).join('; ')}`,
      )
    }
  }
  if (designProfile) {
    const profileIntegrity = validateDesignProfileTokenReferences(designProfile, evidenceTokens, designEvidence)
    if (!profileIntegrity.valid) {
      throw new Error(
        `Design Profile token reference integrity failed: ${profileIntegrity.errors.slice(0, 8).join('; ')}`,
      )
    }
  }
  const docT = coreTranslator(language, 'export.designDoc')
  const documentUrl = sanitizeUrlForPersistence(url || designEvidence?.source.requestedUrl || '') || undefined
  const documentFeatureTags = (featureTags || designEvidence?.featureTags || []).filter(
    (tag) => tag !== 'extensive CSS variable usage',
  )
  const documentBreakpoints =
    breakpoints ||
    designEvidence?.breakpoints.map((breakpoint) => ({
      width: breakpoint.width,
      label: breakpoint.label,
      layoutChanges: breakpoint.layoutChanges,
    })) ||
    []
  const documentComponents = resolveDesignDocComponents(components, evidenceTokens, designEvidence)
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
  const publicColorEntries = designMdColorEntries(tokens)
  const publicColorNames = new Map(publicColorEntries.map((entry) => [entry.sourceName, entry.publicName]))
  const evidenceColorEntries = designMdColorEntries(evidenceTokens)
  const evidenceColorNames = new Map(evidenceColorEntries.map((entry) => [entry.sourceName, entry.publicName]))
  if (designProfile?.transferGrammar) {
    lines.push(generateTransferOverviewMarkdown(designProfile, evidenceTokens, evidenceColorNames, designEvidence), '')
  }
  if (designEvidence)
    lines.push(
      ...reconstructionSummary(
        designEvidence,
        evidenceTokens,
        [...freeformEvidenceComponents, ...documentComponents],
        language,
      ),
    )
  if (documentUrl) lines.push(docT('extractedFrom', { url: documentUrl }))

  if (documentFeatureTags.length > 0) {
    const tags = documentFeatureTags.map((tag) => `\`${localizeFeatureTag(tag, language)}\``).join(' · ')
    lines.push(`\n${coreT(language, 'export.featureTags.line', { tags })}`)
  }

  if (darkMode?.hasDarkMode) {
    const detection =
      darkMode.method === 'class-toggle'
        ? docT('darkMode.classToggleDetection', { selector: normalizeDarkSelector(darkMode.selector) })
        : docT('darkMode.mediaDetection')
    lines.push(docT('darkMode.supported', { detection }))
  } else {
    lines.push(docT('darkMode.notDetected'))
  }

  // Colors
  lines = sections.colors
  const colorGroups = observedColorGroups(tokens, publicColorNames)
  if (colorGroups.length > 0) {
    lines.push(docT('colors.dominantHeading'))
    lines.push(docT('colors.groupHeader'))
    lines.push('|---|---|')
    for (const group of colorGroups) {
      lines.push(
        `| ${docT(`colors.groups.${group.label}`)} | ${group.names.map((name) => `\`--color-${name}\``).join(', ')} |`,
      )
    }
    lines.push('')
    lines.push(docT('colors.completeHeading'))
  }
  lines.push(docT('colors.tokenHeader'))
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
      actionCount > 0 ? docT('colors.contexts.action') : null,
      statusCount > 0 ? docT('colors.contexts.status') : null,
      bgCount > 0 ? docT('colors.contexts.background') : null,
      textCount > 0 ? docT('colors.contexts.text') : null,
      borderCount > 0 ? docT('colors.contexts.border') : null,
    ].filter((context): context is string => context !== null)
    const context = contexts.join('+')
    const tokenEvidence = tokens.evidence?.[`colors.${sourceName}`]
    const confidence = tokenEvidence
      ? `${tokenEvidence.confidence} · ${docT(
          tokenEvidence.pageCount === 1 ? 'colors.pageCountOne' : 'colors.pageCountOther',
          { count: tokenEvidence.pageCount },
        )}`
      : '-'
    lines.push(
      `| \`--color-${publicName}\` | \`${value}\` | ${renderedCount > 0 ? `${renderedCount}× (${context})` : declaredOnly ? docT('colors.declaredOnly') : '-'} | ${confidence} |`,
    )
  }

  const primaryActionRole = tokens.colorRoles?.primaryAction
  if (primaryActionRole) {
    lines.push(docT('colors.primaryHeading'))
    const pair = primaryActionRole.observedForeground
      ? `\`${primaryActionRole.observedBackground}\` / \`${primaryActionRole.observedForeground}\``
      : `\`${primaryActionRole.observedBackground}\``
    lines.push(docT('colors.primaryPair', { pair }))
    if (primaryActionRole.contrastRatio !== undefined) {
      lines.push(
        docT('colors.observedContrast', {
          ratio: primaryActionRole.contrastRatio.toFixed(2),
          warning: primaryActionRole.contrastWarning ? docT('colors.contrastWarning') : '',
        }),
      )
    }
    if (primaryActionRole.recommendedOnPrimary) {
      const recommendation = primaryActionRole.recommendedOnPrimary
      lines.push(
        docT('colors.primaryRecommendation', {
          value: recommendation.value,
          ratio: recommendation.contrastRatio.toFixed(2),
          target: recommendation.targetContrastRatio,
        }),
      )
    }
  }

  const semanticPairs = tokens.colorRoles?.semanticPairs
  if (semanticPairs && Object.keys(semanticPairs).length > 0) {
    lines.push(docT('colors.statusHeading'))
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
    lines.push(docT('colors.darkHeading'))
    lines.push(docT('colors.valueHeader'))
    lines.push('|-------|-------|')
    for (const { publicName, value } of designMdColorEntries(darkMode.darkTokens, 'dark-observed')) {
      lines.push(`| \`--color-${publicName}\` | \`${value}\` |`)
    }
  }

  // Typography
  lines = sections.typography
  lines.push(
    docT('typography.families', {
      values: tokens.typography.fontFamilies.join(', ') || docT('typography.systemDefault'),
    }),
  )
  if (tokens.typography.fontStacks?.length > 0) {
    lines.push(docT('typography.fullStacks'))
    tokens.typography.fontStacks.forEach((stack) => {
      lines.push(`- \`${stack}\``)
    })
  }
  lines.push(docT('typography.sizes', { values: tokens.typography.fontSizes.join(', ') }))
  lines.push(docT('typography.weights', { values: tokens.typography.fontWeights.join(', ') }))
  if (tokens.typography.letterSpacings?.length > 0) {
    lines.push(docT('typography.letterSpacing', { values: tokens.typography.letterSpacings.join(', ') }))
  }

  // Layout
  lines = sections.layout
  lines.push(docT('layout.spacingHeading'))
  if (tokens.spacing.length > 0) {
    lines.push(
      tokens.spacing
        .map((s, i) => {
          const count = tokens.usageCount?.[`spacing:${s}`] || 0
          return docT('layout.spacingLevel', {
            level: i + 1,
            value: s,
            countSuffix: count > 0 ? ` (${count}×)` : '',
          })
        })
        .join('\n'),
    )
  } else {
    lines.push(docT('layout.noSpacing'))
  }
  lines.push(docT('layout.geometryNote'))
  if (documentBreakpoints.length > 0) {
    lines.push(docT('layout.breakpointHeading'))
    lines.push(docT('layout.breakpointNote'))
    lines.push(docT('layout.breakpointHeader'))
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
    lines.push(docT('layout.gradientHeading'))
    for (const { gradient, role } of sectionGradients) {
      const structure = [gradient.type, gradient.direction, gradient.stops.join(' → ')].filter(Boolean).join(' · ')
      lines.push(`- ${role}: \`${gradient.value}\` (${structure})`)
    }
  }

  // Elevation
  lines = sections.elevation
  if (tokens.shadows.length > 0) {
    lines.push(docT('elevation.shadowHeading'))
    lines.push(tokens.shadows.map((shadow, index) => `- ${SHADOW_NAMES[index] || index}: \`${shadow}\``).join('\n'))
  } else {
    lines.push(docT('elevation.noShadows'))
  }
  if (tokens.zIndices?.length > 0) {
    lines.push(docT('elevation.zIndexHeading'))
    lines.push(
      tokens.zIndices
        .map((zIndex, index) => docT('elevation.zIndexLevel', { level: index + 1, value: zIndex }))
        .join('\n'),
    )
  }
  if (tokens.transitions?.length > 0) {
    lines.push(docT('elevation.transitionHeading'))
    lines.push(
      tokens.transitions.map((transition, index) => `- ${proseDurationName(index)}: \`${transition}\``).join('\n'),
    )
  }

  // Shapes
  lines = sections.shapes
  if (tokens.radii.length > 0) {
    lines.push(docT('shapes.radiusHeading'))
    lines.push(
      tokens.radii
        .map((radius, index) => {
          const count = tokens.usageCount?.[`radius:${radius}`] || 0
          return `- ${RADIUS_NAMES[index] || index}: \`${radius}\`${count > 0 ? ` (${count}×)` : ''}`
        })
        .join('\n'),
    )
  } else {
    lines.push(docT('shapes.noRadius'))
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
    lines.push(docT('shapes.structuralHeading'))
    for (const { borderRadius, role } of structuralRadii) {
      lines.push(`- ${role}: \`${borderRadius}\``)
    }
  }

  // Components
  lines = sections.components
  if (designProfile?.transferGrammar) {
    lines.push(
      generateTransferComponentsMarkdown(designProfile, evidenceTokens, evidenceColorNames, designEvidence),
      '',
    )
  }
  const proseComponents = [...documentComponents, ...freeformEvidenceComponents]
  if (proseComponents.length > 0) {
    if (designEvidence) {
      lines.push(docT('components.canonicalNote'))
    }
    lines.push(docT('components.header'))
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
      lines.push(docT('components.detectorNote'))
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
    lines.push(docT('components.noPatterns'))
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
  if (designProfile?.transferGrammar) {
    lines.push(
      '',
      generateTransferBoundariesMarkdown(designProfile, evidenceTokens, evidenceColorNames, designEvidence),
    )
  }

  lines = appendixLines

  if (designEvidence) {
    lines.push('')
    lines.push(generateDesignEvidenceBrief(designEvidence, language))
  }

  if (designProfile && !designProfile.transferGrammar) {
    lines.push('')
    lines.push(generateDesignProfileMarkdown(designProfile, evidenceTokens, evidenceColorNames, designEvidence))
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
    lines.push(docT('confidence.heading'))
    lines.push(docT('confidence.counts', confidenceCounts))
    if (lowConfidence.length > 0) {
      lines.push(docT('confidence.review', { values: lowConfidence.join(docT('confidence.separator')) }))
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

  return redactUrlsInText(
    renderDesignMdDocument({
      frontMatter,
      title: docT('title'),
      sections,
      appendices: [appendixLines.join('\n')],
    }),
  )
}
