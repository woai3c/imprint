import { coreTranslator } from '../../core/i18n/index.js'
import type { AppTheme } from './theme-types.js'

function serializeThemeVariables(
  scope: ':root' | '@theme',
  variables: Record<string, string>,
  backgroundImage?: string,
): string {
  if (backgroundImage) variables['--bg-image'] = `url('./${backgroundImage}')`

  const declarations = Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')

  return `${scope} {\n${declarations}\n}\n`
}

export function generateThemeCss(theme: AppTheme): string {
  const { typography, spacing, layout, shape, elevation, motion } = theme.tokens
  const variables: Record<string, string> = {
    ...Object.fromEntries(Object.entries(theme.colors).map(([name, value]) => [`--color-${name}`, value])),
    '--color-input': theme.colors.border,
    '--font-body': typography.fontBody,
    '--font-heading': typography.fontHeading,
    '--font-mono': typography.fontMono,
    '--text-xs': typography.sizes.xs,
    '--text-sm': typography.sizes.sm,
    '--text-base': typography.sizes.base,
    '--text-lg': typography.sizes.lg,
    '--text-xl': typography.sizes.xl,
    '--text-2xl': typography.sizes['2xl'],
    '--tracking-body': typography.letterSpacing.body,
    '--tracking-heading': typography.letterSpacing.heading,
    '--tracking-label': typography.letterSpacing.label,
    '--leading-body': typography.lineHeight.body,
    '--leading-heading': typography.lineHeight.heading,
    '--spacing': spacing.unit,
    '--app-sidebar-width': layout.sidebarWidth,
    '--app-content-max-width': layout.contentMaxWidth,
    '--radius-sm': `max(0px, calc(${shape.radiusBase} - 0.25rem))`,
    '--radius-md': shape.radiusBase,
    '--radius-lg': `calc(${shape.radiusBase} + 0.25rem)`,
    '--radius-xl': `calc(${shape.radiusBase} + 0.5rem)`,
    '--border-width': shape.borderWidth,
    '--icon-stroke-width': shape.iconStrokeWidth,
    '--shadow-sm': elevation.sm,
    '--shadow-md': elevation.md,
    '--shadow-lg': elevation.lg,
    '--focus-ring-shadow': elevation.focus,
    '--motion-fast': motion.fast,
    '--motion-normal': motion.normal,
    '--motion-slow': motion.slow,
    '--motion-easing': motion.easing,
  }

  return serializeThemeVariables(':root', variables, theme.backgroundImage)
}

export function generateThemeTailwind(theme: AppTheme): string {
  const { typography, spacing, layout, shape, elevation, motion } = theme.tokens
  const variables: Record<string, string> = {
    ...Object.fromEntries(Object.entries(theme.colors).map(([name, value]) => [`--color-${name}`, value])),
    '--font-sans': typography.fontBody,
    '--font-heading': typography.fontHeading,
    '--font-mono': typography.fontMono,
    '--text-xs': typography.sizes.xs,
    '--text-sm': typography.sizes.sm,
    '--text-base': typography.sizes.base,
    '--text-lg': typography.sizes.lg,
    '--text-xl': typography.sizes.xl,
    '--text-2xl': typography.sizes['2xl'],
    '--text-xs--line-height': typography.lineHeight.body,
    '--text-sm--line-height': typography.lineHeight.body,
    '--text-base--line-height': typography.lineHeight.body,
    '--text-lg--line-height': typography.lineHeight.heading,
    '--text-xl--line-height': typography.lineHeight.heading,
    '--text-2xl--line-height': typography.lineHeight.heading,
    '--tracking-body': typography.letterSpacing.body,
    '--tracking-heading': typography.letterSpacing.heading,
    '--tracking-label': typography.letterSpacing.label,
    '--leading-body': typography.lineHeight.body,
    '--leading-heading': typography.lineHeight.heading,
    '--spacing': spacing.unit,
    '--width-sidebar': layout.sidebarWidth,
    '--container-content': layout.contentMaxWidth,
    '--radius-sm': `max(0px, calc(${shape.radiusBase} - 0.25rem))`,
    '--radius-md': shape.radiusBase,
    '--radius-lg': `calc(${shape.radiusBase} + 0.25rem)`,
    '--radius-xl': `calc(${shape.radiusBase} + 0.5rem)`,
    '--border-width-theme': shape.borderWidth,
    '--icon-stroke-width': shape.iconStrokeWidth,
    '--shadow-sm': elevation.sm,
    '--shadow-md': elevation.md,
    '--shadow-lg': elevation.lg,
    '--shadow-focus': elevation.focus,
    '--duration-fast': motion.fast,
    '--duration-normal': motion.normal,
    '--duration-slow': motion.slow,
    '--ease-theme': motion.easing,
  }

  return serializeThemeVariables('@theme', variables, theme.backgroundImage)
}

export function generateThemeJson(theme: AppTheme): string {
  const { typography, spacing, shape, elevation, motion } = theme.tokens

  return JSON.stringify(
    {
      meta: {
        generator: 'Imprint',
        name: theme.name,
        description: theme.description,
        category: theme.category,
      },
      identity: theme.identity,
      colors: theme.colors,
      typography: {
        fontFamilies: [typography.fontBody, typography.fontHeading, typography.fontMono],
        fontStacks: [typography.fontBody, typography.fontHeading, typography.fontMono],
        fontSizes: Object.values(typography.sizes),
        fontWeights: [],
        letterSpacings: Object.values(typography.letterSpacing),
        lineHeights: Object.values(typography.lineHeight),
      },
      spacing: [spacing.unit],
      radii: [
        `max(0px, calc(${shape.radiusBase} - 0.25rem))`,
        shape.radiusBase,
        `calc(${shape.radiusBase} + 0.25rem)`,
        `calc(${shape.radiusBase} + 0.5rem)`,
      ],
      shadows: [elevation.sm, elevation.md, elevation.lg],
      borders: [shape.borderWidth],
      zIndices: [],
      transitions: [motion.fast, motion.normal, motion.slow],
      usageCount: {},
      imprintTheme: {
        foundation: theme.tokens,
      },
    },
    null,
    2,
  )
}

export function generateThemeMarkdown(theme: AppTheme, language: 'zh-CN' | 'en'): string {
  const t = coreTranslator(language, 'themeExport')
  const { typography, spacing, layout, shape, elevation, motion } = theme.tokens
  const category = t(`category.${theme.category}`)

  const lines: string[] = [`# ${theme.name}`, '', theme.description, '', `> ${t('category.label')}: ${category}`, '']

  // Design intent
  lines.push(`## ${t('designIntent.heading')}`, '')
  lines.push(`**${t('designIntent.values')}:** ${theme.identity.values.join(' · ')}`, '')
  theme.identity.patterns.forEach((pattern, index) => {
    lines.push(`### ${pattern}`, '', theme.identity.evidence[index], '')
  })

  // Design principles — universal composition rules grounded in this theme's token values
  const densityLabel = t(`density.${spacing.density}`)
  lines.push(`## ${t('principles.heading')}`, '', t('principles.intro'), '')
  lines.push(`### ${t('principles.proximity')}`, '')
  lines.push(t('principles.proximityScale', { unit: spacing.unit }))
  lines.push(t('principles.proximityDensity', { density: densityLabel }), '')
  lines.push(`### ${t('principles.alignment')}`, '')
  lines.push(t('principles.alignmentScale', { unit: spacing.unit }))
  lines.push(t('principles.alignmentSidebar', { sidebarWidth: layout.sidebarWidth }), '')
  lines.push(`### ${t('principles.repetition')}`, '')
  lines.push(t('principles.semanticSteps'))
  lines.push(t('principles.radiusSteps', { radius: shape.radiusBase }), '')
  lines.push(`### ${t('principles.contrast')}`, '')
  lines.push(t('principles.textContrast'))
  lines.push(t('principles.actionContrast'), '')

  // Colors
  lines.push(`## ${t('colors.heading')}`, '')
  lines.push(t('colors.tableHeader'))
  lines.push('|-------|-------|-------|')
  for (const [name, value] of Object.entries(theme.colors)) {
    const key = `colors.usage.${name}`
    const translated = t(key)
    const usage = translated === `themeExport.${key}` ? '-' : translated
    lines.push(`| \`--color-${name}\` | \`${value}\` | ${usage} |`)
  }

  // Typography
  lines.push('', `## ${t('typography.heading')}`, '')
  lines.push(`**${t('typography.fontFamilies')}:**`, '')
  lines.push(`- ${t('typography.body')}: \`${typography.fontBody}\``)
  lines.push(`- ${t('typography.title')}: \`${typography.fontHeading}\``)
  lines.push(`- ${t('typography.monospace')}: \`${typography.fontMono}\``)
  lines.push('')
  lines.push(`**${t('typography.fontSizes')}:**`, '')
  lines.push(t('typography.sizeTableHeader'))
  lines.push('|-------|-------|-------|')
  for (const [name, value] of Object.entries(typography.sizes)) {
    lines.push(`| ${name} | \`${value}\` | \`--text-${name}\` |`)
  }
  lines.push('')
  lines.push(`**${t('typography.lineHeights')}:**`, '')
  lines.push(`- ${t('typography.body')}: \`${typography.lineHeight.body}\``)
  lines.push(`- ${t('typography.title')}: \`${typography.lineHeight.heading}\``)
  lines.push('')
  lines.push(`**${t('typography.letterSpacing')}:**`, '')
  lines.push(`- ${t('typography.body')}: \`${typography.letterSpacing.body}\``)
  lines.push(`- ${t('typography.title')}: \`${typography.letterSpacing.heading}\``)
  lines.push(`- ${t('typography.label')}: \`${typography.letterSpacing.label}\``)

  // Spacing
  lines.push('', `## ${t('spacing.heading')}`, '')
  lines.push(`- ${t('spacing.baseUnit')}: \`${spacing.unit}\``)
  lines.push(`- ${t('spacing.density')}: \`${densityLabel}\``)
  lines.push('')
  lines.push(t('spacing.derived'))
  lines.push('')
  lines.push(t('spacing.tableHeader'))
  lines.push('|-------|-------|')
  const spacingMultipliers = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]
  for (const m of spacingMultipliers) {
    lines.push(`| ${m}x | \`calc(${spacing.unit} * ${m})\` |`)
  }

  // Border Radius
  lines.push('', `## ${t('radius.heading')}`, '')
  lines.push(t('radius.tableHeader'))
  lines.push('|-------|-------|-------|')
  lines.push(`| sm | \`max(0px, calc(${shape.radiusBase} - 0.25rem))\` | \`--radius-sm\` |`)
  lines.push(`| md | \`${shape.radiusBase}\` | \`--radius-md\` |`)
  lines.push(`| lg | \`calc(${shape.radiusBase} + 0.25rem)\` | \`--radius-lg\` |`)
  lines.push(`| xl | \`calc(${shape.radiusBase} + 0.5rem)\` | \`--radius-xl\` |`)

  // Shadows / Elevation
  lines.push('', `## ${t('shadows.heading')}`, '')
  lines.push(t('shadows.tableHeader'))
  lines.push('|-------|-------|')
  lines.push(`| sm | \`${elevation.sm}\` |`)
  lines.push(`| md | \`${elevation.md}\` |`)
  lines.push(`| lg | \`${elevation.lg}\` |`)
  lines.push(`| focus | \`${elevation.focus}\` |`)

  // Borders
  lines.push('', `## ${t('borders.heading')}`, '')
  lines.push(`- ${t('borders.width')}: \`${shape.borderWidth}\``)
  lines.push(`- ${t('borders.iconWidth')}: \`${shape.iconStrokeWidth}\``)

  // Motion
  lines.push('', `## ${t('motion.heading')}`, '')
  lines.push(t('motion.tableHeader'))
  lines.push('|-------|-------|-------|')
  lines.push(`| ${t('motion.fast')} | \`${motion.fast}\` | \`--motion-fast\` |`)
  lines.push(`| ${t('motion.normal')} | \`${motion.normal}\` | \`--motion-normal\` |`)
  lines.push(`| ${t('motion.slow')} | \`${motion.slow}\` | \`--motion-slow\` |`)
  lines.push('')
  lines.push(`**${t('motion.easing')}:** \`${motion.easing}\``)

  // Layout
  lines.push('', `## ${t('layout.heading')}`, '')
  lines.push(`- ${t('layout.sidebarWidth')}: \`${layout.sidebarWidth}\``)
  lines.push(`- ${t('layout.contentMaxWidth')}: \`${layout.contentMaxWidth}\``)

  // Background art direction
  const bgArtDirection = getThemeBackgroundCss(theme.id)
  if (bgArtDirection) {
    lines.push('', `## ${t('background.heading')}`, '')
    lines.push(t('background.intro'))
    lines.push('', '```css', bgArtDirection, '```')
  }

  // CSS variables
  const css = generateThemeCss(theme)
  lines.push('', `## ${t('cssVariables')}`, '')
  lines.push('```css', css.trimEnd(), '```')

  // Design language profile (for built-in themes with hardcoded profiles)
  if (theme.designProfile) {
    lines.push('', '---', '')
    lines.push(`## ${t('profile.heading')}`, '')
    lines.push(t('profile.notice'))
    lines.push('')

    const dp = theme.designProfile
    lines.push(`### ${t('profile.thesis')}`, '', dp.thesis, '')

    lines.push(`### ${t('profile.signatureMoves')}`, '')
    for (const move of dp.signatureMoves) {
      lines.push(`**${move.name}**`, '', move.description, '')
    }

    lines.push(`### ${t('profile.composition')}`, '')
    lines.push(`- **${t('profile.containerStrategy')}:** ${dp.composition.containerStrategy}`)
    lines.push(`- **${t('profile.alignmentStrategy')}:** ${dp.composition.alignmentStrategy}`)
    lines.push(`- **${t('profile.densityAndWhitespace')}:** ${dp.composition.densityAndWhitespace}`)
    lines.push(`- **${t('profile.rhythm')}:** ${dp.composition.rhythm}`)
    lines.push('')

    lines.push(`### ${t('profile.visualLanguage')}`, '')
    lines.push(`- **${t('profile.color')}:** ${dp.visualLanguage.color}`)
    lines.push(`- **${t('profile.typography')}:** ${dp.visualLanguage.typography}`)
    lines.push(`- **${t('profile.shape')}:** ${dp.visualLanguage.shape}`)
    lines.push(`- **${t('profile.surfaces')}:** ${dp.visualLanguage.surfaces}`)
    if (dp.visualLanguage.imagery) {
      lines.push(`- **${t('profile.imagery')}:** ${dp.visualLanguage.imagery}`)
    }
    if (dp.visualLanguage.motion) {
      lines.push(`- **${t('profile.motion')}:** ${dp.visualLanguage.motion}`)
    }
    lines.push('')

    lines.push(`### ${t('profile.attention')}`, '')
    lines.push(`- **${t('profile.entryPoint')}:** ${dp.attention.entryPoint}`)
    lines.push(`- **${t('profile.actionHierarchy')}:** ${dp.attention.actionHierarchy}`)
    lines.push(`- **${t('profile.contrastStrategy')}:** ${dp.attention.contrastStrategy}`)
    lines.push('')

    lines.push(`### ${t('profile.interaction')}`, '')
    lines.push(`- **${t('profile.feedbackStyle')}:** ${dp.interactionLanguage.feedbackStyle}`)
    lines.push(`- **${t('profile.stateChangeAmplitude')}:** ${dp.interactionLanguage.stateChangeAmplitude}`)
    lines.push('')

    lines.push(`### ${t('profile.transferRules')}`, '')
    lines.push(`**${t('profile.preserve')}:**`, '')
    for (const rule of dp.transferRules.preserve) {
      lines.push(`- ${rule}`)
    }
    lines.push('')
    lines.push(`**${t('profile.adapt')}:**`, '')
    for (const rule of dp.transferRules.adapt) {
      lines.push(`- ${rule}`)
    }
    lines.push('')
    lines.push(`**${t('profile.avoid')}:**`, '')
    for (const rule of dp.transferRules.avoid) {
      lines.push(`- ${rule}`)
    }
    lines.push('')
  }

  // Agent Guide
  lines.push('', '---', '')
  lines.push(`## ${t('agent.heading')}`, '')
  lines.push(t('agent.intro', { theme: theme.name }))
  lines.push('')
  lines.push(`### ${t('agent.exampleHeading')}`, '')
  lines.push('```')
  lines.push(t('agent.examplePrompt', { theme: theme.name }))
  lines.push(`- Background: var(--color-card)`)
  lines.push(`- Text: var(--color-card-foreground)`)
  lines.push(`- Border radius: var(--radius-md)`)
  lines.push(`- Shadow: var(--shadow-sm)`)
  lines.push(`- Padding: calc(${spacing.unit} * 6)`)
  lines.push(`- Font: var(--font-body)`)
  lines.push('```')
  lines.push('')
  lines.push(`### ${t('agent.implementationHeading')}`, '')
  for (const rule of ['source', 'reuse', 'hierarchy', 'heading', 'body', 'motion', 'focus']) {
    lines.push(t(`agent.rules.${rule}`))
  }
  lines.push('')
  lines.push(`### ${t('agent.tokenReference')}`, '')
  lines.push(t('agent.tokenTableHeader'))
  lines.push('|---------|--------|')
  const tokenRows: Array<[string, string]> = [
    ['pageBackground', '--color-background'],
    ['surface', '--color-card'],
    ['bodyText', '--color-foreground'],
    ['mutedText', '--color-muted-foreground'],
    ['primaryAction', '--color-primary'],
    ['accent', '--color-accent'],
    ['border', '--color-border'],
    ['focusRing', '--focus-ring-shadow'],
    ['bodyFont', '--font-body'],
    ['headingFont', '--font-heading'],
    ['codeFont', '--font-mono'],
    ['smallGap', 'calc(var(--spacing) * 2)'],
    ['standardGap', 'calc(var(--spacing) * 4)'],
    ['largeGap', 'calc(var(--spacing) * 8)'],
  ]
  for (const [context, token] of tokenRows) lines.push(`| ${t(`agent.contexts.${context}`)} | \`${token}\` |`)

  // Do's and Don'ts
  lines.push('')
  lines.push(`### ${t('agent.dosAndDonts')}`, '')
  lines.push(`**${t('agent.dos')}**`)
  lines.push('')
  for (const rule of ['colors', 'spacing', 'radius', 'shadows']) lines.push(t(`agent.doRules.${rule}`))
  lines.push('')
  lines.push(`**${t('agent.donts')}**`)
  lines.push('')
  for (const rule of ['fonts', 'colors', 'motion', 'density']) lines.push(t(`agent.dontRules.${rule}`))

  return `${lines.join('\n')}\n`
}

function getThemeBackgroundCss(themeId: string): string | null {
  const backgrounds: Record<string, string> = {
    'chinese-landscape': `.app-shell::before {
  background:
    linear-gradient(90deg, rgb(246 242 232 / 12%), rgb(246 242 232 / 46%) 28%, rgb(246 242 232 / 32%)),
    url('./ink-landscape-bg.jpg') center bottom / cover no-repeat;
  opacity: 0.58;
}

.app-shell::after {
  background:
    radial-gradient(circle at 72% 18%, rgb(255 253 246 / 76%) 0 18%, transparent 52%),
    linear-gradient(180deg, rgb(247 243 233 / 24%), rgb(247 243 233 / 46%));
}`,
    cyberpunk: `.app-shell::before {
  background:
    radial-gradient(circle at 78% 16%, rgb(214 169 70 / 6%), transparent 26%),
    radial-gradient(circle at 28% 88%, rgb(78 201 210 / 8%), transparent 30%),
    linear-gradient(rgb(78 201 210 / 4%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(78 201 210 / 4%) 1px, transparent 1px),
    linear-gradient(145deg, #091419, #081116 58%, #071015);
  background-size: auto, auto, 32px 32px, 32px 32px, auto;
}

.app-shell::after {
  background: repeating-linear-gradient(180deg, transparent 0 3px, rgb(255 255 255 / 1.5%) 3px 4px);
  opacity: 0.48;
}`,
    nordic: `.app-shell::before {
  background:
    radial-gradient(ellipse at 88% 8%, rgb(168 199 204 / 26%), transparent 34%),
    radial-gradient(ellipse at 15% 92%, rgb(180 199 163 / 21%), transparent 32%),
    linear-gradient(155deg, #f8f7f2, #eef3f1 58%, #f7f2ec);
}

.app-shell::after {
  background-image: radial-gradient(rgb(55 70 75 / 7%) 0.5px, transparent 0.5px);
  background-size: 5px 5px;
  opacity: 0.15;
}`,
    glassmorphism: `.app-shell::before {
  background:
    radial-gradient(circle at 16% 16%, rgb(116 95 255 / 44%), transparent 26%),
    radial-gradient(circle at 82% 18%, rgb(54 218 224 / 42%), transparent 25%),
    radial-gradient(circle at 68% 82%, rgb(255 116 190 / 30%), transparent 27%),
    radial-gradient(circle at 20% 82%, rgb(255 196 100 / 25%), transparent 24%),
    linear-gradient(135deg, #eef0ff, #e9fbfa 54%, #f6eafa);
}

.app-shell::after {
  background:
    linear-gradient(135deg, rgb(255 255 255 / 13%), transparent 44%),
    radial-gradient(circle at 50% 40%, rgb(255 255 255 / 30%), transparent 52%);
}`,
    dunhuang: `.app-shell::before {
  background:
    linear-gradient(90deg, rgb(231 204 158 / 24%), rgb(244 222 181 / 48%) 38%, rgb(234 209 169 / 18%)),
    url('./dunhuang-mural-bg.jpg') center bottom / cover no-repeat;
  opacity: 0.78;
}

.app-shell::after {
  background:
    radial-gradient(circle at 58% 24%, rgb(255 239 207 / 65%), transparent 48%),
    linear-gradient(180deg, rgb(244 224 187 / 20%), rgb(236 211 171 / 35%));
}`,
    blueprint: `.app-shell::before {
  background-image:
    linear-gradient(rgb(99 218 255 / 9%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(99 218 255 / 9%) 1px, transparent 1px),
    linear-gradient(rgb(99 218 255 / 4%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(99 218 255 / 4%) 1px, transparent 1px),
    radial-gradient(circle at 78% 14%, rgb(55 180 255 / 13%), transparent 28%),
    linear-gradient(145deg, #071a2b, #071624 62%, #06111e);
  background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px, auto, auto;
}

.app-shell::after {
  background:
    radial-gradient(circle at center, transparent 28%, rgb(2 12 22 / 22%) 100%),
    linear-gradient(90deg, rgb(3 17 29 / 18%), transparent 34%);
}`,
  }
  return backgrounds[themeId] || null
}
