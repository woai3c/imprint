import type { DesignToken } from './index.js'

export interface DesignDiff {
  colors: { added: string[]; removed: string[]; changed: Array<{ name: string; from: string; to: string }> }
  typography: { fontFamiliesChanged: boolean; sizesAdded: string[]; sizesRemoved: string[] }
  spacing: { added: string[]; removed: string[] }
  radii: { added: string[]; removed: string[] }
  summary: string
}

/**
 * Compare two design tokens and produce a diff summary.
 * Useful for comparing two websites or tracking design evolution.
 */
export function compareDesigns(tokenA: DesignToken, tokenB: DesignToken, urlA: string, urlB: string): DesignDiff {
  // Color diff
  const colorsA = new Set(Object.values(tokenA.colors))
  const colorsB = new Set(Object.values(tokenB.colors))
  const colorNames = new Map<string, string>()
  for (const [name, value] of Object.entries(tokenA.colors)) {
    colorNames.set(value, name)
  }

  const addedColors = [...colorsB].filter((c) => !colorsA.has(c))
  const removedColors = [...colorsA].filter((c) => !colorsB.has(c))

  const changedColors: Array<{ name: string; from: string; to: string }> = []
  for (const [name, valueA] of Object.entries(tokenA.colors)) {
    const valueB = tokenB.colors[name]
    if (valueB && valueB !== valueA) {
      changedColors.push({ name, from: valueA, to: valueB })
    }
  }

  // Typography diff
  const fontFamiliesChanged =
    JSON.stringify(tokenA.typography.fontFamilies) !== JSON.stringify(tokenB.typography.fontFamilies)

  const sizesA = new Set(tokenA.typography.fontSizes)
  const sizesB = new Set(tokenB.typography.fontSizes)
  const sizesAdded = [...sizesB].filter((s) => !sizesA.has(s))
  const sizesRemoved = [...sizesA].filter((s) => !sizesB.has(s))

  // Spacing diff
  const spacingA = new Set(tokenA.spacing)
  const spacingB = new Set(tokenB.spacing)
  const spacingAdded = [...spacingB].filter((s) => !spacingA.has(s))
  const spacingRemoved = [...spacingA].filter((s) => !spacingB.has(s))

  // Radii diff
  const radiiA = new Set(tokenA.radii)
  const radiiB = new Set(tokenB.radii)
  const radiiAdded = [...radiiB].filter((r) => !radiiA.has(r))
  const radiiRemoved = [...radiiA].filter((r) => !radiiB.has(r))

  // Summary
  const changes: string[] = []
  if (addedColors.length > 0) changes.push(`${addedColors.length} new colors`)
  if (removedColors.length > 0) changes.push(`${removedColors.length} removed colors`)
  if (changedColors.length > 0) changes.push(`${changedColors.length} changed colors`)
  if (fontFamiliesChanged) changes.push('font families changed')
  if (sizesAdded.length > 0) changes.push(`${sizesAdded.length} new font sizes`)
  if (spacingAdded.length > 0 || spacingRemoved.length > 0) changes.push('spacing scale changed')
  if (radiiAdded.length > 0 || radiiRemoved.length > 0) changes.push('border radius changed')

  const summary =
    changes.length > 0
      ? `Comparing ${urlA} vs ${urlB}: ${changes.join(', ')}`
      : `${urlA} and ${urlB} have nearly identical design systems`

  return {
    colors: { added: addedColors, removed: removedColors, changed: changedColors },
    typography: { fontFamiliesChanged, sizesAdded, sizesRemoved },
    spacing: { added: spacingAdded, removed: spacingRemoved },
    radii: { added: radiiAdded, removed: radiiRemoved },
    summary,
  }
}
