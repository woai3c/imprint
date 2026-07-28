import type { ComponentPattern } from './component-detect.js'
import type { DesignToken } from './index.js'

/**
 * Generate an Agent Prompt Guide section for DESIGN.md.
 * Tells AI coding agents how to use the extracted tokens.
 * Pure code — generates a template-based guide.
 */
export function generateAgentGuide(tokens: DesignToken, url?: string): string {
  const lines: string[] = []
  const siteName = url ? new URL(url).hostname.replace('www.', '') : 'target site'

  lines.push('## Agent Prompt Guide')
  lines.push('')
  lines.push(`Use these design tokens to generate UI that matches the visual style of ${siteName}.`)
  lines.push('')

  // Example component prompt
  lines.push('### Example Component Prompt')
  lines.push('')
  lines.push('```')
  lines.push(`Build a card component using the ${siteName} design system:`)
  lines.push(`- Background: var(--color-${tokens.colors['surface'] ? 'surface' : 'background'})`)
  lines.push(`- Text: var(--color-foreground)`)
  lines.push(`- Border radius: var(--radius-${tokens.radii.length > 1 ? 'md' : 'sm'})`)
  if (tokens.shadows.length > 0) {
    lines.push(`- Shadow: var(--shadow-sm)`)
  }
  lines.push(`- Padding: var(--spacing-${Math.min(4, tokens.spacing.length)})`)
  lines.push('```')
  lines.push('')

  // Implementation order
  lines.push('### Implementation Order')
  lines.push('')
  lines.push('1. Set up CSS variables (colors, typography, spacing)')
  lines.push('2. Apply base layout with spacing tokens')
  lines.push('3. Style typography using font scale')
  lines.push('4. Add component-level styles (borders, shadows, radii)')
  lines.push('5. Implement interaction states (hover/focus colors)')
  lines.push('')

  // Token usage reference
  lines.push('### Token Usage Reference')
  lines.push('')
  lines.push('| Context | Token Pattern |')
  lines.push('|---------|--------------|')
  lines.push('| Page background | `--color-background` |')
  lines.push('| Card/surface | `--color-surface` |')
  lines.push('| Body text | `--color-foreground` |')
  lines.push('| Muted/secondary text | `--color-muted-foreground` |')
  lines.push('| Primary action | `--color-primary` |')
  lines.push('| Borders | `--color-border` or `--border-*` |')
  lines.push('| Spacing (padding/gap) | `--spacing-1` through `--spacing-N` |')
  lines.push('| Border radius | `--radius-sm/md/lg` |')
  lines.push('')

  return lines.join('\n')
}

/**
 * Generate Do's and Don'ts based on analyzed design patterns.
 * Code-based heuristics — no LLM needed.
 */
export function generateDosAndDonts(tokens: DesignToken): string {
  const lines: string[] = []

  lines.push("## Do's and Don'ts")
  lines.push('')
  lines.push("### Do's")
  lines.push('')

  // Always applicable
  lines.push('- ✅ Use the defined color tokens instead of hardcoded hex values')
  lines.push('- ✅ Follow the spacing scale for consistent rhythm')

  // Font-specific
  if (tokens.typography.fontFamilies.length > 0) {
    lines.push(`- ✅ Use \`${tokens.typography.fontFamilies[0]}\` as the primary font`)
  }

  // Radius-specific
  if (tokens.radii.length > 0) {
    const maxR = Math.max(...tokens.radii.map((r) => parseFloat(r)))
    if (maxR >= 12) {
      lines.push('- ✅ Use generous border-radius for a soft, friendly feel')
    } else if (maxR <= 4) {
      lines.push('- ✅ Keep border-radius minimal for a sharp, precise aesthetic')
    }
  }

  // Shadow-specific
  if (tokens.shadows.length > 0) {
    lines.push('- ✅ Use elevation (shadows) to create visual hierarchy')
  } else {
    lines.push('- ✅ Use borders and background shifts for hierarchy (no shadows)')
  }

  // Spacing-specific
  if (tokens.spacing.length >= 4) {
    lines.push('- ✅ Stick to the spacing scale — avoid arbitrary pixel values')
  }

  lines.push('')
  lines.push("### Don'ts")
  lines.push('')
  lines.push("- ❌ Don't introduce new colors outside the defined palette")
  lines.push("- ❌ Don't mix different spacing systems")

  if (tokens.shadows.length === 0) {
    lines.push("- ❌ Don't add box-shadows — this design uses flat elevation")
  }

  if (tokens.typography.fontFamilies.length === 1) {
    lines.push("- ❌ Don't mix multiple font families — stick to the single typeface")
  }

  const weights = tokens.typography.fontWeights
  if (weights.length <= 3) {
    lines.push(`- ❌ Don't use font weights outside: ${weights.join(', ')}`)
  }

  lines.push("- ❌ Don't ignore the responsive spacing — use relative units")
  lines.push('')

  return lines.join('\n')
}

/**
 * Generate example HTML components using extracted tokens and detected patterns.
 * Gives AI agents and developers a concrete starting point.
 */
export function generateExampleComponents(tokens: DesignToken, components?: ComponentPattern[]): string {
  const lines: string[] = []
  const colorEntries = Object.entries(tokens.colors)
  const bgColor = findColor(colorEntries, ['background', 'bg', 'surface'])
  const cardColor = findColor(colorEntries, ['card', 'surface', 'secondary'])
  const textColor = findColor(colorEntries, ['foreground', 'text', 'body'])
  const mutedColor = findColor(colorEntries, ['muted-foreground', 'muted', 'secondary-foreground'])
  const primaryColor = findColor(colorEntries, ['primary', 'accent', 'brand'])
  const primaryFg = findColor(colorEntries, ['primary-foreground', 'on-primary', 'white'], '#fff')
  const borderColor = findColor(colorEntries, ['border', 'divider', 'separator'])

  const font = tokens.typography.fontFamilies[0] || 'system-ui, sans-serif'
  const fontStack = tokens.typography.fontStacks?.[0] || font
  const radius = tokens.radii[1] || tokens.radii[0] || '8px'
  const radiusSm = tokens.radii[0] || '4px'
  const shadow = tokens.shadows[0] || 'none'
  const spacing = tokens.spacing
  const padUnit = spacing[2] || spacing[1] || '16px'
  const padSm = spacing[1] || spacing[0] || '8px'
  const gapUnit = spacing[1] || spacing[0] || '8px'

  lines.push('## Example Components')
  lines.push('')
  lines.push('Ready-to-use HTML examples built with the extracted design tokens.')
  lines.push('Copy these as starting points and adapt to your needs.')
  lines.push('')

  // Card
  lines.push('### Card')
  lines.push('')
  lines.push('```html')
  lines.push(`<div style="
  background: ${cardColor};
  color: ${textColor};
  font-family: ${fontStack};
  border-radius: ${radius};
  padding: ${padUnit};
  box-shadow: ${shadow};${borderColor ? `\n  border: 1px solid ${borderColor};` : ''}
">`)
  lines.push(
    `  <h3 style="margin: 0 0 ${gapUnit}; font-size: ${tokens.typography.fontSizes[3] || '1.125rem'}; font-weight: ${tokens.typography.fontWeights[tokens.typography.fontWeights.length - 1] || '600'};">Card Title</h3>`,
  )
  lines.push(
    `  <p style="margin: 0; color: ${mutedColor}; font-size: ${tokens.typography.fontSizes[1] || '0.875rem'};">Description text using muted color for secondary content.</p>`,
  )
  lines.push('</div>')
  lines.push('```')
  lines.push('')

  // Button
  const hasButtons = components?.some((c) => c.type === 'button')
  const btnRadius = hasButtons
    ? components!.find((c) => c.type === 'button')?.styles.borderRadius || radiusSm
    : radiusSm
  const btnFontSize = hasButtons
    ? components!.find((c) => c.type === 'button')?.styles.fontSize || tokens.typography.fontSizes[1] || '0.875rem'
    : tokens.typography.fontSizes[1] || '0.875rem'

  lines.push('### Button')
  lines.push('')
  lines.push('```html')
  lines.push(`<button style="
  background: ${primaryColor};
  color: ${primaryFg};
  font-family: ${fontStack};
  font-size: ${btnFontSize};
  font-weight: 500;
  border: none;
  border-radius: ${btnRadius};
  padding: ${padSm} ${padUnit};
  cursor: pointer;${tokens.transitions?.[0] ? `\n  transition: opacity ${tokens.transitions[0]} ease;` : ''}
">Primary Action</button>`)
  lines.push('')
  lines.push(`<button style="
  background: transparent;
  color: ${textColor};
  font-family: ${fontStack};
  font-size: ${btnFontSize};
  font-weight: 500;
  border: 1px solid ${borderColor || textColor};
  border-radius: ${btnRadius};
  padding: ${padSm} ${padUnit};
  cursor: pointer;
">Secondary Action</button>`)
  lines.push('```')
  lines.push('')

  // Navigation
  if (components?.some((c) => c.type === 'navigation')) {
    lines.push('### Navigation')
    lines.push('')
    lines.push('```html')
    lines.push(`<nav style="
  display: flex;
  align-items: center;
  gap: ${padUnit};
  padding: ${padSm} ${padUnit};
  background: ${bgColor};
  border-bottom: 1px solid ${borderColor || 'rgba(0,0,0,0.1)'};
  font-family: ${fontStack};
">`)
    lines.push(
      `  <a href="#" style="color: ${primaryColor}; text-decoration: none; font-weight: 500; font-size: ${btnFontSize};">Active</a>`,
    )
    lines.push(`  <a href="#" style="color: ${mutedColor}; text-decoration: none; font-size: ${btnFontSize};">Link</a>`)
    lines.push(`  <a href="#" style="color: ${mutedColor}; text-decoration: none; font-size: ${btnFontSize};">Link</a>`)
    lines.push('</nav>')
    lines.push('```')
    lines.push('')
  }

  // Input
  if (components?.some((c) => c.type === 'input')) {
    const inputPattern = components!.find((c) => c.type === 'input')!
    const inputRadius = inputPattern.styles.borderRadius || radiusSm
    const inputPad = inputPattern.styles.padding || `${padSm} ${padUnit}`
    const inputFontSize = inputPattern.styles.fontSize || tokens.typography.fontSizes[1] || '0.875rem'

    lines.push('### Input')
    lines.push('')
    lines.push('```html')
    lines.push(`<input type="text" placeholder="Enter text..." style="
  width: 100%;
  background: ${inputPattern.styles.backgroundColor || cardColor};
  color: ${textColor};
  font-family: ${fontStack};
  font-size: ${inputFontSize};
  border: ${inputPattern.styles.border || `1px solid ${borderColor}`};
  border-radius: ${inputRadius};
  padding: ${inputPad};
  outline: none;
  box-sizing: border-box;
" />`)
    lines.push('```')
    lines.push('')
  }

  // Page layout
  lines.push('### Page Layout')
  lines.push('')
  lines.push('```html')
  lines.push(`<div style="
  min-height: 100vh;
  background: ${bgColor};
  color: ${textColor};
  font-family: ${fontStack};
  font-size: ${tokens.typography.fontSizes[2] || '1rem'};
  line-height: ${tokens.typography.lineHeights?.[0] || '1.5'};
">`)
  lines.push(`  <header style="padding: ${padUnit}; border-bottom: 1px solid ${borderColor || 'rgba(0,0,0,0.1)'};">`)
  lines.push('    <h1 style="margin: 0;">Site Title</h1>')
  lines.push('  </header>')
  lines.push(`  <main style="max-width: 1200px; margin: 0 auto; padding: ${padUnit};">`)
  lines.push('    <!-- Content here -->')
  lines.push('  </main>')
  lines.push('</div>')
  lines.push('```')
  lines.push('')

  return lines.join('\n')
}

function findColor(entries: Array<[string, string]>, keywords: string[], fallback?: string): string {
  for (const keyword of keywords) {
    const exact = entries.find(([name]) => name === keyword)
    if (exact) return `var(--color-${exact[0]})`
  }
  for (const keyword of keywords) {
    const partial = entries.find(([name]) => name.includes(keyword))
    if (partial) return `var(--color-${partial[0]})`
  }
  if (fallback) return fallback
  return entries[0] ? `var(--color-${entries[0][0]})` : '#000'
}
