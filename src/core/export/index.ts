import { stringify } from 'yaml'

import {
  generateAgentGuide,
  generateDesignPrinciples,
  generateDosAndDonts,
  generateExampleComponents,
} from '../analyzer/agent-guide.js'
import type { DocLanguage } from '../analyzer/agent-guide.js'
import { clusterColors, normalizeColorValue } from '../analyzer/color-cluster.js'
import {
  classifyComponentVariant,
  isContextDependentColor,
  isPillRadius,
  isTransparentColor,
  summarizeComponentVariants,
} from '../analyzer/component-detect.js'
import type { ComponentPattern, ComponentType, ComponentVariantPattern } from '../analyzer/component-detect.js'
import { buildDesignTokens } from '../analyzer/token-builder.js'
import type { ColorRenameProposal } from '../analyzer/token-renamer.js'
import type { DarkModeResult, DesignToken, GeneratedExampleComponent } from '../analyzer/types.js'
import { generateDesignEvidenceBrief, generateDesignEvidenceJson } from '../design-evidence/evidence-export.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { generateDesignProfileJson, generateDesignProfileMarkdown } from '../design-intelligence/profile-export.js'
import type { DesignIntelligenceMeta, DesignIntelligenceStatus, DesignProfile } from '../design-intelligence/types.js'

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

function usageForColor(tokens: DesignToken, category: string, value: string): number {
  const normalized = normalizeColorValue(value)
  if (!normalized) return 0
  const prefix = `${category}:`
  return Object.entries(tokens.usageCount || {}).reduce((total, [key, count]) => {
    if (!key.startsWith(prefix)) return total
    return normalizeColorValue(key.slice(prefix.length)) === normalized ? total + count : total
  }, 0)
}

function observedColorGroups(tokens: DesignToken): Array<{ label: string; names: string[] }> {
  const groups = new Map<string, Array<{ name: string; score: number }>>([
    ['action', []],
    ['status', []],
    ['text', []],
    ['surface', []],
    ['border', []],
  ])
  const roleCategories = {
    action: ['primaryActionColor', 'actionColor', 'selectedColor', 'accentColor', 'brandTokenColor', 'linkColor'],
    status: ['statusColor'],
    text: ['textColor'],
    surface: ['bgColor', 'bgArea'],
    border: ['borderColor', 'structuralBorderColor'],
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
  const rolePriority = ['action', 'status', 'text', 'surface', 'border'] as const
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
    if (!dominantRole || dominantRole.score <= 0) continue
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
        [/danger|warning|success|status|badge/i, 'status'],
        [/^(?:background|surface|secondary)(?:-|$)/i, 'surface'],
        [/^(?:foreground|muted-foreground|text)(?:-|$)/i, 'text'],
        [/^border(?:-|$)/i, 'border'],
        [/^(?:primary|accent|action|brand|link)(?:-|$)/i, 'action'],
      ] as const
    ).find(([pattern, role]) => pattern.test(canonical.name) && scores[role] > 0)?.[1]
    const assignedRole = semanticRole || dominantRole.role
    groups.get(assignedRole)?.push({ name: canonical.name, score: scores[assignedRole] })
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

function designSystemName(source: string | undefined): string {
  if (!source) return 'Extracted Design System'
  try {
    const hostname = new URL(source).hostname.replace(/^www\./, '')
    return hostname ? `${hostname} Design System` : 'Extracted Design System'
  } catch {
    return 'Extracted Design System'
  }
}

function stableColorValueSlug(normalized: string): string {
  if (/^#[\da-f]{6}$/i.test(normalized)) return normalized.slice(1).toLowerCase()
  const rgba = normalized.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/i)
  if (rgba) {
    const rgb = rgba
      .slice(1, 4)
      .map((channel) => Number(channel).toString(16).padStart(2, '0'))
      .join('')
    const alpha = Math.round(Number(rgba[4]) * 255)
      .toString(16)
      .padStart(2, '0')
    return `${rgb}-${alpha}`
  }
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function stableDesignMdColorName(
  currentName: string,
  normalizedValue: string,
  aliasesByName: ReadonlyMap<string, string>,
  fallbackPrefix: string,
): string {
  const sourceName = aliasesByName.get(currentName) || currentName
  return /^(?:dark-)?palette-\d+$/.test(sourceName)
    ? `${fallbackPrefix}-${stableColorValueSlug(normalizedValue)}`
    : sourceName
}

export function buildDesignMdColorTokens(
  tokens: DesignToken,
  aliases: readonly ColorRenameProposal[] = [],
  fallbackPrefix = 'observed',
): Record<string, string> {
  const aliasesByName = new Map(aliases.map((alias) => [alias.name, alias.tokenId]))
  return Object.fromEntries(
    Object.entries(tokens.colors).flatMap(([name, value]) => {
      const normalized = normalizeColorValue(value)
      return normalized ? [[stableDesignMdColorName(name, normalized, aliasesByName, fallbackPrefix), normalized]] : []
    }),
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
  breakpoints?: Array<{ width: number; label: string }>
  components?: ComponentVariantPattern[]
  evidence?: DesignEvidence
  profile?: DesignProfile | null
  status?: DesignIntelligenceStatus
  meta?: DesignIntelligenceMeta
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
    evidence.components.flatMap((component) => {
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
          role: component.role,
          ...(pageWidth ? { widthPx: component.rect.width * pageWidth } : {}),
          ...(pageHeight ? { heightPx: component.rect.height * pageHeight } : {}),
        },
      ]
    }),
  )
  return evidencePatterns.length > 0 ? evidencePatterns : resolveDesignDocComponents(detectedComponents, tokens)
}

function tokenConfidenceSummary(tokens: DesignToken): Record<'high' | 'medium' | 'low', number> | undefined {
  if (!tokens.evidence || Object.keys(tokens.evidence).length === 0) return undefined
  return Object.values(tokens.evidence).reduce(
    (counts, item) => ({ ...counts, [item.confidence]: counts[item.confidence] + 1 }),
    { high: 0, medium: 0, low: 0 },
  )
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
    evidence,
    profile,
    status,
    meta,
  } = input
  const source = evidence?.source.finalUrl || url
  const colors = buildDesignMdColorTokens(tokens, profile?.tokenAliases)
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
  const unsupportedRadii = tokens.radii.filter((radius) => !isDesignMdDimension(radius))
  const nonstandardTokens = {
    ...(tokens.shadows.length > 0 ? { shadows: tokens.shadows } : {}),
    ...(tokens.borders.length > 0 ? { borders: tokens.borders } : {}),
    ...(unsupportedRadii.length > 0 ? { radii: unsupportedRadii } : {}),
    ...(tokens.zIndices.length > 0 ? { zIndices: tokens.zIndices } : {}),
    ...(tokens.transitions.length > 0 ? { transitions: tokens.transitions } : {}),
  }
  const suggestedColorAliases = (profile?.tokenAliases || []).flatMap((alias) => {
    const value = tokens.colors[alias.name] || tokens.colors[alias.tokenId]
    const normalized = value ? normalizeColorValue(value) : null
    if (!normalized) return []
    return [
      {
        token: stableDesignMdColorName(alias.tokenId, normalized, new Map(), 'observed'),
        name: alias.name,
      },
    ]
  })
  const frontMatter: GoogleDesignMdFrontMatter = {
    version: 'alpha',
    name: designSystemName(source),
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
        featureTags: featureTags || evidence?.featureTags || [],
        evidence: {
          layer: evidence ? 'observed' : 'tokens',
          ...(evidence
            ? {
                analysisId: evidence.analysisId,
                pageCount,
                captureCount: evidence.pages.length,
                coverage: evidence.coverage,
              }
            : {}),
          ...(confidence ? { tokenConfidence: confidence } : {}),
        },
        analysis: {
          aiStatus: status || meta?.status || (profile ? 'unknown' : 'not-requested'),
          ...(profile?.inputMode || meta?.inputMode ? { inputMode: profile?.inputMode || meta?.inputMode } : {}),
          ...(meta?.capabilityLevel ? { capabilityLevel: meta.capabilityLevel } : {}),
          ...(meta?.provider ? { provider: meta.provider } : {}),
          ...(meta?.model ? { model: meta.model } : {}),
          ...(meta?.promptVersion ? { promptVersion: meta.promptVersion } : {}),
          ...(meta?.generatedAt ? { generatedAt: meta.generatedAt } : {}),
          ...(meta
            ? {
                rejectedCount: meta.rejected?.length || 0,
                repairedCount: meta.repaired?.length || 0,
                ...(meta.rejected?.length ? { rejected: meta.rejected.slice(0, 20) } : {}),
                ...(meta.repaired?.length ? { repaired: meta.repaired.slice(0, 20) } : {}),
                ...(meta.tokenUsage ? { tokenUsage: meta.tokenUsage } : {}),
                ...(meta.timing
                  ? {
                      timing: {
                        ...(meta.timing.programTotalMs !== undefined ? { programMs: meta.timing.programTotalMs } : {}),
                        ...(meta.timing.aiTotalMs !== undefined ? { aiMs: meta.timing.aiTotalMs } : {}),
                        ...(meta.timing.userWaitMs !== undefined ? { userWaitExcludedMs: meta.timing.userWaitMs } : {}),
                        activeTotalMs: meta.timing.totalMs,
                      },
                    }
                  : {}),
              }
            : {}),
        },
        ...(suggestedColorAliases.length > 0 ? { suggestedColorAliases } : {}),
        ...(Object.keys(nonstandardTokens).length > 0 ? { nonstandardTokens } : {}),
        ...(components.length > 0
          ? {
              componentSummary: {
                source: evidence?.components.length ? 'design-evidence' : 'component-detector',
                patterns: components.length,
                instances: components.reduce((total, component) => total + component.count, 0),
              },
            }
          : {}),
        ...(resolvedBreakpoints.length > 0 ? { responsive: { breakpoints: resolvedBreakpoints } } : {}),
        ...(darkMode?.hasDarkMode
          ? {
              darkMode: {
                method: darkMode.method || 'none',
                ...(darkMode.selector ? { selector: normalizeDarkSelector(darkMode.selector) } : {}),
                ...(darkMode.darkTokens
                  ? { colors: buildDesignMdColorTokens(darkMode.darkTokens, [], 'dark-observed') }
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
  return blocks.join('\n\n')
}

function withoutCanonicalHeading(markdown: string): string {
  return markdown.replace(/^## Do's and Don'ts\s*/, '').trim()
}

export function generateDesignDoc(
  tokens: DesignToken,
  url?: string,
  featureTags?: string[],
  darkMode?: DarkModeExportData,
  breakpoints?: Array<{ width: number; label: string }>,
  components: ComponentPattern[] = [],
  language: DocLanguage = 'en',
  exampleComponents: readonly GeneratedExampleComponent[] = [],
  designEvidence?: DesignEvidence,
  designProfile?: DesignProfile | null,
  _reconstructionBrief?: string,
  designIntelligenceStatus?: DesignIntelligenceStatus,
  designIntelligenceMeta?: DesignIntelligenceMeta,
): string {
  const zh = language === 'zh-CN'
  const documentUrl = url || designEvidence?.source.requestedUrl
  const documentFeatureTags = featureTags || designEvidence?.featureTags || []
  const documentBreakpoints =
    breakpoints ||
    designEvidence?.breakpoints.map((breakpoint) => ({ width: breakpoint.width, label: breakpoint.label })) ||
    []
  const documentComponents = resolveDesignDocComponents(components, tokens, designEvidence)
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
    evidence: designEvidence,
    profile: designProfile,
    status: designIntelligenceStatus,
    meta: designIntelligenceMeta,
  })
  if (documentUrl) lines.push(zh ? `\n提取自：${documentUrl}` : `\nExtracted from: ${documentUrl}`)

  if (documentFeatureTags.length > 0) {
    lines.push(
      zh
        ? `\n**设计特征：** ${documentFeatureTags.map((tag) => `\`${tag}\``).join(' · ')}`
        : `\n**Design Features:** ${documentFeatureTags.map((tag) => `\`${tag}\``).join(' · ')}`,
    )
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
  const colorGroups = observedColorGroups(tokens)
  if (colorGroups.length > 0) {
    lines.push(zh ? '### 主要观察用途颜色分组\n' : '### Dominant Observed Color Roles\n')
    lines.push(zh ? '| 分组 | 令牌 |' : '| Group | Tokens |')
    lines.push('|---|---|')
    const colorGroupLabels: Record<string, string> = zh
      ? { action: '操作/强调', status: '状态/提示', text: '文字', surface: '表面/背景', border: '边框' }
      : {
          action: 'Action/accent',
          status: 'Status/feedback',
          text: 'Text',
          surface: 'Surface/background',
          border: 'Border',
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
  for (const [name, value] of Object.entries(tokens.colors)) {
    const bgCount = usageForColor(tokens, 'bgColor', value)
    const textCount = usageForColor(tokens, 'textColor', value)
    const borderCount = usageForColor(tokens, 'borderColor', value)
    const total = bgCount + textCount + borderCount
    const contexts = [
      bgCount > 0 ? (zh ? '背景' : 'background') : null,
      textCount > 0 ? (zh ? '文字' : 'text') : null,
      borderCount > 0 ? (zh ? '边框' : 'border') : null,
    ].filter((context): context is string => context !== null)
    const context = contexts.join('+')
    const tokenEvidence = tokens.evidence?.[`colors.${name}`]
    const confidence = tokenEvidence
      ? `${tokenEvidence.confidence} · ${zh ? `${tokenEvidence.pageCount}页` : `${tokenEvidence.pageCount} ${tokenEvidence.pageCount === 1 ? 'page' : 'pages'}`}`
      : '-'
    lines.push(`| \`--color-${name}\` | \`${value}\` | ${total > 0 ? `${total}× (${context})` : '-'} | ${confidence} |`)
  }

  if (darkMode?.hasDarkMode && darkMode.darkTokens) {
    lines.push(zh ? '\n### 深色模式颜色\n' : '\n### Dark Mode Colors\n')
    lines.push(zh ? '| 令牌 | 值 |' : '| Token | Value |')
    lines.push('|-------|-------|')
    for (const [name, value] of Object.entries(darkMode.darkTokens.colors)) {
      lines.push(`| \`--color-${name}\` | \`${value}\` |`)
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
  lines.push(zh ? '### 间距刻度\n' : '### Spacing Scale\n')
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
  if (documentBreakpoints.length > 0) {
    lines.push(zh ? '\n### 响应式断点\n' : '\n### Responsive Breakpoints\n')
    lines.push(zh ? '| 标签 | 宽度 |' : '| Label | Width |')
    lines.push('|-------|-------|')
    documentBreakpoints.forEach((breakpoint) => {
      lines.push(`| ${breakpoint.label} | \`${breakpoint.width}px\` |`)
    })
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
      tokens.transitions
        .map((transition, index) => `- ${DURATION_NAMES[index] || index}: \`${transition}\``)
        .join('\n'),
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

  // Components
  lines = sections.components
  if (documentComponents.length > 0) {
    lines.push(
      zh ? '| 类型 | 实例数 | 置信度 | 代表样式 |' : '| Type | Instances | Confidence | Representative styles |',
    )
    lines.push('|---|---:|---:|---|')
    documentComponents.forEach((component) => {
      const styles = Object.entries(component.styles)
        .map(([property, value]) => `\`${property}: ${value}\``)
        .join('<br>')
      lines.push(`| ${component.name} | ${component.count} | ${component.confidence} | ${styles || '-'} |`)
    })
  } else {
    lines.push(
      zh
        ? '本次未观察到足够可靠的组件模式；请使用上面的令牌和原页面证据实现组件。'
        : 'No component pattern was observed with enough confidence; implement components from the tokens and source evidence above.',
    )
  }

  lines = sections.dosAndDonts
  lines.push(withoutCanonicalHeading(generateDosAndDonts(tokens, language, documentComponents)))

  lines = appendixLines

  if (designEvidence) {
    lines.push('')
    lines.push(generateDesignEvidenceBrief(designEvidence, language, designProfile?.inputMode))
  }

  if (designProfile) {
    lines.push('')
    lines.push(generateDesignProfileMarkdown(designProfile, tokens, designIntelligenceStatus))
  } else if (
    designIntelligenceStatus &&
    ['failed', 'skipped', 'unsupported', 'not-configured', 'not-requested'].includes(designIntelligenceStatus)
  ) {
    lines.push('')
    lines.push(zh ? '## AI 设计解读' : '## AI Design Insights')
    lines.push('')
    lines.push(`**${zh ? '状态' : 'Status'}:** \`${designIntelligenceStatus}\``)
    lines.push('')
    lines.push(
      zh
        ? '> 本次没有可用的 AI 设计解读；下方令牌与证据仍来自确定性程序提取。'
        : '> No AI design interpretation is available for this run; the tokens and evidence below still come from deterministic extraction.',
    )
  }

  if (tokens.evidence && Object.keys(tokens.evidence).length > 0) {
    const evidenceValues = Object.values(tokens.evidence)
    const confidenceCounts = evidenceValues.reduce(
      (counts, item) => ({ ...counts, [item.confidence]: counts[item.confidence] + 1 }),
      { high: 0, medium: 0, low: 0 },
    )
    const lowConfidence = Object.entries(tokens.evidence)
      .filter(([, item]) => item.confidence === 'low')
      .map(([tokenPath, item]) => `\`${tokenPath}\` (\`${item.value}\`)`)
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

  if (exampleComponents.length > 0) {
    lines.push('\n---\n')
    lines.push(generateExampleComponents(exampleComponents, language))
  }

  if (designEvidence) {
    const evidenceFallback = designProfile?.signatureMoves.some((move) => move.id === 'evidence-fallback') ?? false
    lines.push('')
    lines.push(zh ? '## 如何使用' : '## How to Use')
    lines.push('')
    lines.push(
      !designProfile
        ? zh
          ? '- 本文件包含已观察的设计令牌与结构证据；本次未生成 AI 设计解读，交给编码助手前应结合原页面复核。'
          : '- This file contains observed design tokens and structural evidence; no AI interpretation was generated. Check it against the source before using it with a coding assistant.'
        : evidenceFallback
          ? zh
            ? '- 本文件包含已观察的设计令牌与结构证据，但 AI 设计解读已回退；交给编码助手前应人工复核，不应视为完整设计系统。'
            : '- This file contains observed tokens and structural evidence, but the AI interpretation fell back. Review it before use with a coding assistant; it is not a complete design system.'
          : zh
            ? '- 本文件包含基于当前页面覆盖范围提取的设计令牌、结构证据和经校验的设计解读，可提供给 AI 编码助手，并应结合原页面复核。'
            : '- This file contains design tokens, structural evidence, and validated interpretation from the captured page scope. It can be used with AI coding assistants and should be checked against the source.',
    )
    lines.push(
      zh
        ? '- 实现时先采用“已观察”的令牌与结构事实，再采用高/中置信度 AI 解读；低置信度或证据兜底内容需要人工复核。'
        : '- Implement observed tokens and structural facts first, then high/medium-confidence AI insights; manually review low-confidence or evidence-fallback content.',
    )
    lines.push(
      zh
        ? '- 完成页面后，对照当前来源页面或本次截图检查视觉层级、密度和响应式表现。'
        : '- After implementation, compare against the current source or capture for visual hierarchy, density, and responsive behavior.',
    )
    lines.push(
      zh
        ? '- 如需精确的 CSS 变量或 Tailwind 主题配置，请使用 Imprint 的对应导出格式。'
        : '- For exact CSS variables or Tailwind theme config, use the corresponding Imprint export format.',
    )
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
    transition[DURATION_NAMES[i] || `${i}`] = { $type: 'duration', $value: val }
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
