import {
  generateAgentGuide,
  generateDesignPrinciples,
  generateDosAndDonts,
  generateExampleComponents,
} from '../analyzer/agent-guide.js'
import type { DocLanguage } from '../analyzer/agent-guide.js'
import { clusterColors, normalizeColorValue } from '../analyzer/color-cluster.js'
import type { ComponentPattern } from '../analyzer/component-detect.js'
import { buildDesignTokens } from '../analyzer/token-builder.js'
import type { DarkModeResult, DesignToken, GeneratedExampleComponent } from '../analyzer/types.js'
import { generateDesignEvidenceBrief, generateDesignEvidenceJson } from '../design-evidence/evidence-export.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { generateDesignProfileJson, generateDesignProfileMarkdown } from '../design-intelligence/profile-export.js'
import type { DesignProfile } from '../design-intelligence/types.js'

export { generateDesignEvidenceJson, generateDesignProfileJson }

export const FONT_SIZE_NAMES = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl']
export const RADIUS_NAMES = ['sm', 'md', 'lg', 'xl', '2xl']
export const SHADOW_NAMES = ['sm', 'md', 'lg', 'xl']
const LETTER_SPACING_NAMES = ['tight', 'normal', 'wide', 'wider', 'widest']
const LINE_HEIGHT_NAMES = ['tight', 'snug', 'normal', 'relaxed', 'loose']
const DURATION_NAMES = ['fast', 'normal', 'slow', 'slower', 'slowest']

function usageForColor(tokens: DesignToken, category: 'bgColor' | 'textColor' | 'borderColor', value: string): number {
  const normalized = normalizeColorValue(value)
  if (!normalized) return 0
  const prefix = `${category}:`
  return Object.entries(tokens.usageCount || {}).reduce((total, [key, count]) => {
    if (!key.startsWith(prefix)) return total
    return normalizeColorValue(key.slice(prefix.length)) === normalized ? total + count : total
  }, 0)
}

export interface DarkModeExportData {
  hasDarkMode: boolean
  darkTokens?: DesignToken
  method?: 'media-query' | 'class-toggle' | 'none'
  selector?: string
}

export function buildDarkModeExportData(darkMode: DarkModeResult | null | undefined): DarkModeExportData | undefined {
  if (!darkMode?.hasDarkMode || !darkMode.darkStyles) return undefined

  const clusteredColors = clusterColors(darkMode.darkStyles.colors, darkMode.darkStyles.usageCount)
  return {
    hasDarkMode: true,
    darkTokens: buildDesignTokens(darkMode.darkStyles, clusteredColors),
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

  const darkTokens = isDesignToken(storedDarkTokens)
    ? storedDarkTokens
    : { ...baseTokens, colors: storedDarkTokens as Record<string, string> }
  if (Object.keys(darkTokens.colors).length === 0) return undefined
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

export function generateDesignDoc(
  tokens: DesignToken,
  url?: string,
  featureTags?: string[],
  darkMode?: DarkModeExportData,
  breakpoints?: Array<{ width: number; label: string }>,
  _components?: ComponentPattern[],
  language: DocLanguage = 'en',
  exampleComponents: readonly GeneratedExampleComponent[] = [],
  designEvidence?: DesignEvidence,
  designProfile?: DesignProfile | null,
  _reconstructionBrief?: string,
): string {
  const zh = language === 'zh-CN'
  const lines: string[] = []

  lines.push(zh ? '# 设计系统' : '# Design System')
  if (url) lines.push(zh ? `\n提取自：${url}` : `\nExtracted from: ${url}`)

  if (featureTags && featureTags.length > 0) {
    lines.push(
      zh
        ? `\n**设计特征：** ${featureTags.map((t) => `\`${t}\``).join(' · ')}`
        : `\n**Design Features:** ${featureTags.map((t) => `\`${t}\``).join(' · ')}`,
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

  lines.push('')

  if (designEvidence) {
    lines.push(generateDesignEvidenceBrief(designEvidence, language, designProfile?.inputMode))
    lines.push('')
  }

  if (designProfile) {
    lines.push(generateDesignProfileMarkdown(designProfile, tokens))
    lines.push('')
  }

  // Colors
  lines.push(zh ? '## 颜色\n' : '## Colors\n')
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
  lines.push(zh ? '\n## 排版\n' : '\n## Typography\n')
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

  // Spacing
  lines.push(zh ? '\n## 间距\n' : '\n## Spacing\n')
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

  // Radii
  lines.push(zh ? '\n## 圆角\n' : '\n## Border Radius\n')
  lines.push(
    tokens.radii
      .map((r, i) => {
        const count = tokens.usageCount?.[`radius:${r}`] || 0
        return `- ${RADIUS_NAMES[i] || i}: \`${r}\`${count > 0 ? ` (${count}×)` : ''}`
      })
      .join('\n'),
  )

  // Shadows
  if (tokens.shadows.length > 0) {
    lines.push(zh ? '\n## 阴影\n' : '\n## Shadows\n')
    lines.push(tokens.shadows.map((s, i) => `- ${SHADOW_NAMES[i] || i}: \`${s}\``).join('\n'))
  }

  // Z-index
  if (tokens.zIndices?.length > 0) {
    lines.push(zh ? '\n## 层级（Z-Index）\n' : '\n## Z-Index Layers\n')
    lines.push(
      tokens.zIndices.map((z, i) => (zh ? `- 层级 ${i + 1}: \`${z}\`` : `- Layer ${i + 1}: \`${z}\``)).join('\n'),
    )
  }

  // Transitions
  if (tokens.transitions?.length > 0) {
    lines.push(zh ? '\n## 过渡时长\n' : '\n## Transition Durations\n')
    lines.push(tokens.transitions.map((t, i) => `- ${DURATION_NAMES[i] || i}: \`${t}\``).join('\n'))
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

  // Breakpoints
  if (breakpoints && breakpoints.length > 0) {
    lines.push(zh ? '\n## 响应式断点\n' : '\n## Responsive Breakpoints\n')
    lines.push(zh ? '| 标签 | 宽度 |' : '| Label | Width |')
    lines.push('|-------|-------|')
    breakpoints.forEach((bp) => {
      lines.push(`| ${bp.label} | \`${bp.width}px\` |`)
    })
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
    lines.push('')
    lines.push(zh ? '## 如何使用' : '## How to Use')
    lines.push('')
    lines.push(
      zh
        ? '- 本文件包含完整的设计系统信息（颜色、字体、间距、组件模式等），可直接提供给 AI 编码助手（如 Cursor、Claude Code）以辅助 UI 开发。'
        : '- This file contains a complete design system reference (colors, typography, spacing, component patterns, etc.) for use with AI coding assistants (e.g. Cursor, Claude Code).',
    )
    lines.push(
      zh
        ? '- 如需精确的 CSS 变量或 Tailwind 主题配置，请使用 Imprint 的对应导出格式。'
        : '- For exact CSS variables or Tailwind theme config, use the corresponding Imprint export format.',
    )
  } else {
    lines.push(generateAgentGuide(tokens, url, language))
    lines.push(generateDosAndDonts(tokens, language))
  }

  return lines.join('\n')
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
