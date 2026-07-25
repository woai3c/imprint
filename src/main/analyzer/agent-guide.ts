import type { DesignToken } from '../export.js'

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
