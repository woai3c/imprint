export function isStandaloneColorProperty(property: string): boolean {
  return /^(?:color|backgroundColor|border(?:Top|Right|Bottom|Left)?Color|outlineColor|textDecorationColor|fill|stroke)$/.test(
    property,
  )
}

/**
 * Token values are not globally interchangeable: `16px` can be a font size, spacing, or radius.
 * Require the CSS property namespace to agree before attaching a token reference to evidence.
 */
export function tokenRefCompatibleWithStyle(property: string, tokenRef: string): boolean {
  if (isStandaloneColorProperty(property)) return tokenRef.startsWith('color.')
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
