import type { ComponentRecipe } from './types.js'

type RecipeIdentity = Pick<ComponentRecipe, 'component' | 'useWhen' | 'variant'>

/** Keeps semantic use and observed visual treatment visible without mislabelling a primary action as secondary. */
export function displayedRecipeVariant(recipe: RecipeIdentity): string {
  if (
    recipe.component === 'button' &&
    recipe.useWhen === 'primary-action' &&
    /^secondary(?:-|$)/.test(recipe.variant)
  ) {
    return recipe.variant.replace(/^secondary/, 'primary-action-low-emphasis')
  }
  return recipe.variant
}

/**
 * Formats a hyphenated variant by matching the longest known translated term first.
 * This preserves compound semantics such as `primary-action-low-emphasis` even when
 * visual suffixes such as `rounded-tinted` follow it.
 */
export function formatRecipeVariant(
  recipe: RecipeIdentity,
  options: {
    translateKnown: (term: string) => string | null
    translateFallback: (term: string) => string
    formatRadius: (value: string) => string
    separator: string
  },
): string {
  const parts = displayedRecipeVariant(recipe).split('-')
  const labels: string[] = []
  for (let start = 0; start < parts.length;) {
    let match: string | null = null
    let next = start + 1
    for (let end = parts.length; end > start; end -= 1) {
      match = options.translateKnown(parts.slice(start, end).join('-'))
      if (!match) continue
      next = end
      break
    }
    if (match) {
      labels.push(match)
      start = next
      continue
    }
    const radius = /^r(\d+(?:\.\d+)?)$/.exec(parts[start])
    labels.push(radius ? options.formatRadius(radius[1]) : options.translateFallback(parts[start]))
    start += 1
  }
  return labels.join(options.separator)
}
