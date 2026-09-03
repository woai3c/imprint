export function isStandaloneColorProperty(property: string): boolean {
  return /^(?:color|backgroundColor|border(?:Top|Right|Bottom|Left)?Color|outlineColor|textDecorationColor|fill|stroke)$/.test(
    property,
  )
}

const TEXT_COLOR_ROLES = new Set(['foreground', 'muted-foreground', 'accent', 'editorial-accent', 'danger'])
const SURFACE_COLOR_ROLES = new Set([
  'background',
  'surface',
  'secondary',
  'primary',
  'accent',
  'danger',
  'decorative-accent',
])
const BORDER_COLOR_ROLES = new Set(['border', 'border-subtle'])
const OUTLINE_COLOR_ROLES = new Set(['border', 'border-subtle', 'primary', 'accent', 'danger'])
const GLYPH_FILL_ROLES = new Set([
  'foreground',
  'muted-foreground',
  'primary',
  'accent',
  'editorial-accent',
  'danger',
  'decorative-accent',
])

function colorRoleFromTokenRef(tokenRef: string): string | undefined {
  const match = tokenRef.match(/^(?:color|colors)\.([\w-]+)$/)
  return match?.[1]
}

/** Equal color literals remain distinct unless the token's semantic role also matches the rendered CSS channel. */
export function colorTokenRefCompatibleWithStyle(property: string, tokenRef: string): boolean {
  const role = colorRoleFromTokenRef(tokenRef)
  if (!role) return false
  if (property === 'backgroundColor') return SURFACE_COLOR_ROLES.has(role)
  if (/^border(?:Top|Right|Bottom|Left)?Color$/.test(property)) return BORDER_COLOR_ROLES.has(role)
  if (property === 'outlineColor') return OUTLINE_COLOR_ROLES.has(role)
  if (property === 'stroke') return new Set([...GLYPH_FILL_ROLES, ...BORDER_COLOR_ROLES]).has(role)
  if (property === 'fill') return GLYPH_FILL_ROLES.has(role)
  if (property === 'color' || property === 'textDecorationColor') return TEXT_COLOR_ROLES.has(role)
  return false
}

/**
 * Token values are not globally interchangeable: `16px` can be a font size, spacing, or radius.
 * Require the CSS property namespace to agree before attaching a token reference to evidence.
 */
export function tokenRefCompatibleWithStyle(property: string, tokenRef: string): boolean {
  if (isStandaloneColorProperty(property)) return colorTokenRefCompatibleWithStyle(property, tokenRef)
  if (/^border(?:Top|Right|Bottom|Left)?$/.test(property)) return tokenRef.startsWith('border.')
  if (/^border(?:Radius|(?:TopLeft|TopRight|BottomRight|BottomLeft)Radius)$/.test(property)) {
    return tokenRef.startsWith('radius.')
  }
  if (property === 'boxShadow') return tokenRef.startsWith('shadow.')
  if (property === 'fontFamily') return /^typography\.font-(?:family|stack)\./.test(tokenRef)
  if (property === 'fontSize') return tokenRef.startsWith('typography.font-size.')
  if (property === 'fontWeight') return tokenRef.startsWith('typography.font-weight.')
  if (property === 'lineHeight') return tokenRef.startsWith('typography.line-height.')
  if (property === 'letterSpacing') return tokenRef.startsWith('typography.letter-spacing.')
  if (/^(?:gap|rowGap|columnGap|padding(?:Top|Right|Bottom|Left)?|margin(?:Top|Right|Bottom|Left)?)$/.test(property)) {
    return tokenRef.startsWith('spacing.')
  }
  if (property === 'zIndex') return tokenRef.startsWith('z-index.')
  if (/^transition/.test(property)) return tokenRef.startsWith('transition.')
  return false
}
