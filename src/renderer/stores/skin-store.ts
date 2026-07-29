import { create } from 'zustand'

import dunhuangMuralBgUrl from '../assets/dunhuang-mural-bg.jpg'
import inkLandscapeBgUrl from '../assets/ink-landscape-bg.jpg'

export type { ThemeExportFormat } from '../../shared/ipc-contract'

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

export interface AppTheme {
  id: string
  name: string
  description: string
  category: ThemeCategory
  colors: ThemeColors
  tokens: ThemeFoundationTokens
  identity: ThemeIdentity
  backgroundImage?: string
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
  warning: 'oklch(75% 0.16 85)',
  'warning-strong': 'oklch(47% 0.11 75)',
  'warning-foreground': 'oklch(24% 0.06 80)',
  success: 'oklch(62% 0.14 160)',
}

const DARK_DEFAULTS: ThemeColors = {
  background: 'oklch(15% 0.01 250)',
  foreground: 'oklch(93% 0.01 250)',
  primary: 'oklch(68% 0.2 250)',
  'primary-foreground': 'oklch(100% 0 0)',
  secondary: 'oklch(22% 0.015 250)',
  'secondary-foreground': 'oklch(88% 0.01 250)',
  muted: 'oklch(22% 0.015 250)',
  'muted-foreground': 'oklch(72% 0.01 250)',
  accent: 'oklch(25% 0.02 250)',
  'accent-foreground': 'oklch(88% 0.01 250)',
  card: 'oklch(18% 0.012 250)',
  'card-foreground': 'oklch(93% 0.01 250)',
  border: 'oklch(30% 0.015 250)',
  ring: 'oklch(68% 0.2 250)',
  sidebar: 'oklch(13% 0.01 250)',
  'sidebar-foreground': 'oklch(88% 0.01 250)',
  'sidebar-accent': 'oklch(24% 0.025 250)',
  warning: 'oklch(82% 0.15 85)',
  'warning-strong': 'oklch(87% 0.13 88)',
  'warning-foreground': 'oklch(24% 0.06 80)',
  success: 'oklch(78% 0.14 165)',
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
    backgroundImage: 'ink-landscape-bg.jpg',
    colors: {
      background: 'oklch(95.5% 0.014 88)',
      foreground: 'oklch(23% 0.012 65)',
      primary: 'oklch(29% 0.018 145)',
      'primary-foreground': 'oklch(96% 0.01 88)',
      secondary: 'oklch(90.5% 0.018 88)',
      'secondary-foreground': 'oklch(28% 0.014 65)',
      muted: 'oklch(92% 0.014 88)',
      'muted-foreground': 'oklch(48% 0.018 70)',
      accent: 'oklch(88% 0.022 135)',
      'accent-foreground': 'oklch(26% 0.02 140)',
      card: 'oklch(97% 0.01 88)',
      'card-foreground': 'oklch(23% 0.012 65)',
      border: 'oklch(79% 0.023 82)',
      ring: 'oklch(48% 0.14 29)',
      sidebar: 'oklch(92.5% 0.017 88)',
      'sidebar-foreground': 'oklch(29% 0.014 65)',
      'sidebar-accent': 'oklch(86% 0.022 88)',
      warning: 'oklch(66% 0.14 75)',
      'warning-strong': 'oklch(40% 0.09 65)',
      'warning-foreground': 'oklch(96% 0.01 88)',
      success: 'oklch(52% 0.09 160)',
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
      accent: 'oklch(24% 0.035 215)',
      'accent-foreground': 'oklch(86% 0.02 210)',
      card: 'oklch(15% 0.022 247)',
      'card-foreground': 'oklch(90% 0.018 210)',
      border: 'oklch(27% 0.035 230)',
      ring: 'oklch(78% 0.14 85)',
      sidebar: 'oklch(13.5% 0.021 248)',
      'sidebar-foreground': 'oklch(84% 0.022 210)',
      'sidebar-accent': 'oklch(22% 0.045 215)',
      warning: 'oklch(78% 0.14 85)',
      'warning-strong': 'oklch(85% 0.12 88)',
      'warning-foreground': 'oklch(14% 0.025 250)',
      success: 'oklch(75% 0.13 175)',
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
      evidence: ['外壳、卡片和控件使用不同明度', '光效仅服务焦点与关键操作', '青色表达操作与选择，琥珀只标记焦点'],
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
      accent: 'oklch(90.5% 0.02 228)',
      'accent-foreground': 'oklch(30% 0.028 230)',
      card: 'oklch(99% 0.006 96)',
      'card-foreground': 'oklch(26% 0.025 235)',
      border: 'oklch(85.5% 0.024 94)',
      ring: 'oklch(48% 0.072 230)',
      sidebar: 'oklch(93.5% 0.021 104)',
      'sidebar-foreground': 'oklch(32% 0.032 225)',
      'sidebar-accent': 'oklch(88.5% 0.024 230)',
      warning: 'oklch(68% 0.11 72)',
      'warning-strong': 'oklch(42% 0.08 65)',
      'warning-foreground': 'oklch(98% 0.005 90)',
      success: 'oklch(56% 0.09 150)',
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
      evidence: ['低饱和背景划分工作区域', '主要内容保持高不透明度', '暖色只停留在背景氛围层'],
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
      accent: 'oklch(90% 0.04 284)',
      'accent-foreground': 'oklch(25% 0.04 280)',
      card: 'oklch(98% 0.012 260)',
      'card-foreground': 'oklch(20% 0.035 270)',
      border: 'oklch(86% 0.032 260)',
      ring: 'oklch(52% 0.23 292)',
      sidebar: 'oklch(94% 0.025 258)',
      'sidebar-foreground': 'oklch(26% 0.04 270)',
      'sidebar-accent': 'oklch(89% 0.055 273)',
      warning: 'oklch(72% 0.15 80)',
      'warning-strong': 'oklch(45% 0.11 72)',
      'warning-foreground': 'oklch(20% 0.05 75)',
      success: 'oklch(65% 0.14 170)',
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
    backgroundImage: 'dunhuang-mural-bg.jpg',
    colors: {
      background: 'oklch(91.5% 0.046 76)',
      foreground: 'oklch(28% 0.04 58)',
      primary: 'oklch(48% 0.13 49)',
      'primary-foreground': 'oklch(96% 0.018 79)',
      secondary: 'oklch(84.5% 0.06 76)',
      'secondary-foreground': 'oklch(31% 0.045 58)',
      muted: 'oklch(87% 0.042 77)',
      'muted-foreground': 'oklch(48% 0.05 62)',
      accent: 'oklch(78% 0.064 60)',
      'accent-foreground': 'oklch(30% 0.045 58)',
      card: 'oklch(94.5% 0.03 78)',
      'card-foreground': 'oklch(28% 0.04 58)',
      border: 'oklch(69% 0.065 68)',
      ring: 'oklch(47% 0.095 235)',
      sidebar: 'oklch(85.5% 0.055 76)',
      'sidebar-foreground': 'oklch(31% 0.045 58)',
      'sidebar-accent': 'oklch(78% 0.074 66)',
      warning: 'oklch(62% 0.12 65)',
      'warning-strong': 'oklch(38% 0.08 58)',
      'warning-foreground': 'oklch(96% 0.018 79)',
      success: 'oklch(50% 0.08 155)',
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
      accent: 'oklch(23% 0.05 228)',
      'accent-foreground': 'oklch(88% 0.03 215)',
      card: 'oklch(17% 0.04 244)',
      'card-foreground': 'oklch(91% 0.035 210)',
      border: 'oklch(32% 0.072 230)',
      ring: 'oklch(82% 0.16 82)',
      sidebar: 'oklch(11.5% 0.03 247)',
      'sidebar-foreground': 'oklch(83% 0.045 214)',
      'sidebar-accent': 'oklch(22% 0.065 230)',
      warning: 'oklch(80% 0.15 85)',
      'warning-strong': 'oklch(86% 0.13 88)',
      'warning-foreground': 'oklch(15% 0.035 246)',
      success: 'oklch(78% 0.13 175)',
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
      evidence: ['网格只出现在工作底板', '等宽字体用于数值与结构标记', '青色承担操作与选择，制图黄只标记焦点环'],
    },
  },
]

interface SkinStore {
  currentThemeId: string
  extractedThemeId: string | null
  colorMode: ColorMode
  setTheme: (id: string) => void
  setColorMode: (mode: ColorMode) => void
  applyCustomCss: (cssVars: string, extractedId?: string) => void
}

export const useSkinStore = create<SkinStore>((set, get) => ({
  currentThemeId: 'default',
  extractedThemeId: null,
  colorMode: (localStorage.getItem('colorMode') as ColorMode) || 'light',

  setTheme: (id) => {
    const theme = builtinThemes.find((t) => t.id === id)
    if (theme) {
      set({ currentThemeId: id, extractedThemeId: null })
      applyThemeInstantly(() => applyThemeToDOM(theme))
    }
  },

  setColorMode: (mode) => {
    set({ colorMode: mode })
    localStorage.setItem('colorMode', mode)
    const { currentThemeId } = get()

    applyThemeInstantly(() => {
      if (currentThemeId === 'default') {
        applyColorsToDOM(mode === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS)
      }

      document.documentElement.classList.toggle('dark', mode === 'dark')
    })
  },

  applyCustomCss: (cssVars, extractedId) => {
    set({ currentThemeId: 'custom', extractedThemeId: extractedId ?? null })
    applyThemeInstantly(() => {
      resetThemeAppearance('custom')
      applyCssVarsToDOM(cssVars)
    })
  },
}))

// Theme application swaps dozens of variables at once. Suppress transitions for
// one frame so the change snaps instead of animating every element through a
// repaint storm under filtered backdrops and blurred surfaces.
function applyThemeInstantly(apply: () => void) {
  const root = document.documentElement
  root.classList.add('theme-switching')
  apply()
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove('theme-switching')
    })
  })
}

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

  if (theme.backgroundImage) {
    variables['--bg-image'] = `url('./${theme.backgroundImage}')`
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

  if (theme.backgroundImage) {
    variables['--bg-image'] = `url('./${theme.backgroundImage}')`
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
  const { typography, spacing, layout, shape, elevation, motion } = theme.tokens
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
  ]

  // Design intent
  lines.push(`## ${zh ? '设计意图' : 'Design intent'}`, '')
  lines.push(`**${zh ? '价值' : 'Values'}:** ${theme.identity.values.join(' · ')}`, '')
  theme.identity.patterns.forEach((pattern, index) => {
    lines.push(`### ${pattern}`, '', theme.identity.evidence[index], '')
  })

  // Design principles — universal composition rules grounded in this theme's token values
  const densityLabel = zh
    ? { compact: '紧凑', comfortable: '舒适', spacious: '宽松' }[spacing.density]
    : spacing.density
  lines.push(`## ${zh ? '设计原则' : 'Design principles'}`, '')
  lines.push(
    zh
      ? '使用这些令牌进行排版组合的规则，由主题数值推导。'
      : 'Composition rules for these tokens, derived from the theme values.',
    '',
  )
  lines.push(`### ${zh ? '亲密性' : 'Proximity'}`, '')
  lines.push(
    zh
      ? `- 相关元素间距不超过 \`calc(${spacing.unit} * 2)\`，分组之间使用 \`calc(${spacing.unit} * 6)\` 以上的间隔`
      : `- Keep related items within \`calc(${spacing.unit} * 2)\`; separate groups with \`calc(${spacing.unit} * 6)\` or more`,
  )
  lines.push(
    zh
      ? `- 用间距刻度分组，而不是堆砌分割线（当前密度：${densityLabel}）`
      : `- Group with the spacing scale instead of stacking dividers (density: ${densityLabel})`,
    '',
  )
  lines.push(`### ${zh ? '对齐' : 'Alignment'}`, '')
  lines.push(
    zh
      ? `- 尺寸与间距只取 ${spacing.unit} 的整数倍，不产生刻度外的任意值`
      : `- Size and space in multiples of ${spacing.unit}; never use off-scale values`,
  )
  lines.push(
    zh
      ? `- 重复模块共享统一的起始边与栏宽（侧栏 ${layout.sidebarWidth}）`
      : `- Repeated blocks share one inline start and column width (sidebar ${layout.sidebarWidth})`,
    '',
  )
  lines.push(`### ${zh ? '重复' : 'Repetition'}`, '')
  lines.push(
    zh
      ? '- 只复用语义令牌的既有档位（颜色、字号、圆角、阴影），不发明近似值'
      : '- Reuse existing semantic token steps (colors, font sizes, radii, shadows); never invent near-duplicates',
  )
  lines.push(
    zh
      ? `- 圆角一律从 \`--radius-md\`（${shape.radiusBase}）派生 sm/lg/xl`
      : `- Derive all radii from \`--radius-md\` (${shape.radiusBase}) — sm/lg/xl`,
    '',
  )
  lines.push(`### ${zh ? '对比' : 'Contrast'}`, '')
  lines.push(
    zh
      ? '- 正文用 `--color-foreground`，次要信息用 `--color-muted-foreground`；层级来自对比，而非堆砌字号'
      : '- Body text uses `--color-foreground`, secondary text `--color-muted-foreground`; hierarchy comes from contrast, not font-size stacking',
  )
  lines.push(
    zh
      ? '- 每屏主操作只有一个（`--color-primary`）；hover、选中、焦点状态与主色保持同一色相家族，签名对比色只用于焦点环与选中指示'
      : '- One primary action per view (`--color-primary`); hover, selected, and focus states stay in the primary hue family — the signature contrast color appears only in the focus ring and selection indicators',
    '',
  )

  // Colors
  lines.push(`## ${zh ? '颜色' : 'Colors'}`, '')
  lines.push(`| ${zh ? '令牌' : 'Token'} | ${zh ? '值' : 'Value'} | ${zh ? '用途' : 'Usage'} |`)
  lines.push('|-------|-------|-------|')
  const colorUsageMap: Record<string, string> = {
    background: zh ? '页面背景' : 'Page background',
    foreground: zh ? '正文文字' : 'Body text',
    primary: zh ? '主操作、链接' : 'Primary action, links',
    'primary-foreground': zh ? '主按钮文字' : 'Primary button text',
    secondary: zh ? '次级容器' : 'Secondary surface',
    'secondary-foreground': zh ? '次级文字' : 'Secondary text',
    muted: zh ? '禁用区域' : 'Muted surface',
    'muted-foreground': zh ? '辅助文字' : 'Muted text',
    accent: zh ? '悬浮表面、次级强调' : 'Hover surface, secondary emphasis',
    'accent-foreground': zh ? '悬浮表面文字' : 'Hover surface text',
    card: zh ? '卡片背景' : 'Card background',
    'card-foreground': zh ? '卡片文字' : 'Card text',
    border: zh ? '边框' : 'Border',
    ring: zh ? '焦点环' : 'Focus ring',
    sidebar: zh ? '侧栏背景' : 'Sidebar background',
    'sidebar-foreground': zh ? '侧栏文字' : 'Sidebar text',
    'sidebar-accent': zh ? '侧栏高亮' : 'Sidebar accent',
  }
  for (const [name, value] of Object.entries(theme.colors)) {
    const usage = colorUsageMap[name] || '-'
    lines.push(`| \`--color-${name}\` | \`${value}\` | ${usage} |`)
  }

  // Typography
  lines.push('', `## ${zh ? '排版' : 'Typography'}`, '')
  lines.push(`**${zh ? '字体族' : 'Font families'}:**`, '')
  lines.push(`- ${zh ? '正文' : 'Body'}: \`${typography.fontBody}\``)
  lines.push(`- ${zh ? '标题' : 'Heading'}: \`${typography.fontHeading}\``)
  lines.push(`- ${zh ? '等宽' : 'Monospace'}: \`${typography.fontMono}\``)
  lines.push('')
  lines.push(`**${zh ? '字号' : 'Font sizes'}:**`, '')
  lines.push(`| ${zh ? '级别' : 'Level'} | ${zh ? '值' : 'Value'} | ${zh ? '变量' : 'Variable'} |`)
  lines.push('|-------|-------|-------|')
  for (const [name, value] of Object.entries(typography.sizes)) {
    lines.push(`| ${name} | \`${value}\` | \`--text-${name}\` |`)
  }
  lines.push('')
  lines.push(`**${zh ? '行高' : 'Line heights'}:**`, '')
  lines.push(`- ${zh ? '正文' : 'Body'}: \`${typography.lineHeight.body}\``)
  lines.push(`- ${zh ? '标题' : 'Heading'}: \`${typography.lineHeight.heading}\``)
  lines.push('')
  lines.push(`**${zh ? '字间距' : 'Letter spacing'}:**`, '')
  lines.push(`- ${zh ? '正文' : 'Body'}: \`${typography.letterSpacing.body}\``)
  lines.push(`- ${zh ? '标题' : 'Heading'}: \`${typography.letterSpacing.heading}\``)
  lines.push(`- ${zh ? '标签' : 'Label'}: \`${typography.letterSpacing.label}\``)

  // Spacing
  lines.push('', `## ${zh ? '间距' : 'Spacing'}`, '')
  lines.push(`- ${zh ? '基准单位' : 'Base unit'}: \`${spacing.unit}\``)
  lines.push(`- ${zh ? '密度' : 'Density'}: \`${spacing.density}\``)
  lines.push('')
  lines.push(zh ? '推导间距序列（基准 × 倍数）：' : 'Derived spacing scale (unit x multiplier):')
  lines.push('')
  lines.push(`| ${zh ? '倍数' : 'Multiplier'} | ${zh ? '变量' : 'Variable'} |`)
  lines.push('|-------|-------|')
  const spacingMultipliers = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]
  for (const m of spacingMultipliers) {
    lines.push(`| ${m}x | \`calc(${spacing.unit} * ${m})\` |`)
  }

  // Border Radius
  lines.push('', `## ${zh ? '圆角' : 'Border radius'}`, '')
  lines.push(`| ${zh ? '级别' : 'Level'} | ${zh ? '值' : 'Value'} | ${zh ? '变量' : 'Variable'} |`)
  lines.push('|-------|-------|-------|')
  lines.push(`| sm | \`max(0px, calc(${shape.radiusBase} - 0.25rem))\` | \`--radius-sm\` |`)
  lines.push(`| md | \`${shape.radiusBase}\` | \`--radius-md\` |`)
  lines.push(`| lg | \`calc(${shape.radiusBase} + 0.25rem)\` | \`--radius-lg\` |`)
  lines.push(`| xl | \`calc(${shape.radiusBase} + 0.5rem)\` | \`--radius-xl\` |`)

  // Shadows / Elevation
  lines.push('', `## ${zh ? '阴影' : 'Shadows'}`, '')
  lines.push(`| ${zh ? '级别' : 'Level'} | ${zh ? '值' : 'Value'} |`)
  lines.push('|-------|-------|')
  lines.push(`| sm | \`${elevation.sm}\` |`)
  lines.push(`| md | \`${elevation.md}\` |`)
  lines.push(`| lg | \`${elevation.lg}\` |`)
  lines.push(`| focus | \`${elevation.focus}\` |`)

  // Borders
  lines.push('', `## ${zh ? '边框与描边' : 'Borders & strokes'}`, '')
  lines.push(`- ${zh ? '边框宽度' : 'Border width'}: \`${shape.borderWidth}\``)
  lines.push(`- ${zh ? '图标描边宽度' : 'Icon stroke width'}: \`${shape.iconStrokeWidth}\``)

  // Motion
  lines.push('', `## ${zh ? '动效' : 'Motion'}`, '')
  lines.push(`| ${zh ? '速度' : 'Speed'} | ${zh ? '时长' : 'Duration'} | ${zh ? '变量' : 'Variable'} |`)
  lines.push('|-------|-------|-------|')
  lines.push(`| ${zh ? '快' : 'Fast'} | \`${motion.fast}\` | \`--motion-fast\` |`)
  lines.push(`| ${zh ? '标准' : 'Normal'} | \`${motion.normal}\` | \`--motion-normal\` |`)
  lines.push(`| ${zh ? '慢' : 'Slow'} | \`${motion.slow}\` | \`--motion-slow\` |`)
  lines.push('')
  lines.push(`**${zh ? '缓动曲线' : 'Easing'}:** \`${motion.easing}\``)

  // Layout
  lines.push('', `## ${zh ? '布局' : 'Layout'}`, '')
  lines.push(`- ${zh ? '侧栏宽度' : 'Sidebar width'}: \`${layout.sidebarWidth}\``)
  lines.push(`- ${zh ? '内容最大宽度' : 'Content max width'}: \`${layout.contentMaxWidth}\``)

  // Background art direction
  const bgArtDirection = getThemeBackgroundCss(theme.id)
  if (bgArtDirection) {
    lines.push('', `## ${zh ? '背景与氛围' : 'Background & atmosphere'}`, '')
    lines.push(
      zh
        ? '本主题包含背景纹理或渐变来营造氛围。以下 CSS 可用于复现相似效果：'
        : 'This theme uses background textures or gradients for atmosphere. The following CSS recreates the effect:',
    )
    lines.push('', '```css', bgArtDirection, '```')
  }

  // CSS variables
  const css = generateThemeCss(theme)
  lines.push('', `## ${zh ? 'CSS 变量' : 'CSS variables'}`, '')
  lines.push('```css', css.trimEnd(), '```')

  // Agent Guide
  lines.push('', '---', '')
  lines.push(`## ${zh ? '给 AI 的使用说明' : 'Agent prompt guide'}`, '')
  lines.push(
    zh
      ? `使用这些设计令牌生成与 **${theme.name}** 视觉风格一致的 UI。`
      : `Use these design tokens to generate UI that matches the **${theme.name}** visual style.`,
  )
  lines.push('')
  lines.push(`### ${zh ? '示例组件提示' : 'Example component prompt'}`, '')
  lines.push('```')
  lines.push(
    zh
      ? `使用 ${theme.name} 设计系统构建一个卡片组件：`
      : `Build a card component using the ${theme.name} design system:`,
  )
  lines.push(`- Background: var(--color-card)`)
  lines.push(`- Text: var(--color-card-foreground)`)
  lines.push(`- Border radius: var(--radius-md)`)
  lines.push(`- Shadow: var(--shadow-sm)`)
  lines.push(`- Padding: calc(${spacing.unit} * 6)`)
  lines.push(`- Font: var(--font-body)`)
  lines.push('```')
  lines.push('')
  lines.push(`### ${zh ? '实施规则' : 'Implementation rules'}`, '')
  lines.push(
    zh
      ? '1. 将本文档作为视觉规则的唯一真源。'
      : '1. Treat this document as the single source of truth for visual rules.',
  )
  lines.push(
    zh
      ? '2. 优先复用语义色、字体、间距、圆角、阴影和动效，不要自行发明近似值。'
      : '2. Reuse semantic colors, fonts, spacing, radii, shadows, and motion — never invent approximations.',
  )
  lines.push(
    zh
      ? '3. 保留产品的信息层级和交互位置，只替换视觉表达。'
      : '3. Preserve product hierarchy and interaction placement; only replace visual expression.',
  )
  lines.push(
    zh
      ? '4. 标题使用 `--font-heading` + `--tracking-heading` + `--leading-heading`。'
      : '4. Headings use `--font-heading` + `--tracking-heading` + `--leading-heading`.',
  )
  lines.push(
    zh
      ? '5. 正文使用 `--font-body` + `--tracking-body` + `--leading-body`。'
      : '5. Body text uses `--font-body` + `--tracking-body` + `--leading-body`.',
  )
  lines.push(
    zh ? '6. 所有动画使用 `--motion-easing` 作为缓动曲线。' : '6. All animations use `--motion-easing` for easing.',
  )
  lines.push(
    zh
      ? '7. 聚焦状态使用 `--focus-ring-shadow` 而非自定义样式。'
      : '7. Focus states use `--focus-ring-shadow` instead of custom styles.',
  )
  lines.push('')
  lines.push(`### ${zh ? '令牌使用速查' : 'Token usage reference'}`, '')
  lines.push(`| ${zh ? '场景' : 'Context'} | ${zh ? '令牌' : 'Token'} |`)
  lines.push('|---------|--------|')
  lines.push(`| ${zh ? '页面背景' : 'Page background'} | \`--color-background\` |`)
  lines.push(`| ${zh ? '卡片/容器' : 'Card/surface'} | \`--color-card\` |`)
  lines.push(`| ${zh ? '正文文字' : 'Body text'} | \`--color-foreground\` |`)
  lines.push(`| ${zh ? '辅助文字' : 'Muted text'} | \`--color-muted-foreground\` |`)
  lines.push(`| ${zh ? '主操作' : 'Primary action'} | \`--color-primary\` |`)
  lines.push(`| ${zh ? '强调/装饰' : 'Accent/decoration'} | \`--color-accent\` |`)
  lines.push(`| ${zh ? '边框' : 'Border'} | \`--color-border\` |`)
  lines.push(`| ${zh ? '焦点环' : 'Focus ring'} | \`--focus-ring-shadow\` |`)
  lines.push(`| ${zh ? '正文字体' : 'Body font'} | \`--font-body\` |`)
  lines.push(`| ${zh ? '标题字体' : 'Heading font'} | \`--font-heading\` |`)
  lines.push(`| ${zh ? '代码字体' : 'Code font'} | \`--font-mono\` |`)
  lines.push(`| ${zh ? '小间距' : 'Small gap'} | \`calc(var(--spacing) * 2)\` |`)
  lines.push(`| ${zh ? '标准间距' : 'Standard gap'} | \`calc(var(--spacing) * 4)\` |`)
  lines.push(`| ${zh ? '大间距' : 'Large gap'} | \`calc(var(--spacing) * 8)\` |`)

  // Do's and Don'ts
  lines.push('')
  lines.push(`### ${zh ? '正确做法与避免事项' : "Do's and Don'ts"}`, '')
  lines.push(zh ? '**正确做法：**' : "**Do's:**")
  lines.push('')
  lines.push(
    zh
      ? '- 使用语义色令牌（`--color-primary`），不要硬编码颜色值'
      : '- Use semantic color tokens (`--color-primary`), not hardcoded color values',
  )
  lines.push(
    zh
      ? '- 使用间距倍数（`calc(var(--spacing) * N)`）保持节奏一致'
      : '- Use spacing multipliers (`calc(var(--spacing) * N)`) for consistent rhythm',
  )
  lines.push(
    zh
      ? '- 使用 `--radius-md` 作为默认圆角，交互元素用 `--radius-sm`'
      : '- Use `--radius-md` as default radius, `--radius-sm` for interactive elements',
  )
  lines.push(
    zh
      ? '- 阴影按层级递增：卡片 sm、弹出层 md、模态框 lg'
      : '- Escalate shadows by level: cards sm, popovers md, modals lg',
  )
  lines.push('')
  lines.push(zh ? '**避免：**' : "**Don'ts:**")
  lines.push('')
  lines.push(
    zh
      ? '- 不要混用不同字体族，严格按正文/标题/代码分工'
      : "- Don't mix font families; strictly separate body/heading/code roles",
  )
  lines.push(zh ? '- 不要使用 CSS 变量以外的颜色值' : "- Don't use color values outside of the CSS variable system")
  lines.push(
    zh
      ? '- 不要自定义动画缓动曲线，统一使用 `--motion-easing`'
      : "- Don't create custom easing; use `--motion-easing` uniformly",
  )
  lines.push(
    zh
      ? '- 不要忽略密度设置，间距倍数应与当前 density 匹配'
      : "- Don't ignore density; spacing multipliers should match the current density level",
  )

  return `${lines.join('\n')}\n`
}

function getThemeBackgroundCss(themeId: string): string | null {
  const backgrounds: Record<string, string> = {
    'chinese-landscape': `.app-shell::before {
  background:
    linear-gradient(90deg, rgb(246 242 232 / 12%), rgb(246 242 232 / 46%) 28%, rgb(246 242 232 / 32%)),
    url('./ink-landscape-bg.jpg') center bottom / cover no-repeat;
  opacity: 0.58;
}

.app-shell::after {
  background:
    radial-gradient(circle at 72% 18%, rgb(255 253 246 / 76%) 0 18%, transparent 52%),
    linear-gradient(180deg, rgb(247 243 233 / 24%), rgb(247 243 233 / 46%));
}`,
    cyberpunk: `.app-shell::before {
  background:
    radial-gradient(circle at 78% 16%, rgb(214 169 70 / 6%), transparent 26%),
    radial-gradient(circle at 28% 88%, rgb(78 201 210 / 8%), transparent 30%),
    linear-gradient(rgb(78 201 210 / 4%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(78 201 210 / 4%) 1px, transparent 1px),
    linear-gradient(145deg, #091419, #081116 58%, #071015);
  background-size: auto, auto, 32px 32px, 32px 32px, auto;
}

.app-shell::after {
  background: repeating-linear-gradient(180deg, transparent 0 3px, rgb(255 255 255 / 1.5%) 3px 4px);
  opacity: 0.48;
}`,
    nordic: `.app-shell::before {
  background:
    radial-gradient(ellipse at 88% 8%, rgb(168 199 204 / 26%), transparent 34%),
    radial-gradient(ellipse at 15% 92%, rgb(180 199 163 / 21%), transparent 32%),
    linear-gradient(155deg, #f8f7f2, #eef3f1 58%, #f7f2ec);
}

.app-shell::after {
  background-image: radial-gradient(rgb(55 70 75 / 7%) 0.5px, transparent 0.5px);
  background-size: 5px 5px;
  opacity: 0.15;
}`,
    glassmorphism: `.app-shell::before {
  background:
    radial-gradient(ellipse at 20% 80%, oklch(70% 0.18 280 / 22%), transparent 38%),
    radial-gradient(ellipse at 78% 22%, oklch(72% 0.14 195 / 18%), transparent 34%),
    linear-gradient(155deg, oklch(95% 0.03 262), oklch(94% 0.025 255) 58%, oklch(95% 0.02 268));
}`,
    dunhuang: `.app-shell::before {
  background:
    linear-gradient(90deg, rgb(231 204 158 / 24%), rgb(244 222 181 / 48%) 38%, rgb(234 209 169 / 18%)),
    url('./dunhuang-mural-bg.jpg') center bottom / cover no-repeat;
  opacity: 0.78;
}

.app-shell::after {
  background:
    radial-gradient(circle at 58% 24%, rgb(255 239 207 / 65%), transparent 48%),
    linear-gradient(180deg, rgb(244 224 187 / 20%), rgb(236 211 171 / 35%));
}`,
    blueprint: `.app-shell::before {
  background-image:
    linear-gradient(rgb(99 218 255 / 9%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(99 218 255 / 9%) 1px, transparent 1px),
    linear-gradient(rgb(99 218 255 / 4%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(99 218 255 / 4%) 1px, transparent 1px),
    radial-gradient(circle at 78% 14%, rgb(55 180 255 / 13%), transparent 28%),
    linear-gradient(145deg, #071a2b, #071624 62%, #06111e);
  background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px, auto, auto;
}

.app-shell::after {
  background:
    radial-gradient(circle at center, transparent 28%, rgb(2 12 22 / 22%) 100%),
    linear-gradient(90deg, rgb(3 17 29 / 18%), transparent 34%);
}`,
  }
  return backgrounds[themeId] || null
}

// Warm the backdrop image cache at idle so the first switch to an illustrated
// theme does not stall on a synchronous JPEG fetch and decode.
export function preloadThemeBackdrops() {
  const schedule = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1500))
  schedule(() => {
    for (const url of [inkLandscapeBgUrl, dunhuangMuralBgUrl]) {
      const img = new Image()
      img.src = url
      void img.decode().catch(() => undefined)
    }
  })
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
