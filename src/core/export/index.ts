import { generateAgentGuide, generateDosAndDonts } from '../analyzer/agent-guide.js'
import type { DesignToken } from '../analyzer/index.js'

export function generateCssVariables(tokens: DesignToken): string {
  const lines: string[] = [':root {']

  for (const [name, value] of Object.entries(tokens.colors)) {
    lines.push(`  --color-${name}: ${value};`)
  }

  if (tokens.typography.fontFamilies.length > 0) {
    lines.push(`  --font-sans: ${tokens.typography.fontFamilies[0]};`)
  }

  tokens.typography.fontSizes.forEach((val, i) => {
    const names = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl']
    const name = names[i] || `${i + 1}`
    lines.push(`  --font-size-${name}: ${val};`)
  })

  tokens.spacing.forEach((val, i) => {
    lines.push(`  --spacing-${i + 1}: ${val};`)
  })

  const radiusNames = ['sm', 'md', 'lg', 'xl', '2xl']
  tokens.radii.forEach((val, i) => {
    const name = radiusNames[i] || `${i + 1}`
    lines.push(`  --radius-${name}: ${val};`)
  })

  tokens.shadows.forEach((val, i) => {
    const names = ['sm', 'md', 'lg', 'xl']
    const name = names[i] || `${i + 1}`
    lines.push(`  --shadow-${name}: ${val};`)
  })

  lines.push('}')
  return lines.join('\n')
}

export function generateTailwindTheme(tokens: DesignToken): string {
  const lines: string[] = ['@theme {']

  for (const [name, value] of Object.entries(tokens.colors)) {
    lines.push(`  --color-${name}: ${value};`)
  }

  if (tokens.typography.fontFamilies.length > 0) {
    lines.push(`  --font-sans: ${tokens.typography.fontFamilies[0]};`)
  }

  tokens.spacing.forEach((val, i) => {
    lines.push(`  --spacing-${i + 1}: ${val};`)
  })

  const radiusNames = ['sm', 'md', 'lg', 'xl', '2xl']
  tokens.radii.forEach((val, i) => {
    const name = radiusNames[i] || `${i + 1}`
    lines.push(`  --radius-${name}: ${val};`)
  })

  lines.push('}')
  return lines.join('\n')
}

export function generateDesignDoc(tokens: DesignToken, url?: string, featureTags?: string[]): string {
  const lines: string[] = []

  lines.push('# Design System')
  if (url) lines.push(`\nExtracted from: ${url}`)

  if (featureTags && featureTags.length > 0) {
    lines.push(`\n**Design Features:** ${featureTags.map((t) => `\`${t}\``).join(' · ')}`)
  }

  lines.push('')

  // Colors
  lines.push('## Colors\n')
  lines.push('| Token | Value | Usage |')
  lines.push('|-------|-------|-------|')
  for (const [name, value] of Object.entries(tokens.colors)) {
    const bgCount = tokens.usageCount?.[`bgColor:${value}`] || 0
    const textCount = tokens.usageCount?.[`textColor:${value}`] || 0
    const total = bgCount + textCount
    const context = bgCount > 0 && textCount > 0 ? 'bg+text' : bgCount > 0 ? 'background' : 'text'
    lines.push(`| \`--color-${name}\` | \`${value}\` | ${total > 0 ? `${total}× (${context})` : '-'} |`)
  }

  // Typography
  lines.push('\n## Typography\n')
  lines.push(`**Font families:** ${tokens.typography.fontFamilies.join(', ') || 'System default'}`)
  lines.push(`\n**Font sizes:** ${tokens.typography.fontSizes.join(', ')}`)
  lines.push(`\n**Font weights:** ${tokens.typography.fontWeights.join(', ')}`)

  // Spacing
  lines.push('\n## Spacing\n')
  lines.push(
    tokens.spacing
      .map((s, i) => {
        const count = tokens.usageCount?.[`spacing:${s}`] || 0
        return `- Level ${i + 1}: \`${s}\`${count > 0 ? ` (${count}×)` : ''}`
      })
      .join('\n'),
  )

  // Radii
  lines.push('\n## Border Radius\n')
  lines.push(
    tokens.radii
      .map((r, i) => {
        const count = tokens.usageCount?.[`radius:${r}`] || 0
        return `- ${['sm', 'md', 'lg', 'xl', '2xl'][i] || i}: \`${r}\`${count > 0 ? ` (${count}×)` : ''}`
      })
      .join('\n'),
  )

  // Shadows
  if (tokens.shadows.length > 0) {
    lines.push('\n## Shadows\n')
    lines.push(tokens.shadows.map((s, i) => `- ${['sm', 'md', 'lg', 'xl'][i] || i}: \`${s}\``).join('\n'))
  }

  // Agent Prompt Guide
  lines.push('\n---\n')
  lines.push(generateAgentGuide(tokens, url))
  lines.push(generateDosAndDonts(tokens))

  return lines.join('\n')
}

export function generateDtcgJson(tokens: DesignToken): string {
  const dtcg: Record<string, unknown> = {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    color: {},
    typography: {},
    spacing: {},
    borderRadius: {},
    shadow: {},
  }

  const colors = dtcg.color as Record<string, unknown>
  for (const [name, value] of Object.entries(tokens.colors)) {
    colors[name] = { $type: 'color', $value: value }
  }

  const typo = dtcg.typography as Record<string, unknown>
  typo['fontFamilies'] = {
    $type: 'fontFamily',
    $value: tokens.typography.fontFamilies,
  }
  typo['fontSizes'] = {
    $type: 'dimension',
    $value: tokens.typography.fontSizes,
  }

  const spacing = dtcg.spacing as Record<string, unknown>
  tokens.spacing.forEach((val, i) => {
    spacing[`${i + 1}`] = { $type: 'dimension', $value: val }
  })

  const radius = dtcg.borderRadius as Record<string, unknown>
  const radiusNames = ['sm', 'md', 'lg', 'xl', '2xl']
  tokens.radii.forEach((val, i) => {
    radius[radiusNames[i] || `${i}`] = { $type: 'dimension', $value: val }
  })

  const shadow = dtcg.shadow as Record<string, unknown>
  const shadowNames = ['sm', 'md', 'lg', 'xl']
  tokens.shadows.forEach((val, i) => {
    shadow[shadowNames[i] || `${i}`] = { $type: 'shadow', $value: val }
  })

  return JSON.stringify(dtcg, null, 2)
}
