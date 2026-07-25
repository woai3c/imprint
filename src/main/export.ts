export interface DesignToken {
  colors: Record<string, string>
  typography: {
    fontFamilies: string[]
    fontSizes: string[]
    fontWeights: string[]
    lineHeights: string[]
  }
  spacing: string[]
  radii: string[]
  shadows: string[]
  borders: string[]
}

export interface ThemeExport {
  css: string
  tailwind: string
  json: string
  markdown: string
}

export function generateCssVariables(tokens: DesignToken): string {
  const lines: string[] = [':root {']

  // Colors
  for (const [name, value] of Object.entries(tokens.colors)) {
    lines.push(`  --color-${name}: ${value};`)
  }

  // Typography
  if (tokens.typography.fontFamilies.length > 0) {
    lines.push(`  --font-sans: ${tokens.typography.fontFamilies[0]};`)
  }
  tokens.typography.fontSizes.forEach((size, i) => {
    const names = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl']
    const name = names[i] || `size-${i}`
    lines.push(`  --font-size-${name}: ${size};`)
  })

  // Spacing
  tokens.spacing.forEach((val, i) => {
    lines.push(`  --spacing-${i + 1}: ${val};`)
  })

  // Radii
  const radiusNames = ['sm', 'md', 'lg', 'xl', '2xl']
  tokens.radii.forEach((val, i) => {
    const name = radiusNames[i] || `${i + 1}`
    lines.push(`  --radius-${name}: ${val};`)
  })

  // Shadows
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

export function generateDesignDoc(tokens: DesignToken, url?: string): string {
  const lines: string[] = []

  lines.push('# Design System')
  if (url) lines.push(`\nExtracted from: ${url}`)
  lines.push('')

  // Colors
  lines.push('## Colors\n')
  lines.push('| Token | Value |')
  lines.push('|-------|-------|')
  for (const [name, value] of Object.entries(tokens.colors)) {
    lines.push(`| \`--color-${name}\` | \`${value}\` |`)
  }

  // Typography
  lines.push('\n## Typography\n')
  lines.push(`**Font families:** ${tokens.typography.fontFamilies.join(', ') || 'System default'}`)
  lines.push(`\n**Font sizes:** ${tokens.typography.fontSizes.join(', ')}`)
  lines.push(`\n**Font weights:** ${tokens.typography.fontWeights.join(', ')}`)

  // Spacing
  lines.push('\n## Spacing\n')
  lines.push(tokens.spacing.map((s, i) => `- Level ${i + 1}: \`${s}\``).join('\n'))

  // Radii
  lines.push('\n## Border Radius\n')
  lines.push(tokens.radii.map((r, i) => `- ${['sm', 'md', 'lg', 'xl', '2xl'][i] || i}: \`${r}\``).join('\n'))

  // Shadows
  if (tokens.shadows.length > 0) {
    lines.push('\n## Shadows\n')
    lines.push(tokens.shadows.map((s, i) => `- ${['sm', 'md', 'lg', 'xl'][i] || i}: \`${s}\``).join('\n'))
  }

  return lines.join('\n')
}

export function generateDtcgJson(tokens: DesignToken): string {
  const dtcg: Record<string, unknown> = {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    color: {} as Record<string, unknown>,
    font: {} as Record<string, unknown>,
    spacing: {} as Record<string, unknown>,
    radius: {} as Record<string, unknown>,
    shadow: {} as Record<string, unknown>,
  }

  for (const [name, value] of Object.entries(tokens.colors)) {
    ;(dtcg.color as Record<string, unknown>)[name] = {
      $type: 'color',
      $value: value,
    }
  }

  tokens.spacing.forEach((val, i) => {
    ;(dtcg.spacing as Record<string, unknown>)[`${i + 1}`] = {
      $type: 'dimension',
      $value: val,
    }
  })

  tokens.radii.forEach((val, i) => {
    const names = (['sm', 'md', 'lg', 'xl', '2xl'](dtcg.radius as Record<string, unknown>)[names[i] || `${i}`] = {
      $type: 'dimension',
      $value: val,
    })
  })

  return JSON.stringify(dtcg, null, 2)
}
