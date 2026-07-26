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
export type ThemeExportFormat = 'markdown' | 'css' | 'tailwind' | 'json'

export interface AppTheme {
  id: string
  name: string
  description: string
  category: ThemeCategory
  colors: ThemeColors
  tokens: ThemeFoundationTokens
  identity: ThemeIdentity
}

type ThemeTokenOverrides = {
  typography?: Partial<Omit<ThemeTypographyTokens, 'sizes' | 'letterSpacing' | 'lineHeight'>> & {
    sizes?: Partial<ThemeTypographyTokens['sizes']>
    letterSpacing?: Partial<ThemeTypographyTokens['letterSpacing']>
    lineHeight?: Partial<ThemeTypographyTokens['lineHeight']>
  }
  spacing?: Partial<ThemeFoundationTokens['spacing']>
  layout?: Partial<ThemeFoundationTokens['layout']>
  shape?: Partial<ThemeFoundationTokens['shape']>
  elevation?: Partial<ThemeFoundationTokens['elevation']>
  motion?: Partial<ThemeFoundationTokens['motion']>
}

const DEFAULT_THEME_TOKENS: ThemeFoundationTokens = {
  typography: {
    fontBody: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontHeading: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontMono: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
    },
    letterSpacing: {
      body: '0',
      heading: '-0.02em',
      label: '0.01em',
    },
    lineHeight: {
      body: '1.5',
      heading: '1.25',
    },
  },
  spacing: {
    unit: '0.25rem',
    density: 'comfortable',
  },
  layout: {
    sidebarWidth: '12rem',
    contentMaxWidth: 'none',
  },
  shape: {
    radiusBase: '0.5rem',
    borderWidth: '1px',
    iconStrokeWidth: '2',
  },
  elevation: {
    sm: '0 1px 3px rgb(15 23 42 / 6%)',
    md: '0 8px 24px rgb(15 23 42 / 8%)',
    lg: '0 18px 48px rgb(15 23 42 / 12%)',
    focus: '0 0 0 3px color-mix(in oklab, var(--color-ring) 22%, transparent)',
  },
  motion: {
    fast: '100ms',
    normal: '180ms',
    slow: '320ms',
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
  },
}

function createThemeTokens(overrides: ThemeTokenOverrides = {}): ThemeFoundationTokens {
  return {
    typography: {
      ...DEFAULT_THEME_TOKENS.typography,
      ...overrides.typography,
      sizes: {
        ...DEFAULT_THEME_TOKENS.typography.sizes,
        ...overrides.typography?.sizes,
      },
      letterSpacing: {
        ...DEFAULT_THEME_TOKENS.typography.letterSpacing,
        ...overrides.typography?.letterSpacing,
      },
      lineHeight: {
        ...DEFAULT_THEME_TOKENS.typography.lineHeight,
        ...overrides.typography?.lineHeight,
      },
    },
    spacing: {
      ...DEFAULT_THEME_TOKENS.spacing,
      ...overrides.spacing,
    },
    layout: {
      ...DEFAULT_THEME_TOKENS.layout,
      ...overrides.layout,
    },
    shape: {
      ...DEFAULT_THEME_TOKENS.shape,
      ...overrides.shape,
    },
    elevation: {
      ...DEFAULT_THEME_TOKENS.elevation,
      ...overrides.elevation,
    },
    motion: {
      ...DEFAULT_THEME_TOKENS.motion,
      ...overrides.motion,
    },
  }
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
    category: 'foundation',
    colors: LIGHT_DEFAULTS,
    tokens: createThemeTokens(),
    identity: {
      values: ['清晰', '一致', '高效'],
      patterns: ['语义层级', '渐进披露', '即时反馈'],
      evidence: ['语义色定义主次和状态', '摘要先于令牌与导出细节', '选择、复制和导出均就地反馈'],
    },
  },
  {
    id: 'chinese-landscape',
    name: '国风山水画',
    description: '宣纸留白，五色墨韵，朱砂点睛',
    category: 'narrative',
    colors: {
      background: 'oklch(95.5% 0.014 88)',
      foreground: 'oklch(23% 0.012 65)',
      primary: 'oklch(29% 0.018 145)',
      'primary-foreground': 'oklch(96% 0.01 88)',
      secondary: 'oklch(90.5% 0.018 88)',
      'secondary-foreground': 'oklch(28% 0.014 65)',
      muted: 'oklch(92% 0.014 88)',
      'muted-foreground': 'oklch(48% 0.018 70)',
      accent: 'oklch(48% 0.14 29)',
      'accent-foreground': 'oklch(97% 0.008 88)',
      card: 'oklch(97% 0.01 88)',
      'card-foreground': 'oklch(23% 0.012 65)',
      border: 'oklch(79% 0.023 82)',
      ring: 'oklch(48% 0.14 29)',
      sidebar: 'oklch(92.5% 0.017 88)',
      'sidebar-foreground': 'oklch(29% 0.014 65)',
      'sidebar-accent': 'oklch(86% 0.022 88)',
    },
    tokens: createThemeTokens({
      typography: {
        fontBody: '"Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
        fontHeading: '"Noto Serif SC", "Source Han Serif SC", "STSong", "SimSun", serif',
        letterSpacing: {
          body: '0.01em',
          heading: '0.045em',
          label: '0.06em',
        },
        lineHeight: {
          body: '1.65',
          heading: '1.35',
        },
      },
      shape: {
        radiusBase: '0.25rem',
        iconStrokeWidth: '1.75',
      },
      elevation: {
        sm: '0 2px 8px rgb(54 47 36 / 5%)',
        md: '0 10px 30px rgb(54 47 36 / 8%)',
        lg: '0 22px 54px rgb(54 47 36 / 12%)',
      },
      motion: {
        normal: '220ms',
        slow: '700ms',
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    }),
    identity: {
      values: ['留白', '含蓄', '气韵'],
      patterns: ['低对比材质', '朱砂焦点', '宋黑分工'],
      evidence: ['纸张纹理退居内容之后', '朱砂只承担选择与关键状态', '宋体标题、黑体正文、等宽代码'],
    },
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    description: '深色信息舱，青色与琥珀信号克制发光',
    category: 'experimental',
    colors: {
      background: 'oklch(12% 0.018 250)',
      foreground: 'oklch(90% 0.018 210)',
      primary: 'oklch(70% 0.11 205)',
      'primary-foreground': 'oklch(12% 0.02 250)',
      secondary: 'oklch(20% 0.025 245)',
      'secondary-foreground': 'oklch(84% 0.022 210)',
      muted: 'oklch(17% 0.018 245)',
      'muted-foreground': 'oklch(66% 0.028 215)',
      accent: 'oklch(73% 0.13 85)',
      'accent-foreground': 'oklch(14% 0.025 250)',
      card: 'oklch(15% 0.022 247)',
      'card-foreground': 'oklch(90% 0.018 210)',
      border: 'oklch(27% 0.035 230)',
      ring: 'oklch(78% 0.14 85)',
      sidebar: 'oklch(13.5% 0.021 248)',
      'sidebar-foreground': 'oklch(84% 0.022 210)',
      'sidebar-accent': 'oklch(22% 0.045 215)',
    },
    tokens: createThemeTokens({
      typography: {
        fontBody: '"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", sans-serif',
        fontHeading: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
        sizes: {
          base: '0.9375rem',
        },
        letterSpacing: {
          body: '0.015em',
          heading: '0.045em',
          label: '0.08em',
        },
      },
      spacing: {
        density: 'compact',
        unit: '0.2425rem',
      },
      layout: {
        sidebarWidth: '11.75rem',
      },
      shape: {
        radiusBase: '0.125rem',
        iconStrokeWidth: '1.5',
      },
      elevation: {
        sm: '0 0 12px rgb(78 201 210 / 7%)',
        md: '0 0 24px rgb(214 169 70 / 9%)',
        lg: '0 16px 48px rgb(0 0 0 / 34%)',
        focus: '0 0 0 2px color-mix(in oklab, var(--color-ring) 36%, transparent)',
      },
      motion: {
        fast: '80ms',
        normal: '150ms',
        slow: '360ms',
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    }),
    identity: {
      values: ['秩序', '信号', '节制'],
      patterns: ['分层暗面', '局部发光', '青琥珀信号'],
      evidence: ['外壳、卡片和控件使用不同明度', '光效仅服务焦点与关键操作', '青色表达操作，琥珀表达选择'],
    },
  },
  {
    id: 'nordic',
    name: '北欧晨雾',
    description: '晨雾柔光，克制自然的北欧质感',
    category: 'foundation',
    colors: {
      background: 'oklch(97% 0.012 92)',
      foreground: 'oklch(26% 0.025 235)',
      primary: 'oklch(48% 0.072 230)',
      'primary-foreground': 'oklch(98% 0.004 95)',
      secondary: 'oklch(92.5% 0.02 105)',
      'secondary-foreground': 'oklch(31% 0.03 230)',
      muted: 'oklch(93.5% 0.014 96)',
      'muted-foreground': 'oklch(51% 0.026 225)',
      accent: 'oklch(62% 0.105 44)',
      'accent-foreground': 'oklch(98% 0.005 90)',
      card: 'oklch(99% 0.006 96)',
      'card-foreground': 'oklch(26% 0.025 235)',
      border: 'oklch(85.5% 0.024 94)',
      ring: 'oklch(48% 0.072 230)',
      sidebar: 'oklch(93.5% 0.021 104)',
      'sidebar-foreground': 'oklch(32% 0.032 225)',
      'sidebar-accent': 'oklch(87.5% 0.035 119)',
    },
    tokens: createThemeTokens({
      typography: {
        fontBody: '"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", sans-serif',
        fontHeading: '"Aptos Display", "Segoe UI Variable Display", "Segoe UI", sans-serif',
        letterSpacing: {
          body: '-0.005em',
          heading: '-0.015em',
          label: '0.01em',
        },
        lineHeight: {
          body: '1.6',
          heading: '1.2',
        },
      },
      spacing: {
        density: 'spacious',
        unit: '0.265rem',
      },
      layout: {
        sidebarWidth: '12.5rem',
      },
      shape: {
        radiusBase: '0.875rem',
        iconStrokeWidth: '1.75',
      },
      elevation: {
        sm: '0 3px 12px rgb(58 72 75 / 6%)',
        md: '0 12px 32px rgb(58 72 75 / 8%)',
        lg: '0 24px 60px rgb(58 72 75 / 12%)',
      },
      motion: {
        fast: '140ms',
        normal: '240ms',
        slow: '420ms',
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    }),
    identity: {
      values: ['平静', '自然', '友好'],
      patterns: ['柔光分区', '实体白卡', '温暖点色'],
      evidence: ['低饱和背景划分工作区域', '主要内容保持高不透明度', '暖色只用于少量强调信息'],
    },
  },
  {
    id: 'glassmorphism',
    name: '极光玻璃',
    description: '流动极光，悬浮而清晰的玻璃层次',
    category: 'experimental',
    colors: {
      background: 'oklch(94% 0.025 260)',
      foreground: 'oklch(20% 0.035 270)',
      primary: 'oklch(57% 0.205 282)',
      'primary-foreground': 'oklch(100% 0 0)',
      secondary: 'oklch(92% 0.03 254)',
      'secondary-foreground': 'oklch(27% 0.04 272)',
      muted: 'oklch(93% 0.024 260)',
      'muted-foreground': 'oklch(49% 0.042 268)',
      accent: 'oklch(69% 0.145 193)',
      'accent-foreground': 'oklch(17% 0.035 265)',
      card: 'oklch(98% 0.012 260)',
      'card-foreground': 'oklch(20% 0.035 270)',
      border: 'oklch(86% 0.032 260)',
      ring: 'oklch(52% 0.23 292)',
      sidebar: 'oklch(94% 0.025 258)',
      'sidebar-foreground': 'oklch(26% 0.04 270)',
      'sidebar-accent': 'oklch(89% 0.055 273)',
    },
    tokens: createThemeTokens({
      typography: {
        fontBody: '"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", sans-serif',
        fontHeading: '"Segoe UI Variable Display", "Segoe UI", sans-serif',
        letterSpacing: {
          body: '-0.005em',
          heading: '-0.02em',
          label: '0.015em',
        },
      },
      spacing: {
        density: 'spacious',
        unit: '0.26rem',
      },
      layout: {
        sidebarWidth: '12.25rem',
      },
      shape: {
        radiusBase: '1rem',
        iconStrokeWidth: '1.75',
      },
      elevation: {
        sm: '0 4px 16px rgb(67 62 110 / 7%)',
        md: '0 16px 38px rgb(67 62 110 / 10%)',
        lg: '0 28px 68px rgb(67 62 110 / 16%)',
      },
      motion: {
        fast: '140ms',
        normal: '240ms',
        slow: '520ms',
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    }),
    identity: {
      values: ['层次', '流动', '轻盈'],
      patterns: ['功能层玻璃', '内容层稳定', '色彩透射'],
      evidence: ['模糊仅用于侧栏与顶栏', '阅读卡片使用近实体表面', '极光停留在内容背板之后'],
    },
  },
  {
    id: 'dunhuang',
    name: '敦煌壁彩',
    description: '矿彩入壁，千年风化的温度',
    category: 'narrative',
    colors: {
      background: 'oklch(91.5% 0.046 76)',
      foreground: 'oklch(28% 0.04 58)',
      primary: 'oklch(48% 0.13 49)',
      'primary-foreground': 'oklch(96% 0.018 79)',
      secondary: 'oklch(84.5% 0.06 76)',
      'secondary-foreground': 'oklch(31% 0.045 58)',
      muted: 'oklch(87% 0.042 77)',
      'muted-foreground': 'oklch(48% 0.05 62)',
      accent: 'oklch(47% 0.095 235)',
      'accent-foreground': 'oklch(96% 0.015 80)',
      card: 'oklch(94.5% 0.03 78)',
      'card-foreground': 'oklch(28% 0.04 58)',
      border: 'oklch(69% 0.065 68)',
      ring: 'oklch(47% 0.095 235)',
      sidebar: 'oklch(85.5% 0.055 76)',
      'sidebar-foreground': 'oklch(31% 0.045 58)',
      'sidebar-accent': 'oklch(78% 0.074 66)',
    },
    tokens: createThemeTokens({
      typography: {
        fontBody: '"Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
        fontHeading: '"Noto Serif SC", "Source Han Serif SC", "STSong", "SimSun", serif',
        letterSpacing: {
          body: '0.01em',
          heading: '0.055em',
          label: '0.055em',
        },
        lineHeight: {
          body: '1.65',
          heading: '1.35',
        },
      },
      spacing: {
        unit: '0.255rem',
      },
      shape: {
        radiusBase: '0.25rem',
        iconStrokeWidth: '1.75',
      },
      elevation: {
        sm: '0 2px 10px rgb(82 53 30 / 6%)',
        md: '0 12px 34px rgb(82 53 30 / 10%)',
        lg: '0 24px 60px rgb(82 53 30 / 15%)',
      },
      motion: {
        normal: '220ms',
        slow: '560ms',
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    }),
    identity: {
      values: ['传承', '克制', '时间感'],
      patterns: ['矿彩点色', '风化底纹', '现代排版'],
      evidence: ['赭石与石青只标记关键状态', '壁面纹理不穿透正文表面', '传统材质沿用现代信息层级'],
    },
  },
  {
    id: 'blueprint',
    name: '午夜蓝图',
    description: '坐标网格，理性精密的创作画布',
    category: 'experimental',
    colors: {
      background: 'oklch(14% 0.032 246)',
      foreground: 'oklch(91% 0.035 210)',
      primary: 'oklch(76% 0.13 210)',
      'primary-foreground': 'oklch(13% 0.03 246)',
      secondary: 'oklch(21% 0.046 242)',
      'secondary-foreground': 'oklch(87% 0.035 211)',
      muted: 'oklch(19% 0.038 244)',
      'muted-foreground': 'oklch(64% 0.06 219)',
      accent: 'oklch(78% 0.16 82)',
      'accent-foreground': 'oklch(15% 0.035 246)',
      card: 'oklch(17% 0.04 244)',
      'card-foreground': 'oklch(91% 0.035 210)',
      border: 'oklch(32% 0.072 230)',
      ring: 'oklch(82% 0.16 82)',
      sidebar: 'oklch(11.5% 0.03 247)',
      'sidebar-foreground': 'oklch(83% 0.045 214)',
      'sidebar-accent': 'oklch(22% 0.065 230)',
    },
    tokens: createThemeTokens({
      typography: {
        fontBody: '"Cascadia Code", "SFMono-Regular", Consolas, "Microsoft YaHei UI", monospace',
        fontHeading: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
        sizes: {
          base: '0.9375rem',
        },
        letterSpacing: {
          body: '0.02em',
          heading: '0.07em',
          label: '0.08em',
        },
        lineHeight: {
          body: '1.55',
          heading: '1.3',
        },
      },
      spacing: {
        density: 'compact',
        unit: '0.24rem',
      },
      layout: {
        sidebarWidth: '11.5rem',
      },
      shape: {
        radiusBase: '0.125rem',
        iconStrokeWidth: '1.5',
      },
      elevation: {
        sm: '0 0 10px rgb(91 209 255 / 7%)',
        md: '0 12px 34px rgb(0 4 12 / 26%)',
        lg: '0 24px 64px rgb(0 4 12 / 40%)',
        focus: '0 0 0 2px color-mix(in oklab, var(--color-ring) 34%, transparent)',
      },
      motion: {
        fast: '80ms',
        normal: '150ms',
        slow: '300ms',
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    }),
    identity: {
      values: ['精确', '理性', '可追溯'],
      patterns: ['坐标网格', '等宽标记', '青色状态'],
      evidence: ['网格只出现在工作底板', '等宽字体用于数值与结构标记', '青色操作、制图黄选择边框'],
    },
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
    resetThemeAppearance('custom')
    applyCssVarsToDOM(cssVars)
  },

  reset: () => {
    const { colorMode } = get()
    set({ currentThemeId: 'default' })
    applyColorsToDOM(colorMode === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS)
    resetThemeAppearance('default')
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
  root.dataset.appTheme = theme.id
  root.style.setProperty('--color-input', theme.colors.border)
  applyThemeTokensToDOM(theme.tokens)
}

function resetThemeAppearance(themeId: string) {
  const root = document.documentElement
  root.dataset.appTheme = themeId
  root.style.removeProperty('--color-input')
  applyThemeTokensToDOM(DEFAULT_THEME_TOKENS)
}

function applyThemeTokensToDOM(tokens: ThemeFoundationTokens) {
  const root = document.documentElement
  const { typography, spacing, layout, shape, elevation, motion } = tokens

  root.style.setProperty('--font-body', typography.fontBody)
  root.style.setProperty('--font-heading', typography.fontHeading)
  root.style.setProperty('--font-mono', typography.fontMono)
  root.style.setProperty('--text-xs', typography.sizes.xs)
  root.style.setProperty('--text-sm', typography.sizes.sm)
  root.style.setProperty('--text-base', typography.sizes.base)
  root.style.setProperty('--text-lg', typography.sizes.lg)
  root.style.setProperty('--text-xl', typography.sizes.xl)
  root.style.setProperty('--text-2xl', typography.sizes['2xl'])
  root.style.setProperty('--text-xs--line-height', typography.lineHeight.body)
  root.style.setProperty('--text-sm--line-height', typography.lineHeight.body)
  root.style.setProperty('--text-base--line-height', typography.lineHeight.body)
  root.style.setProperty('--text-lg--line-height', typography.lineHeight.heading)
  root.style.setProperty('--text-xl--line-height', typography.lineHeight.heading)
  root.style.setProperty('--text-2xl--line-height', typography.lineHeight.heading)
  root.style.setProperty('--tracking-body', typography.letterSpacing.body)
  root.style.setProperty('--tracking-heading', typography.letterSpacing.heading)
  root.style.setProperty('--tracking-label', typography.letterSpacing.label)
  root.style.setProperty('--leading-body', typography.lineHeight.body)
  root.style.setProperty('--leading-heading', typography.lineHeight.heading)

  root.style.setProperty('--spacing', spacing.unit)
  root.style.setProperty('--app-sidebar-width', layout.sidebarWidth)
  root.style.setProperty('--app-content-max-width', layout.contentMaxWidth)
  root.dataset.themeDensity = spacing.density

  root.style.setProperty('--radius-sm', `max(0px, calc(${shape.radiusBase} - 0.25rem))`)
  root.style.setProperty('--radius-md', shape.radiusBase)
  root.style.setProperty('--radius-lg', `calc(${shape.radiusBase} + 0.25rem)`)
  root.style.setProperty('--radius-xl', `calc(${shape.radiusBase} + 0.5rem)`)
  root.style.setProperty('--border-width', shape.borderWidth)
  root.style.setProperty('--icon-stroke-width', shape.iconStrokeWidth)

  root.style.setProperty('--shadow-sm', elevation.sm)
  root.style.setProperty('--shadow-md', elevation.md)
  root.style.setProperty('--shadow-lg', elevation.lg)
  root.style.setProperty('--focus-ring-shadow', elevation.focus)

  root.style.setProperty('--motion-fast', motion.fast)
  root.style.setProperty('--motion-normal', motion.normal)
  root.style.setProperty('--motion-slow', motion.slow)
  root.style.setProperty('--motion-easing', motion.easing)

  document.body.style.fontFamily = typography.fontBody
}

function applyCssVarsToDOM(cssVars: string) {
  const regex = /--([\w-]+)\s*:\s*([^;]+)/g
  let match
  const root = document.documentElement
  while ((match = regex.exec(cssVars)) !== null) {
    root.style.setProperty(`--${match[1]}`, match[2].trim())
  }
}

export function generateThemeCss(theme: AppTheme): string {
  const { typography, spacing, layout, shape, elevation, motion } = theme.tokens
  const variables: Record<string, string> = {
    ...Object.fromEntries(Object.entries(theme.colors).map(([name, value]) => [`--color-${name}`, value])),
    '--color-input': theme.colors.border,
    '--font-body': typography.fontBody,
    '--font-heading': typography.fontHeading,
    '--font-mono': typography.fontMono,
    '--text-xs': typography.sizes.xs,
    '--text-sm': typography.sizes.sm,
    '--text-base': typography.sizes.base,
    '--text-lg': typography.sizes.lg,
    '--text-xl': typography.sizes.xl,
    '--text-2xl': typography.sizes['2xl'],
    '--tracking-body': typography.letterSpacing.body,
    '--tracking-heading': typography.letterSpacing.heading,
    '--tracking-label': typography.letterSpacing.label,
    '--leading-body': typography.lineHeight.body,
    '--leading-heading': typography.lineHeight.heading,
    '--spacing': spacing.unit,
    '--app-sidebar-width': layout.sidebarWidth,
    '--app-content-max-width': layout.contentMaxWidth,
    '--radius-sm': `max(0px, calc(${shape.radiusBase} - 0.25rem))`,
    '--radius-md': shape.radiusBase,
    '--radius-lg': `calc(${shape.radiusBase} + 0.25rem)`,
    '--radius-xl': `calc(${shape.radiusBase} + 0.5rem)`,
    '--border-width': shape.borderWidth,
    '--icon-stroke-width': shape.iconStrokeWidth,
    '--shadow-sm': elevation.sm,
    '--shadow-md': elevation.md,
    '--shadow-lg': elevation.lg,
    '--focus-ring-shadow': elevation.focus,
    '--motion-fast': motion.fast,
    '--motion-normal': motion.normal,
    '--motion-slow': motion.slow,
    '--motion-easing': motion.easing,
  }

  const declarations = Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')

  return `:root {\n${declarations}\n}\n`
}

export function generateThemeTailwind(theme: AppTheme): string {
  const { typography, spacing, layout, shape, elevation, motion } = theme.tokens
  const variables: Record<string, string> = {
    ...Object.fromEntries(Object.entries(theme.colors).map(([name, value]) => [`--color-${name}`, value])),
    '--font-sans': typography.fontBody,
    '--font-heading': typography.fontHeading,
    '--font-mono': typography.fontMono,
    '--text-xs': typography.sizes.xs,
    '--text-sm': typography.sizes.sm,
    '--text-base': typography.sizes.base,
    '--text-lg': typography.sizes.lg,
    '--text-xl': typography.sizes.xl,
    '--text-2xl': typography.sizes['2xl'],
    '--text-xs--line-height': typography.lineHeight.body,
    '--text-sm--line-height': typography.lineHeight.body,
    '--text-base--line-height': typography.lineHeight.body,
    '--text-lg--line-height': typography.lineHeight.heading,
    '--text-xl--line-height': typography.lineHeight.heading,
    '--text-2xl--line-height': typography.lineHeight.heading,
    '--tracking-body': typography.letterSpacing.body,
    '--tracking-heading': typography.letterSpacing.heading,
    '--tracking-label': typography.letterSpacing.label,
    '--leading-body': typography.lineHeight.body,
    '--leading-heading': typography.lineHeight.heading,
    '--spacing': spacing.unit,
    '--width-sidebar': layout.sidebarWidth,
    '--container-content': layout.contentMaxWidth,
    '--radius-sm': `max(0px, calc(${shape.radiusBase} - 0.25rem))`,
    '--radius-md': shape.radiusBase,
    '--radius-lg': `calc(${shape.radiusBase} + 0.25rem)`,
    '--radius-xl': `calc(${shape.radiusBase} + 0.5rem)`,
    '--border-width-theme': shape.borderWidth,
    '--icon-stroke-width': shape.iconStrokeWidth,
    '--shadow-sm': elevation.sm,
    '--shadow-md': elevation.md,
    '--shadow-lg': elevation.lg,
    '--shadow-focus': elevation.focus,
    '--duration-fast': motion.fast,
    '--duration-normal': motion.normal,
    '--duration-slow': motion.slow,
    '--ease-theme': motion.easing,
  }

  const declarations = Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')

  return `@theme {\n${declarations}\n}\n`
}

export function generateThemeJson(theme: AppTheme): string {
  const { typography, spacing, shape, elevation, motion } = theme.tokens

  return JSON.stringify(
    {
      meta: {
        generator: 'Imprint',
        name: theme.name,
        description: theme.description,
        category: theme.category,
      },
      identity: theme.identity,
      colors: theme.colors,
      typography: {
        fontFamilies: [typography.fontBody, typography.fontHeading, typography.fontMono],
        fontStacks: [typography.fontBody, typography.fontHeading, typography.fontMono],
        fontSizes: Object.values(typography.sizes),
        fontWeights: [],
        letterSpacings: Object.values(typography.letterSpacing),
        lineHeights: Object.values(typography.lineHeight),
      },
      spacing: [spacing.unit],
      radii: [
        `max(0px, calc(${shape.radiusBase} - 0.25rem))`,
        shape.radiusBase,
        `calc(${shape.radiusBase} + 0.25rem)`,
        `calc(${shape.radiusBase} + 0.5rem)`,
      ],
      shadows: [elevation.sm, elevation.md, elevation.lg],
      borders: [shape.borderWidth],
      zIndices: [],
      transitions: [motion.fast, motion.normal, motion.slow],
      usageCount: {},
      imprintTheme: {
        foundation: theme.tokens,
      },
    },
    null,
    2,
  )
}

export function generateThemeMarkdown(theme: AppTheme, language: 'zh-CN' | 'en'): string {
  const zh = language === 'zh-CN'
  const css = generateThemeCss(theme)
  const category = zh
    ? { foundation: '基础主题', narrative: '叙事主题', experimental: '实验主题' }[theme.category]
    : { foundation: 'Foundation', narrative: 'Narrative', experimental: 'Experimental' }[theme.category]
  const lines: string[] = [
    `# ${theme.name}`,
    '',
    theme.description,
    '',
    `> ${zh ? '类别' : 'Category'}: ${category}`,
    '',
    `## ${zh ? '设计意图' : 'Design intent'}`,
    '',
    `**${zh ? '价值' : 'Values'}:** ${theme.identity.values.join(' · ')}`,
    '',
  ]

  theme.identity.patterns.forEach((pattern, index) => {
    lines.push(`### ${pattern}`, '', theme.identity.evidence[index], '')
  })

  lines.push(
    `## ${zh ? '基础令牌' : 'Foundation tokens'}`,
    '',
    `- ${zh ? '正文字体' : 'Body font'}: \`${theme.tokens.typography.fontBody}\``,
    `- ${zh ? '标题字体' : 'Heading font'}: \`${theme.tokens.typography.fontHeading}\``,
    `- ${zh ? '等宽字体' : 'Monospace font'}: \`${theme.tokens.typography.fontMono}\``,
    `- ${zh ? '间距基准' : 'Spacing unit'}: \`${theme.tokens.spacing.unit}\``,
    `- ${zh ? '密度' : 'Density'}: \`${theme.tokens.spacing.density}\``,
    `- ${zh ? '基础圆角' : 'Base radius'}: \`${theme.tokens.shape.radiusBase}\``,
    `- ${zh ? '边框宽度' : 'Border width'}: \`${theme.tokens.shape.borderWidth}\``,
    `- ${zh ? '标准动效' : 'Standard motion'}: \`${theme.tokens.motion.normal}\``,
    '',
    `## ${zh ? 'CSS 变量' : 'CSS variables'}`,
    '',
    '```css',
    css.trimEnd(),
    '```',
    '',
    `## ${zh ? '给 AI 的使用说明' : 'Instructions for AI'}`,
    '',
    zh
      ? '- 将本文档作为视觉规则的真源，并结合现有 UI 截图或源代码修改界面。'
      : '- Treat this document as the source of truth for visual rules, and use it with the existing UI screenshots or source code.',
    zh
      ? '- 优先复用这里的语义色、字体、间距、圆角、阴影和动效，不要自行发明近似值。'
      : '- Reuse these semantic colors, fonts, spacing, radii, shadows, and motion values instead of inventing approximations.',
    zh
      ? '- 保留现有产品的信息层级和交互位置，只调整与目标设计语言有关的视觉表达。'
      : '- Preserve the product hierarchy and interaction locations; change only the visual expression required by this language.',
    '',
    `## ${zh ? '导出范围' : 'Export scope'}`,
    '',
    zh
      ? '本文件包含可复用的设计意图与主题令牌，不包含 Imprint 桌面应用专用的背景图片、纹理素材或外壳组件样式。'
      : 'This file contains reusable design intent and theme tokens. It does not embed background images, texture assets, or shell component styles that are specific to the Imprint desktop app.',
  )

  return `${lines.join('\n')}\n`
}

export function initColorMode() {
  const mode = (localStorage.getItem('colorMode') as ColorMode) || 'light'
  document.documentElement.dataset.appTheme = 'default'
  applyThemeTokensToDOM(DEFAULT_THEME_TOKENS)
  document.documentElement.classList.toggle('dark', mode === 'dark')
  if (mode === 'dark') {
    applyColorsToDOM(DARK_DEFAULTS)
  }
}
