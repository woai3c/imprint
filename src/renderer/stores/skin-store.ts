import { create } from 'zustand'

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
}

export interface AppTheme {
  id: string
  name: string
  description: string
  colors: ThemeColors
  radius: string
  fontFamily?: string
}

const LIGHT_DEFAULTS: ThemeColors = {
  background: 'oklch(100% 0 0)',
  foreground: 'oklch(14.5% 0.02 250)',
  primary: 'oklch(55% 0.24 265)',
  'primary-foreground': 'oklch(100% 0 0)',
  secondary: 'oklch(96% 0.01 250)',
  'secondary-foreground': 'oklch(20% 0.02 250)',
  muted: 'oklch(96% 0.01 250)',
  'muted-foreground': 'oklch(55% 0.02 250)',
  accent: 'oklch(96% 0.01 250)',
  'accent-foreground': 'oklch(20% 0.02 250)',
  card: 'oklch(100% 0 0)',
  'card-foreground': 'oklch(14.5% 0.02 250)',
  border: 'oklch(90% 0.01 250)',
  ring: 'oklch(55% 0.24 265)',
  sidebar: 'oklch(97% 0.01 250)',
  'sidebar-foreground': 'oklch(30% 0.02 250)',
  'sidebar-accent': 'oklch(94% 0.02 265)',
}

const DARK_DEFAULTS: ThemeColors = {
  background: 'oklch(15% 0.01 250)',
  foreground: 'oklch(92% 0.01 250)',
  primary: 'oklch(65% 0.2 250)',
  'primary-foreground': 'oklch(100% 0 0)',
  secondary: 'oklch(22% 0.015 250)',
  'secondary-foreground': 'oklch(85% 0.01 250)',
  muted: 'oklch(22% 0.015 250)',
  'muted-foreground': 'oklch(60% 0.01 250)',
  accent: 'oklch(25% 0.02 250)',
  'accent-foreground': 'oklch(85% 0.01 250)',
  card: 'oklch(18% 0.012 250)',
  'card-foreground': 'oklch(92% 0.01 250)',
  border: 'oklch(28% 0.015 250)',
  ring: 'oklch(65% 0.2 250)',
  sidebar: 'oklch(13% 0.01 250)',
  'sidebar-foreground': 'oklch(85% 0.01 250)',
  'sidebar-accent': 'oklch(22% 0.025 250)',
}

export const builtinThemes: AppTheme[] = [
  {
    id: 'default',
    name: '默认',
    description: '清晰简洁的默认主题',
    colors: LIGHT_DEFAULTS,
    radius: '0.5rem',
  },
  {
    id: 'chinese-landscape',
    name: '国风山水画',
    description: '水墨丹青，意境悠远',
    colors: {
      background: 'oklch(97% 0.005 80)',
      foreground: 'oklch(20% 0.015 50)',
      primary: 'oklch(40% 0.05 30)',
      'primary-foreground': 'oklch(97% 0.005 80)',
      secondary: 'oklch(92% 0.01 80)',
      'secondary-foreground': 'oklch(25% 0.02 50)',
      muted: 'oklch(93% 0.008 80)',
      'muted-foreground': 'oklch(45% 0.02 50)',
      accent: 'oklch(55% 0.12 25)',
      'accent-foreground': 'oklch(97% 0 0)',
      card: 'oklch(98% 0.003 80)',
      'card-foreground': 'oklch(20% 0.015 50)',
      border: 'oklch(85% 0.015 60)',
      ring: 'oklch(40% 0.05 30)',
      sidebar: 'oklch(95% 0.008 70)',
      'sidebar-foreground': 'oklch(25% 0.02 50)',
      'sidebar-accent': 'oklch(90% 0.02 30)',
    },
    radius: '0.25rem',
    fontFamily: '"Noto Serif SC", "Source Han Serif SC", serif',
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    description: '霓虹闪烁，未来已来',
    colors: {
      background: 'oklch(10% 0.02 280)',
      foreground: 'oklch(92% 0.02 200)',
      primary: 'oklch(70% 0.25 330)',
      'primary-foreground': 'oklch(10% 0.02 280)',
      secondary: 'oklch(20% 0.03 280)',
      'secondary-foreground': 'oklch(85% 0.02 200)',
      muted: 'oklch(18% 0.02 280)',
      'muted-foreground': 'oklch(60% 0.03 200)',
      accent: 'oklch(75% 0.2 190)',
      'accent-foreground': 'oklch(10% 0.02 280)',
      card: 'oklch(14% 0.025 280)',
      'card-foreground': 'oklch(92% 0.02 200)',
      border: 'oklch(25% 0.04 280)',
      ring: 'oklch(70% 0.25 330)',
      sidebar: 'oklch(12% 0.025 280)',
      'sidebar-foreground': 'oklch(85% 0.02 200)',
      'sidebar-accent': 'oklch(20% 0.06 330)',
    },
    radius: '0.125rem',
  },
  {
    id: 'nordic',
    name: '极简北欧',
    description: '纯净自然，温暖宁静',
    colors: {
      background: 'oklch(99% 0.002 100)',
      foreground: 'oklch(22% 0.01 240)',
      primary: 'oklch(50% 0.08 240)',
      'primary-foreground': 'oklch(99% 0 0)',
      secondary: 'oklch(95% 0.005 100)',
      'secondary-foreground': 'oklch(30% 0.01 240)',
      muted: 'oklch(95% 0.005 100)',
      'muted-foreground': 'oklch(50% 0.01 240)',
      accent: 'oklch(92% 0.02 80)',
      'accent-foreground': 'oklch(30% 0.02 80)',
      card: 'oklch(99% 0.002 100)',
      'card-foreground': 'oklch(22% 0.01 240)',
      border: 'oklch(92% 0.005 100)',
      ring: 'oklch(50% 0.08 240)',
      sidebar: 'oklch(97% 0.003 100)',
      'sidebar-foreground': 'oklch(30% 0.01 240)',
      'sidebar-accent': 'oklch(93% 0.01 240)',
    },
    radius: '0.75rem',
  },
  {
    id: 'glassmorphism',
    name: '毛玻璃',
    description: '通透朦胧，层次分明',
    colors: {
      background: 'oklch(96% 0.01 260)',
      foreground: 'oklch(18% 0.02 260)',
      primary: 'oklch(55% 0.2 270)',
      'primary-foreground': 'oklch(100% 0 0)',
      secondary: 'oklch(93% 0.015 260)',
      'secondary-foreground': 'oklch(25% 0.02 260)',
      muted: 'oklch(94% 0.01 260)',
      'muted-foreground': 'oklch(50% 0.02 260)',
      accent: 'oklch(60% 0.15 300)',
      'accent-foreground': 'oklch(100% 0 0)',
      card: 'oklch(98% 0.005 260)',
      'card-foreground': 'oklch(18% 0.02 260)',
      border: 'oklch(88% 0.015 260)',
      ring: 'oklch(55% 0.2 270)',
      sidebar: 'oklch(95% 0.01 260)',
      'sidebar-foreground': 'oklch(25% 0.02 260)',
      'sidebar-accent': 'oklch(90% 0.025 270)',
    },
    radius: '1rem',
  },
]

interface SkinStore {
  currentThemeId: string
  colorMode: ColorMode
  setTheme: (id: string) => void
  setColorMode: (mode: ColorMode) => void
  applyTheme: (theme: AppTheme) => void
  applyCustomCss: (cssVars: string) => void
  reset: () => void
}

export const useSkinStore = create<SkinStore>((set, get) => ({
  currentThemeId: 'default',
  colorMode: (localStorage.getItem('colorMode') as ColorMode) || 'light',

  setTheme: (id) => {
    const theme = builtinThemes.find((t) => t.id === id)
    if (theme) {
      set({ currentThemeId: id })
      applyThemeToDOM(theme)
    }
  },

  setColorMode: (mode) => {
    set({ colorMode: mode })
    localStorage.setItem('colorMode', mode)
    const { currentThemeId } = get()

    if (currentThemeId === 'default') {
      applyColorsToDOM(mode === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS)
    }

    document.documentElement.classList.toggle('dark', mode === 'dark')
  },

  applyTheme: (theme) => {
    set({ currentThemeId: theme.id })
    applyThemeToDOM(theme)
  },

  applyCustomCss: (cssVars) => {
    set({ currentThemeId: 'custom' })
    applyCssVarsToDOM(cssVars)
  },

  reset: () => {
    const { colorMode } = get()
    set({ currentThemeId: 'default' })
    applyColorsToDOM(colorMode === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS)
  },
}))

function applyColorsToDOM(colors: ThemeColors) {
  const root = document.documentElement
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(`--color-${key}`, value)
  }
}

function applyThemeToDOM(theme: AppTheme) {
  applyColorsToDOM(theme.colors)
  const root = document.documentElement
  root.style.setProperty('--radius-md', theme.radius)
  if (theme.fontFamily) {
    root.style.setProperty('--font-body', theme.fontFamily)
    document.body.style.fontFamily = theme.fontFamily
  } else {
    root.style.removeProperty('--font-body')
    document.body.style.fontFamily = ''
  }
}

function applyCssVarsToDOM(cssVars: string) {
  const regex = /--([\w-]+)\s*:\s*([^;]+)/g
  let match
  const root = document.documentElement
  while ((match = regex.exec(cssVars)) !== null) {
    root.style.setProperty(`--${match[1]}`, match[2].trim())
  }
}

export function initColorMode() {
  const mode = (localStorage.getItem('colorMode') as ColorMode) || 'light'
  document.documentElement.classList.toggle('dark', mode === 'dark')
  if (mode === 'dark') {
    applyColorsToDOM(DARK_DEFAULTS)
  }
}
