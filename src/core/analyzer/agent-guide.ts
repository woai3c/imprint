import { coreTranslator } from '../i18n/index.js'
import { hasDepthShadow, isPillRadius } from './component-detect.js'
import type { ComponentVariantPattern } from './component-detect.js'
import type { DesignToken } from './types.js'

export type DocLanguage = 'en' | 'zh-CN'

/**
 * Generate an Agent Prompt Guide section for DESIGN.md.
 * Tells AI coding agents how to use the extracted tokens.
 * Pure code — generates a template-based guide.
 */
export function generateAgentGuide(tokens: DesignToken, url?: string, language: DocLanguage = 'en'): string {
  const t = coreTranslator(language, 'agentGuide')
  const lines: string[] = []
  const siteName = url ? new URL(url).hostname.replace('www.', '') : t('siteFallback')

  lines.push(t('heading'))
  lines.push('')
  lines.push(t('intro', { siteName }))
  lines.push('')

  // Example component prompt
  lines.push(t('example.heading'))
  lines.push('')
  lines.push('```')
  lines.push(t('example.prompt', { siteName }))
  lines.push(`- Background: var(--color-${tokens.colors['surface'] ? 'surface' : 'background'})`)
  lines.push(`- Text: var(--color-foreground)`)
  lines.push(`- Border radius: var(--radius-${tokens.radii.length > 1 ? 'md' : 'sm'})`)
  if (tokens.shadows.some(hasDepthShadow)) {
    lines.push(`- Shadow: var(--shadow-sm)`)
  }
  lines.push(`- Padding: var(--spacing-${Math.min(4, tokens.spacing.length)})`)
  lines.push('```')
  lines.push('')

  // Implementation order
  lines.push(t('implementation.heading'))
  lines.push('')
  lines.push(t('implementation.steps.variables'))
  lines.push(t('implementation.steps.layout'))
  lines.push(t('implementation.steps.typography'))
  lines.push(t('implementation.steps.components'))
  lines.push(t('implementation.steps.states'))
  lines.push('')

  // Token usage reference
  lines.push(t('tokenReference.heading'))
  lines.push('')
  lines.push(t('tokenReference.tableHeader'))
  lines.push('|---------|--------------|')
  lines.push(t('tokenReference.pageBackground'))
  lines.push(t('tokenReference.surface'))
  lines.push(t('tokenReference.bodyText'))
  lines.push(t('tokenReference.mutedText'))
  lines.push(t('tokenReference.primaryAction'))
  lines.push(t('tokenReference.border'))
  lines.push(t('tokenReference.spacing'))
  lines.push(t('tokenReference.radius'))
  lines.push('')

  return lines.join('\n')
}

/**
 * Generate a Design Principles section for DESIGN.md.
 * Universal composition rules (proximity, alignment, repetition, contrast)
 * grounded in the extracted tokens — no generic textbook definitions.
 */
export function generateDesignPrinciples(tokens: DesignToken, language: DocLanguage = 'en'): string {
  const t = coreTranslator(language, 'agentGuide.principles')
  const lines: string[] = []

  lines.push(t('heading'))
  lines.push('')
  lines.push(t('intro'))
  lines.push('')

  // Proximity — derived from the spacing scale
  if (tokens.spacing.length > 0) {
    const related = tokens.spacing[0]
    const group = tokens.spacing[Math.min(3, tokens.spacing.length - 1)]
    lines.push(t('proximity.heading'))
    lines.push('')
    lines.push(t('proximity.related', { related, group }))
    lines.push(t('proximity.group'))
    lines.push('')
  }

  // Alignment — scale discipline
  lines.push(t('alignment.heading'))
  lines.push('')
  lines.push(t('alignment.scale'))
  lines.push(t('alignment.text'))
  lines.push('')

  // Repetition — token reuse
  lines.push(t('repetition.heading'))
  lines.push('')
  const counts = [
    t('repetition.colorCount', { count: Object.keys(tokens.colors).length }),
    t('repetition.fontSizeCount', { count: tokens.typography.fontSizes.length }),
    t('repetition.radiusCount', { count: tokens.radii.length }),
  ]
  if (tokens.shadows.length > 0) counts.push(t('repetition.shadowCount', { count: tokens.shadows.length }))
  lines.push(t('repetition.scale', { counts: counts.join(coreTranslator(language)('common.listSeparator')) }))
  lines.push(t('repetition.coherence'))
  lines.push('')

  // Contrast — hierarchy
  lines.push(t('contrast.heading'))
  lines.push('')
  const hasMuted = Object.keys(tokens.colors).some((name) => name.includes('muted'))
  const hasPrimary = Object.keys(tokens.colors).some((name) => name.includes('primary'))
  if (hasMuted) {
    lines.push(t('contrast.muted'))
  } else {
    lines.push(t('contrast.textRange'))
  }
  if (hasPrimary) {
    lines.push(t('contrast.primary'))
  }
  lines.push(t('contrast.states'))
  lines.push('')

  return lines.join('\n')
}

/**
 * Generate Do's and Don'ts based on analyzed design patterns.
 * Deterministic program heuristics.
 */
export function generateDosAndDonts(
  tokens: DesignToken,
  language: DocLanguage = 'en',
  components: readonly ComponentVariantPattern[] = [],
  responsiveEvidence: {
    hasDeclaredBreakpoints?: boolean
    hasObservedResponsiveBehavior?: boolean
    surfaceShadowScope?: 'foundation' | 'component-only' | 'none'
    /** P0 transfer categories. Undefined preserves legacy token-only guide behavior. */
    coreRuleCategories?: readonly string[]
  } = {},
): string {
  const t = coreTranslator(language, 'agentGuide')
  const lines: string[] = []
  const scopedByTransferGrammar = responsiveEvidence.coreRuleCategories !== undefined
  const hasCoreRule = (category: string): boolean =>
    !scopedByTransferGrammar || Boolean(responsiveEvidence.coreRuleCategories?.includes(category))

  // The canonical English heading is required by the DESIGN.md alpha parser;
  // localized guidance remains below it.
  lines.push("## Do's and Don'ts")
  lines.push('')
  lines.push(t('dos.heading'))
  lines.push('')

  if (Object.keys(tokens.colors).length > 0 && hasCoreRule('color')) {
    lines.push(t('dos.colorTokens'))
  }
  if (tokens.spacing.length > 0 && hasCoreRule('density')) {
    lines.push(t('dos.spacingScale'))
  }

  // Font-specific
  const primaryFont = tokens.typography.fontStacks?.[0] || tokens.typography.fontFamilies[0]
  if (primaryFont && hasCoreRule('typography')) {
    lines.push(t('dos.primaryFont', { font: primaryFont }))
  }

  // Radius-specific
  if (tokens.radii.length > 0 && hasCoreRule('shape')) {
    const regularRadii = tokens.radii
      .flatMap((radius) => {
        const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em)?$/i.exec(radius.trim())
        if (!match) return []
        const value =
          Number(match[1]) * (match[2]?.toLowerCase() === 'rem' || match[2]?.toLowerCase() === 'em' ? 16 : 1)
        // Percentages and oversized values describe circles/pills, not the corner
        // character of ordinary surfaces. They must not make an otherwise compact
        // system look broadly rounded.
        return Number.isFinite(value) && value >= 0 && value <= 64
          ? [{ value, count: Math.max(0, tokens.usageCount?.[`radius:${radius}`] || 0) }]
          : []
      })
      .sort((first, second) => first.value - second.value)
    const middle = Math.floor(regularRadii.length / 2)
    const observedRadiusCount = regularRadii.reduce((sum, radius) => sum + radius.count, 0)
    let representativeRadius: number | undefined
    if (regularRadii.length > 0 && observedRadiusCount > 0) {
      const midpoint = observedRadiusCount / 2
      let cumulative = 0
      representativeRadius = regularRadii[regularRadii.length - 1].value
      for (const radius of regularRadii) {
        cumulative += radius.count
        if (cumulative >= midpoint) {
          representativeRadius = radius.value
          break
        }
      }
    } else if (regularRadii.length > 0) {
      representativeRadius =
        regularRadii.length % 2 === 0
          ? (regularRadii[middle - 1].value + regularRadii[middle].value) / 2
          : regularRadii[middle].value
    }
    if (representativeRadius !== undefined && representativeRadius >= 12) {
      lines.push(t('dos.generousRadius'))
    } else if (representativeRadius !== undefined && representativeRadius <= 4) {
      const hasPillButton = components.some(
        (component) =>
          component.type === 'button' &&
          (isPillRadius(component.styles) ||
            ((component.variant === 'icon' || /(?:pill|circular)/i.test(component.name)) &&
              [...(component.styles.borderRadius || '').matchAll(/-?\d+(?:\.\d+)?/g)].some(
                (match) => Number.parseFloat(match[0]) >= 12,
              ))),
      )
      lines.push(t(hasPillButton ? 'dos.compactPillRadius' : 'dos.compactRadius'))
    }
  }

  // Shadow-specific
  const hasObservedDepthShadow = tokens.shadows.some(hasDepthShadow)
  const surfaceShadowScope = responsiveEvidence.surfaceShadowScope || (hasObservedDepthShadow ? 'foundation' : 'none')
  if (hasObservedDepthShadow && surfaceShadowScope === 'foundation' && hasCoreRule('surface')) {
    lines.push(t('dos.shadows'))
  } else if (hasObservedDepthShadow && surfaceShadowScope === 'component-only') {
    lines.push(t('dos.componentScopedShadows'))
  } else if (hasCoreRule('surface')) {
    lines.push(t('dos.noShadowScale'))
  }

  if (responsiveEvidence.hasObservedResponsiveBehavior && hasCoreRule('composition')) {
    lines.push(t('dos.observedResponsive'))
  } else if (responsiveEvidence.hasDeclaredBreakpoints && hasCoreRule('composition')) {
    lines.push(t('dos.declaredBreakpoints'))
  }

  // Spacing-specific
  if (tokens.spacing.length >= 4 && hasCoreRule('density')) {
    lines.push(t('dos.recurringSpacing'))
  }

  if (scopedByTransferGrammar && lines.length === 4) lines.push(t('dos.noGlobalRules'))

  const donts: string[] = []
  if (Object.keys(tokens.colors).length > 0 && hasCoreRule('color')) {
    const hasDerivedAccessibilityColor = Boolean(tokens.colorRoles?.primaryAction?.recommendedOnPrimary)
    donts.push(t(hasDerivedAccessibilityColor ? 'donts.derivedColors' : 'donts.newColors'))
  }
  if (tokens.spacing.length > 0 && hasCoreRule('density')) {
    donts.push(t('donts.spacingSystems'))
  }

  if (tokens.typography.fontFamilies.length === 1 && hasCoreRule('typography')) {
    donts.push(t('donts.fontFamilies'))
  }

  const weights = tokens.typography.fontWeights
  if (weights.length > 0 && weights.length <= 3 && hasCoreRule('typography')) {
    donts.push(t('donts.fontWeights', { weights: weights.join(', ') }))
  }

  if (donts.length > 0) {
    lines.push('', t('donts.heading'), '', ...donts)
  }

  lines.push('')

  return lines.join('\n')
}
