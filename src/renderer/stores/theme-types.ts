export type ColorMode = 'light' | 'dark'

export interface ThemeColors {
  background: string
  foreground: string
  primary: string
  'primary-foreground': string
  secondary: string
  'secondary-foreground': string
  muted: string
  'muted-foreground': string
  accent: string
  'accent-foreground': string
  card: string
  'card-foreground': string
  border: string
  ring: string
  sidebar: string
  'sidebar-foreground': string
  'sidebar-accent': string
  warning: string
  'warning-strong': string
  'warning-foreground': string
  success: string
}

export type ThemeDensity = 'compact' | 'comfortable' | 'spacious'

export interface ThemeTypographyTokens {
  fontBody: string
  fontHeading: string
  fontMono: string
  sizes: {
    xs: string
    sm: string
    base: string
    lg: string
    xl: string
    '2xl': string
  }
  letterSpacing: {
    body: string
    heading: string
    label: string
  }
  lineHeight: {
    body: string
    heading: string
  }
}

export interface ThemeFoundationTokens {
  typography: ThemeTypographyTokens
  spacing: {
    unit: string
    density: ThemeDensity
  }
  layout: {
    sidebarWidth: string
    contentMaxWidth: string
  }
  shape: {
    radiusBase: string
    borderWidth: string
    iconStrokeWidth: string
  }
  elevation: {
    sm: string
    md: string
    lg: string
    focus: string
  }
  motion: {
    fast: string
    normal: string
    slow: string
    easing: string
  }
}

export interface ThemeIdentity {
  values: [string, string, string]
  patterns: [string, string, string]
  evidence: [string, string, string]
}

export type ThemeCategory = 'foundation' | 'narrative' | 'experimental'

export interface ThemeDesignProfile {
  thesis: string
  signatureMoves: Array<{ name: string; description: string }>
  composition: {
    containerStrategy: string
    alignmentStrategy: string
    densityAndWhitespace: string
    rhythm: string
  }
  attention: {
    entryPoint: string
    actionHierarchy: string
    contrastStrategy: string
  }
  visualLanguage: {
    color: string
    typography: string
    shape: string
    surfaces: string
    motion?: string
    imagery?: string
  }
  interactionLanguage: {
    feedbackStyle: string
    stateChangeAmplitude: string
  }
  transferRules: {
    preserve: string[]
    adapt: string[]
    avoid: string[]
  }
}

export interface AppTheme {
  id: string
  name: string
  description: string
  category: ThemeCategory
  colors: ThemeColors
  tokens: ThemeFoundationTokens
  identity: ThemeIdentity
  backgroundImage?: string
  designProfile?: ThemeDesignProfile
}
