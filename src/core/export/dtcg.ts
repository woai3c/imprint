import type { DesignToken } from '../analyzer/types.js'
import { sanitizeDesignTokensForPersistence } from '../analyzer/url-privacy.js'
import { type DarkModeExportData, normalizeDarkSelector } from './dark-mode.js'
import { RADIUS_NAMES, SHADOW_NAMES, proseDurationName } from './token-names.js'

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
      ...(tokens.colorRoles ? { 'com.imprint.colorRoles': tokens.colorRoles } : {}),
      ...(tokens.candidates ? { 'com.imprint.candidates': tokens.candidates } : {}),
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
    transition[proseDurationName(i)] = { $type: 'duration', $value: val }
  })

  return groups
}

export function generateDtcgJson(tokens: DesignToken, darkMode?: DarkModeExportData): string {
  const publicTokens = sanitizeDesignTokensForPersistence(tokens)
  const dtcg: Record<string, unknown> = {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    ...createDtcgGroups(publicTokens),
  }

  if (darkMode?.hasDarkMode && darkMode.darkTokens) {
    dtcg.dark = createDtcgGroups(sanitizeDesignTokensForPersistence(darkMode.darkTokens))
    dtcg.$extensions = {
      ...(dtcg.$extensions as Record<string, unknown>),
      'com.imprint.darkMode': {
        method: darkMode.method || 'none',
        ...(darkMode.method === 'class-toggle' ? { selector: normalizeDarkSelector(darkMode.selector) } : {}),
        ...(darkMode.overrides ? { overrides: darkMode.overrides } : {}),
      },
    }
  }

  return JSON.stringify(dtcg, null, 2)
}
