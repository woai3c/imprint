import { create } from 'zustand'

import { coreTranslator } from '../../core/i18n/index'
import dunhuangMuralBgUrl from '../assets/dunhuang-mural-bg.jpg'
import inkLandscapeBgUrl from '../assets/ink-landscape-bg.jpg'
import enCopy from '../i18n/locales/en.json'
import { getColorModePreference, setColorModePreference } from '../lib/preferences'

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

type BuiltinThemeId = keyof typeof enCopy.themes.presets

function builtinThemeIdentity(id: BuiltinThemeId): ThemeIdentity {
  const copy = enCopy.themes.presets[id]
  return {
    values: [...copy.values] as ThemeIdentity['values'],
    patterns: [...copy.patterns] as ThemeIdentity['patterns'],
    evidence: [...copy.evidence] as ThemeIdentity['evidence'],
  }
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
    name: enCopy.themes.presets.default.name,
    description: enCopy.themes.presets.default.description,
    category: 'foundation',
    colors: LIGHT_DEFAULTS,
    tokens: createThemeTokens(),
    identity: builtinThemeIdentity('default'),
    designProfile: {
      thesis:
        'A neutral, systematic foundation that foregrounds content over decoration; every surface, color, and motion exists to serve clarity and reduce cognitive load.',
      signatureMoves: [
        {
          name: 'Semantic-first palette',
          description:
            'All colors are assigned by role (primary, secondary, muted, accent) rather than hue, enabling effortless dark/light switching and theme extensibility.',
        },
        {
          name: 'Single primary action',
          description:
            'Each view contains exactly one `--color-primary` call-to-action; secondary actions use muted surfaces to prevent attention competition.',
        },
        {
          name: 'Grid-locked spacing',
          description:
            'Spacing uses only integer multiples of `--spacing` (0.25rem); off-grid arbitrary values are forbidden to maintain vertical and horizontal rhythm.',
        },
      ],
      composition: {
        containerStrategy:
          'Flat container hierarchy — page → card → inline group; no more than two nesting levels to keep DOM shallow and scannable.',
        alignmentStrategy:
          'All blocks share one inline start edge; repeated modules use consistent column widths and the sidebar occupies a fixed 12rem.',
        densityAndWhitespace:
          'Comfortable density by default; related elements sit within 2× the base unit while group separations use 6× or more.',
        rhythm:
          'Consistent vertical rhythm maintained through a fixed spacing scale; headings use 6× unit top margin, body paragraphs use 4× unit gaps.',
      },
      visualLanguage: {
        color:
          'Neutral gray spectrum with a single primary hue for actionable elements; warning and success use isolated semantic hues that never bleed into decorative roles.',
        typography:
          'Inter for both body and headings provides a clean, modern feel; monospace Cascadia Code appears only for code blocks and technical values.',
        shape:
          'Medium radius (0.5rem) on cards and buttons creates approachable softness without playfulness; inputs use the same radius for consistency.',
        surfaces:
          'Two surface levels — background and card — with minimal elevation (sm shadow on cards); no glass or blur effects.',
        motion:
          'Fast 100ms transitions for hover/focus, 200ms for layout shifts; ease-out curve feels responsive without being abrupt.',
      },
      attention: {
        entryPoint:
          'The page title or primary heading anchors attention at top-left; the single `--color-primary` call-to-action draws the eye as the most saturated element on the page.',
        actionHierarchy:
          'Three tiers: one solid primary button per view, secondary actions use muted/ghost surfaces, and tertiary actions are plain text links. The primary button is always the only saturated element.',
        contrastStrategy:
          'Hierarchy through text color (foreground → muted-foreground) and font weight rather than font-size jumps; headings differ from body by weight and tracking, not dramatic scale changes.',
      },
      interactionLanguage: {
        feedbackStyle:
          'Immediate inline feedback — copy actions show in-place confirmation, analysis progress updates live in the same panel.',
        stateChangeAmplitude:
          'Subtle: hover raises opacity or shifts background by one token step; focus adds a 2px ring; no scale or color-hue transitions.',
      },
      transferRules: {
        preserve: [
          'Semantic color token mapping: never hardcode color values, always reference `--color-*` variables.',
          'Spacing discipline: all gaps and paddings must be integer multiples of `--spacing`.',
          'Single primary action per view: one dominant CTA, all others demoted to secondary or ghost styles.',
        ],
        adapt: [
          'Font families may be swapped for branding but must maintain the body/heading/mono trichotomy.',
          'Border radius can shift between sharp (0) and round (1rem) to match brand personality.',
          'Sidebar width is adjustable between 10rem and 14rem depending on content density.',
        ],
        avoid: [
          'Do not introduce gradients or decorative background effects — this theme is about content clarity.',
          'Do not use more than two shadow levels — the elevation system is intentionally minimal.',
          'Do not create new color roles outside the semantic token set.',
        ],
      },
    },
  },
  {
    id: 'chinese-landscape',
    name: enCopy.themes.presets['chinese-landscape'].name,
    description: enCopy.themes.presets['chinese-landscape'].description,
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
        fontBody: '"Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif',
        fontHeading: '"Noto Serif SC", "Source Han Serif SC", "STSong", "SimSun", "PingFang SC", serif',
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
    identity: builtinThemeIdentity('chinese-landscape'),
    designProfile: {
      thesis:
        'Evoke the quiet elegance of Chinese ink-wash painting through restrained materials — xuan-paper texture, five-tone ink hierarchy, and vermilion accents — while maintaining full modern usability.',
      signatureMoves: [
        {
          name: 'Vermilion focal point',
          description:
            'Cinnabar red (ring color, oklch 48% 0.14 29) appears exclusively on selection states, focus rings, and critical warnings — never as decoration — mirroring how seal-stamp vermilion punctuates a landscape scroll.',
        },
        {
          name: 'Song–Hei division of labor',
          description:
            'Headings use Noto Serif SC (宋体) for classical gravitas; body text uses Noto Sans SC (黑体) for modern readability; code stays monospace. This three-face system channels traditional Chinese print hierarchy.',
        },
        {
          name: 'Paper-texture recession',
          description:
            'The ink-landscape background image sits behind all content at reduced opacity; card surfaces approach pure xuan-paper white (oklch 97%) so text always reads above the atmospheric layer.',
        },
      ],
      composition: {
        containerStrategy:
          'Xuan-paper cards float above the atmospheric background; containers use near-opaque backgrounds (oklch 97%) to separate ink-wash texture from content.',
        alignmentStrategy:
          'Wide heading letter-spacing (0.045em) creates visual breathing room reminiscent of calligraphic space; body text uses tighter 0.01em for density.',
        densityAndWhitespace:
          'Generous whitespace echoes the "留白" (blank-leaving) philosophy — sections breathe with large vertical gaps; the theme avoids dense grids.',
        rhythm:
          'Slow, contemplative vertical rhythm with 1.65 body line-height and 1.35 heading line-height; spacing mirrors the unhurried pace of scroll painting.',
      },
      visualLanguage: {
        color:
          'Five-ink-tone palette: pure ink (foreground), dilute ink (muted-foreground), paper white (background), tea-stained warm (secondary), and vermilion accent. Saturated hues appear only in semantic roles.',
        typography:
          'Serif headings with 0.045em tracking honor traditional Chinese typesetting conventions; sans-serif body ensures on-screen legibility. Heading line-height (1.35) is more compact than body (1.65) to create visual weight.',
        shape:
          'Minimal corner radius (0.25rem) — barely rounded edges suggest the soft corners of handmade paper without becoming circular.',
        surfaces:
          'Low-opacity ink-wash shadows (rgb 54 47 36) in warm sepia tones; the shadow palette is warm brown rather than neutral gray, matching the parchment atmosphere.',
        imagery:
          'Background features a traditional ink-wash landscape painting at reduced opacity; this atmospheric layer is purely decorative and never interferes with content readability.',
        motion:
          'Ease-out easing (cubic-bezier 0.22, 1, 0.36, 1) creates calligraphic stroke-end deceleration; slow transitions (700ms) for major state changes mirror brush-painting contemplation.',
      },
      attention: {
        entryPoint:
          'The serif heading with wide tracking (0.045em) anchors the view like a calligraphic title scroll; the ink-wash background recedes so content naturally commands attention.',
        actionHierarchy:
          'Primary actions use the vermilion ring color sparingly — one focal point per view. Secondary actions blend into the ink-tone palette. The restraint of vermilion makes its appearance an unmistakable signal.',
        contrastStrategy:
          'Five-tone ink hierarchy: deep ink foreground → dilute ink muted-foreground → paper-white background. Hierarchy comes from ink-wash density, not color variety; vermilion is the sole chromatic accent.',
      },
      interactionLanguage: {
        feedbackStyle:
          'Restrained ink-dissolve transitions — hover lifts surface by one opacity step; feedback favors subtle material changes over dramatic motion.',
        stateChangeAmplitude:
          'Low amplitude: selected items gain a warm secondary background shift, never bright color floods; vermilion only appears in the focus ring and active selection markers.',
      },
      transferRules: {
        preserve: [
          'Vermilion is exclusive to focus/selection/critical states — never use it for decorative borders, illustrations, or backgrounds.',
          'Song–Hei font division: serif for headings, sans-serif for body, monospace for code — do not mix.',
          'Paper-texture recession: atmospheric background must always sit behind opaque content surfaces.',
        ],
        adapt: [
          'Ink color warmth can shift slightly (hue 60–90) to match different regional calligraphic traditions.',
          'Background painting subject can change (mountains, bamboo, plum blossom) while maintaining the same opacity treatment.',
          'Letter-spacing values can narrow for Japanese/Korean CJK contexts while preserving the body/heading contrast.',
        ],
        avoid: [
          'Do not introduce bright or neon colors — this theme is built on ink-wash restraint.',
          'Do not use heavy shadows or drop-shadow effects — elevation is communicated through subtle warm-sepia shadows.',
          'Do not apply glass/blur effects — transparency contradicts the paper-material metaphor.',
        ],
      },
    },
  },
  {
    id: 'cyberpunk',
    name: enCopy.themes.presets.cyberpunk.name,
    description: enCopy.themes.presets.cyberpunk.description,
    category: 'experimental',
    colors: {
      background: 'oklch(12% 0.018 250)',
      foreground: 'oklch(90% 0.018 210)',
      primary: 'oklch(70% 0.11 205)',
      'primary-foreground': 'oklch(12% 0.02 250)',
      secondary: 'oklch(20% 0.025 245)',
      'secondary-foreground': 'oklch(84% 0.022 210)',
      muted: 'oklch(17% 0.018 245)',
      'muted-foreground': 'oklch(72% 0.026 215)',
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
          base: '1rem',
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
    identity: builtinThemeIdentity('cyberpunk'),
    designProfile: {
      thesis:
        'A dark information cockpit where every luminance level and glow effect serves a strict signal function — cyan marks interactivity, amber marks focus, and darkness is the default state of rest.',
      signatureMoves: [
        {
          name: 'Layered dark planes',
          description:
            'Three distinct dark surfaces — shell (oklch 12%), card (oklch 15%), and control (oklch 20%) — create depth without any light-mode surface, establishing a pure dark-environment HUD aesthetic.',
        },
        {
          name: 'Localized glow',
          description:
            'Glow effects (cyan and amber tinted shadows) appear exclusively on focused elements and primary actions; ambient surfaces have no glow, making illuminated elements feel like active signal lights.',
        },
        {
          name: 'Cyan–amber signal pair',
          description:
            'Cyan (oklch 70% 0.11 205) serves all interactive states — links, buttons, selections; amber (oklch 78% 0.14 85) is reserved only for focus rings and warning states, creating an unambiguous two-signal system.',
        },
      ],
      composition: {
        containerStrategy:
          'Dense panel layout with compact spacing (0.2425rem unit); containers are distinguishable by luminance steps rather than borders or spacing gaps.',
        alignmentStrategy:
          'Monospace heading font enforces column-aligned layout; all elements snap to a grid of monospace character widths for a terminal-precision feel.',
        densityAndWhitespace:
          'Compact density with tight spacing to maximize information per viewport — mimics the density of a cockpit instrument panel.',
        rhythm:
          'Rapid vertical rhythm with a 1rem base font size; elements stack tightly with minimal breathing room to emphasize data density.',
      },
      visualLanguage: {
        color:
          'Desaturated blue-gray spectrum for neutral surfaces; cyan (hue 205–215) for interactive elements; amber (hue 85) exclusively for focus and warning. No warm colors in neutral surfaces.',
        typography:
          'Monospace headings (Cascadia Code) evoke terminal/HUD aesthetics; body text uses the system sans-serif (Segoe UI Variable) for legibility. Wide letter-spacing (0.045em headings, 0.08em labels) suggests data readouts.',
        shape:
          'Near-zero radius (0.125rem) creates sharp, technical edges — screens and panels look machined rather than friendly.',
        surfaces:
          'No glass/blur effects; surfaces are opaque dark planes differentiated only by luminance. Glow-tinted shadows (cyan 7%, amber 9%) are the sole special surface treatment.',
        motion:
          'Snappy 80ms fast transitions, 150ms normal — response times feel instant and mechanical. Ease curve (0.2, 0.8, 0.2, 1) creates a sharp acceleration-deceleration profile.',
      },
      attention: {
        entryPoint:
          'Cyan-lit elements on a dark canvas act as signal beacons — the eye is drawn to the brightest (highest lightness) cyan element first, exactly like instrument panel indicators in a dark cockpit.',
        actionHierarchy:
          'Two-signal system: cyan for all interactive actions (links, buttons, selections), amber exclusively for focus rings and warnings. No third signal color exists, enforcing a binary attention model.',
        contrastStrategy:
          'Luminance-driven hierarchy on a dark canvas: shell (12%) → card (15%) → control (20%) → interactive (cyan 70%). Hierarchy is entirely conveyed by lightness steps, never by hue variety.',
      },
      interactionLanguage: {
        feedbackStyle:
          'Signal-light feedback — interactive elements shift from dark-rest to cyan-illuminated on hover/active; feedback is binary and immediate.',
        stateChangeAmplitude:
          'High contrast amplitude within the dark spectrum: rest state is near-invisible (oklch 17\u201320%), active state jumps to cyan-tinted (oklch 24% + cyan accent), making state changes unmistakable.',
      },
      transferRules: {
        preserve: [
          'Cyan for interaction, amber for focus — these two signal colors must not be used for decoration or theming.',
          'Three-level dark-plane hierarchy (shell → card → control) — never flatten to a single dark background.',
          'Glow effects are exclusive to active/focus states — ambient surfaces must remain glow-free.',
        ],
        adapt: [
          'The specific cyan and amber hues can shift within ±15° while maintaining the two-signal-color constraint.',
          'Dark plane luminance steps can adjust (±3% oklch lightness) to accommodate different display gamma settings.',
          'Monospace heading font can be swapped for another monospace face while maintaining the terminal aesthetic.',
        ],
        avoid: [
          'Do not introduce light/white backgrounds — this theme is a fully dark environment.',
          'Do not use gradients or color transitions on surfaces — the aesthetic is flat dark planes with signal lights.',
          'Do not use warm neutral colors — the dark spectrum must stay in the cool blue-gray range (hue 240–250).',
        ],
      },
    },
  },
  {
    id: 'nordic',
    name: enCopy.themes.presets.nordic.name,
    description: enCopy.themes.presets.nordic.description,
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
    identity: builtinThemeIdentity('nordic'),
    designProfile: {
      thesis:
        'A calm, daylight-inspired workspace that uses desaturated natural tones and generous whitespace to reduce visual fatigue — warmth appears only as atmospheric color, never as competing interface elements.',
      signatureMoves: [
        {
          name: 'Soft-light zoning',
          description:
            'Low-saturation backgrounds (oklch 92–97%, hue 92–105) divide workspace areas like morning light falling across a room; zones differ by subtle warmth rather than hard borders.',
        },
        {
          name: 'Solid white card',
          description:
            'Content cards use near-white backgrounds (oklch 99%) with full opacity — no glass, no transparency — ensuring text readability is never compromised by atmospheric layers beneath.',
        },
        {
          name: 'Warm point color',
          description:
            'The primary blue (oklch 48% 0.072 230) is a muted steel blue that avoids corporate coldness; warm amber tones (hue 72) appear only in warning states, preserving the calm palette.',
        },
      ],
      composition: {
        containerStrategy:
          'Spacious container layout with generous padding; content breathes within wide margins. Cards sit as distinct surfaces above the muted background.',
        alignmentStrategy:
          'Tight negative letter-spacing on headings (-0.015em) creates a modern, confident feel; body text uses minimal negative tracking (-0.005em) for density without cramping.',
        densityAndWhitespace:
          'Spacious density setting with 0.265rem base unit — intentionally generous whitespace communicates calm and invites exploration over urgency.',
        rhythm:
          'Relaxed vertical rhythm with 1.6 body line-height and 1.2 heading line-height; the high body line-height improves readability for long-form content.',
      },
      visualLanguage: {
        color:
          'Desaturated natural palette: cool greens (secondary, hue 105), slate blues (primary/accent, hue 225–230), and warm parchment (background, hue 92). All chromatic values stay below 0.08 chroma except primary actions.',
        typography:
          'Display-weight headings (Aptos Display / Segoe UI Variable Display) create visual hierarchy through weight rather than size. Sans-serif body (Segoe UI Variable) is optimized for extended reading.',
        shape:
          'Large radius (0.875rem) creates pill-like buttons and softly rounded cards — the generous rounding reinforces the friendly, approachable character.',
        surfaces:
          'Two-level surface system: warm-tinted background (oklch 97% 0.012 92) and pure-white cards (oklch 99%). Shadows use natural blue-green tint (rgb 58 72 75) at very low opacity.',
        motion:
          'Gentle ease-out transitions (cubic-bezier 0.22, 1, 0.36, 1) with moderate durations — 140ms fast, 240ms normal, 420ms slow — nothing feels hurried.',
      },
      attention: {
        entryPoint:
          'The display-weight heading (Aptos Display) is the visual anchor — its heavier weight stands out on the warm, low-contrast background without needing large size jumps.',
        actionHierarchy:
          'The muted steel-blue primary (oklch 48%) is the only saturated element; secondary actions use the desaturated green-warm secondary surface. The low overall chroma makes even moderate saturation an attention signal.',
        contrastStrategy:
          'Weight-based hierarchy: display-weight headings vs. regular-weight body text. Color contrast is deliberately low — foreground and muted-foreground differ by ~25% lightness, creating a calm, squint-friendly reading experience.',
      },
      interactionLanguage: {
        feedbackStyle:
          'Gentle surface elevation — hover slightly deepens the background by one token step; transitions are smooth and never jarring.',
        stateChangeAmplitude:
          'Low to moderate: hover shifts background warmth; focus adds a matching steel-blue ring; active states deepen slightly without introducing new hues.',
      },
      transferRules: {
        preserve: [
          'Warm atmospheric background must remain desaturated (chroma < 0.025) — never use vivid backgrounds.',
          'Cards must be near-opaque white — do not apply transparency or backdrop-blur to reading surfaces.',
          'Primary action color must be a muted blue (not vivid or electric) to maintain the calm atmosphere.',
        ],
        adapt: [
          'Background warmth hue can shift between 80–110 to lean more golden or more green while staying natural.',
          'Heading font can be changed to any display or geometric sans-serif while maintaining the weight-based hierarchy.',
          'Border radius can reduce to 0.5rem for a more structured feel while keeping the friendly character.',
        ],
        avoid: [
          'Do not introduce high-chroma accent colors — the palette is intentionally desaturated.',
          'Do not use dark mode inversions — this theme is defined by daylight warmth and loses identity in dark environments.',
          'Do not add complex shadow stacks or inner shadows — elevation is communicated through a single subtle outer shadow.',
        ],
      },
    },
  },
  {
    id: 'glassmorphism',
    name: enCopy.themes.presets.glassmorphism.name,
    description: enCopy.themes.presets.glassmorphism.description,
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
    identity: builtinThemeIdentity('glassmorphism'),
    designProfile: {
      thesis:
        'A prismatic glass interface where a vivid aurora passes through fixed translucent chrome and laminated content cards, restoring depth and color transmission without expensive per-card live blur.',
      signatureMoves: [
        {
          name: 'Functional-layer glass',
          description:
            'High-radius backdrop blur stays on fixed navigation chrome (sidebar, toolbar), where it creates a convincing floating shell without multiplying repaint cost across scrolling content.',
        },
        {
          name: 'Laminated content glass',
          description:
            'Cards use a translucent near-white fill, a directional sheen, a bright inner edge, and a violet shadow. The already-soft aurora passes through without a live backdrop filter, preserving text contrast and responsiveness.',
        },
        {
          name: 'Color refraction',
          description:
            'A violet anchor is crossed by cyan, rose, and restrained amber caustics. Their overlap stays in the backdrop and reads through translucent surfaces like light refracting through a prism.',
        },
      ],
      composition: {
        containerStrategy:
          'Three depth planes — background aurora, translucent chrome, laminated content — create a spatial hierarchy without animated transforms.',
        alignmentStrategy:
          'Tight negative heading letter-spacing (-0.02em) creates sleek, compressed titles that contrast with the airy whitespace around them.',
        densityAndWhitespace:
          'Spacious density (0.26rem unit) with generous padding inside glass containers; the extra whitespace prevents translucent surfaces from feeling cluttered.',
        rhythm:
          'Standard vertical rhythm with balanced body/heading line heights; the aurora background adds implicit visual rhythm through its gradient progression.',
      },
      visualLanguage: {
        color:
          'Violet remains the interaction anchor: primary is oklch 57% 0.205 282 and the ring is the most saturated point at oklch 52% 0.23 292. Cyan, rose, and amber appear only as ambient aurora light; neutrals lean purple-tinted.',
        typography:
          'System sans-serif (Segoe UI Variable) for both body and headings; the display variant adds optical weight to headings. Typography stays neutral to let the color system carry the visual identity.',
        shape:
          'Large radius (1rem) creates pronounced pill shapes on buttons and cards — the generous rounding reinforces the soft, glass-bead aesthetic.',
        surfaces:
          'Three surface types: laminated translucent content, fixed blurred chrome, and the aurora background. Bright inner edges and violet-tinted shadows separate the layers without live blur on every card.',
        motion:
          'Smooth ease-out (cubic-bezier 0.2, 0, 0, 1) with 520ms slow transitions — major state changes feel fluid and languid, matching the flowing aurora aesthetic.',
      },
      attention: {
        entryPoint:
          'The vivid violet primary (oklch 57% 0.205 282) is the brightest chromatic element against the pale lavender background — it acts as a beacon on the otherwise desaturated surface.',
        actionHierarchy:
          'Primary actions use the saturated violet; secondary actions use translucent glass surfaces; tertiary actions are plain text. The saturation jump from glass (0.03 chroma) to primary (0.205 chroma) is the largest of any theme.',
        contrastStrategy:
          'Depth-based hierarchy: the aurora background is the deepest layer, translucent chrome floats above it, and laminated content sits on top with brighter edges and denser fill.',
      },
      interactionLanguage: {
        feedbackStyle:
          'Glass-refraction feedback — hover strengthens the existing violet surface tint or bright edge without changing blur radius or introducing a new hue.',
        stateChangeAmplitude:
          'Moderate: hover brightens the violet tint on translucent surfaces; focus applies the highly saturated ring (oklch 52% 0.23 292); active states shift from violet to indigo.',
      },
      transferRules: {
        preserve: [
          'Live backdrop blur is for fixed chrome only; content cards express glass through translucent fill, sheen, edge, and shadow.',
          'The prismatic aurora must remain visible through content gaps and laminated surfaces while text contrast stays stable.',
          'The three-plane depth hierarchy (background → chrome → content) must be maintained.',
        ],
        adapt: [
          'Supporting aurora caustics can shift within cyan, rose, or amber while violet remains the interaction anchor.',
          'Fixed-chrome blur can range from 16px to 30px depending on the desired translucency depth.',
          'Large border radius can reduce to 0.75rem for a slightly sharper glass-edge feel.',
        ],
        avoid: [
          'Do not add live backdrop-filter to repeated or scrolling content cards — it turns routine repaints into GPU-wide blur work.',
          'Do not flatten the depth hierarchy to a single plane — the glass effect depends on visible layering.',
          'Do not promote amber into the surface or interaction palette — it is a restrained light caustic, not a second action hue.',
        ],
      },
    },
  },
  {
    id: 'dunhuang',
    name: enCopy.themes.presets.dunhuang.name,
    description: enCopy.themes.presets.dunhuang.description,
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
        fontBody: '"Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif',
        fontHeading: '"Noto Serif SC", "Source Han Serif SC", "STSong", "SimSun", "PingFang SC", serif',
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
    identity: builtinThemeIdentity('dunhuang'),
    designProfile: {
      thesis:
        'Channel the warmth of Dunhuang mineral pigments and weathered fresco surfaces into a modern interface — ochre, azurite, and terra-cotta appear as controlled accents while aged plaster textures create atmospheric depth without compromising readability.',
      signatureMoves: [
        {
          name: 'Mineral pigment accents',
          description:
            'Ochre-red primary (oklch 48% 0.13 49) and azurite-blue ring (oklch 47% 0.095 235) mirror Dunhuang\u2019s two dominant mineral pigment families; each is strictly role-bound — ochre for actions, azurite for focus — maintaining the fresco\u2019s deliberate color placement.',
        },
        {
          name: 'Weathered plaster ground',
          description:
            'The background (oklch 91.5% 0.046 76) and secondary surfaces carry visible warm chroma (hue 76–78) suggesting aged clay plaster; this warm undertone is absent from card surfaces which approach parchment white for readability.',
        },
        {
          name: 'Modern typographic hierarchy on traditional materials',
          description:
            'Noto Serif SC headings with extra-wide tracking (0.055em) evoke stone-carved inscriptions while Noto Sans SC body text provides modern CJK readability — traditional materials meet contemporary information design.',
        },
      ],
      composition: {
        containerStrategy:
          'Warm-toned card surfaces (oklch 94.5%) sit above the weathered plaster background; the color temperature difference between card and background creates visual separation without harsh borders.',
        alignmentStrategy:
          'Wide heading letter-spacing (0.055em) references the even spacing of seal-script characters; body text uses tighter tracking (0.01em) for comfortable reading.',
        densityAndWhitespace:
          'Default density with 0.255rem base unit; whitespace is generous around headings to let the serif font breathe, echoing the contemplative space in mural compositions.',
        rhythm:
          'Contemplative rhythm matching the Chinese landscape theme — 1.65 body line-height, 1.35 heading line-height — unhurried reading pace suitable for detailed analysis.',
      },
      visualLanguage: {
        color:
          'Earth-mineral palette: terra-cotta foreground (hue 58), ochre primary (hue 49), warm sand secondary (hue 76), and contrasting azurite ring (hue 235). The entire neutral spectrum is warm-shifted — no cool grays exist in this theme.',
        typography:
          'Serif headings (Noto Serif SC) with generous tracking honor Tang Dynasty typographic traditions; sans-serif body (Noto Sans SC) ensures digital readability. The serif/sans-serif split parallels the inscription/commentary hierarchy in historical texts.',
        shape:
          'Minimal corner radius (0.25rem) — edges are nearly square, referencing the rectangular geometry of mural panel divisions and stone-carved tablets.',
        surfaces:
          'Warm shadows tinted with earth tones (rgb 82 53 30) at moderate opacity; the shadow color matches the ochre-brown family rather than neutral gray, grounding surfaces in the material metaphor.',
        imagery:
          'Background features a Dunhuang mural texture at reduced opacity; the aged fresco pattern provides visual warmth and cultural context without interfering with interface elements.',
        motion:
          'Same calligraphic ease-out as the Chinese landscape theme (cubic-bezier 0.22, 1, 0.36, 1); the 560ms slow transition mirrors the patient craftsmanship of fresco painting.',
      },
      attention: {
        entryPoint:
          'The serif heading with extra-wide tracking (0.055em) acts as a carved inscription — its calligraphic weight and spacing make it the natural focal point above the warm plaster ground.',
        actionHierarchy:
          'Ochre primary for main actions, azurite ring for focus states — a warm/cool complementary pair borrowed from Dunhuang mineral pigments. The cool azurite creates maximum contrast against the entirely warm surface palette.',
        contrastStrategy:
          'Warm-tone hierarchy: terra-cotta foreground (hue 58) → warm muted-foreground (hue 62) → sand background (hue 76). All contrast is within the warm spectrum; the sole cool element (azurite ring, hue 235) creates a focal-point exception.',
      },
      interactionLanguage: {
        feedbackStyle:
          'Material-warmth feedback — hover increases the warm chroma of surfaces by one token step, as if the mineral pigment is being illuminated by a moving light source.',
        stateChangeAmplitude:
          'Moderate: hover warms the surface color; focus applies the contrasting azurite ring (hue 235) creating a cool-on-warm accent; active states deepen toward ochre.',
      },
      transferRules: {
        preserve: [
          'Ochre for primary actions, azurite for focus — these mineral-pigment roles are the theme\u2019s color identity.',
          'All neutral surfaces must carry warm chroma (hue 58–78) — do not use cool or neutral grays.',
          'Mural texture background must never penetrate card surfaces — content readability requires opaque warm-white cards.',
        ],
        adapt: [
          'The specific mineral pigment hues can shift within Dunhuang\u2019s palette range (ochre 40\u201360, azurite 220\u2013240, malachite 150\u2013170).',
          'Background mural image can change to other Dunhuang cave paintings while maintaining the aged-fresco treatment.',
          'Heading tracking can narrow to 0.035em for denser layouts while preserving the inscription-inspired feel.',
        ],
        avoid: [
          'Do not introduce cool-toned surfaces or blue/purple neutrals — this theme is entirely warm-shifted.',
          'Do not use glass/blur effects — the material metaphor is solid mineral pigments on plaster, not transparency.',
          'Do not mix modern geometric sans-serif headings with this theme — the serif heading is essential to the cultural identity.',
        ],
      },
    },
  },
  {
    id: 'blueprint',
    name: enCopy.themes.presets.blueprint.name,
    description: enCopy.themes.presets.blueprint.description,
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
          base: '1rem',
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
    identity: builtinThemeIdentity('blueprint'),
    designProfile: {
      thesis:
        'A dark drafting-table environment where every element follows coordinate precision — monospace type, sharp edges, and a cyan-yellow signal pair create the aesthetic of architectural blueprints rendered on screen.',
      signatureMoves: [
        {
          name: 'Coordinate grid substrate',
          description:
            'The dark background (oklch 14%) serves as a drafting surface; grid patterns (when present) appear only on the workspace backdrop, never on content cards — maintaining the metaphor of drawing on graph paper.',
        },
        {
          name: 'All-monospace typography',
          description:
            'Both body text and headings use Cascadia Code — this radical choice breaks conventional heading/body font pairing to enforce a terminal/drafting aesthetic where every character occupies equal width.',
        },
        {
          name: 'Cyan-yellow drafting signals',
          description:
            'Cyan primary (oklch 76% 0.13 210) marks all interactive elements like drafting annotations; drafting yellow (oklch 82% 0.16 82) is reserved exclusively for focus rings — mimicking architectural blueprint color conventions.',
        },
      ],
      composition: {
        containerStrategy:
          'Compact dark panels stacked with minimal spacing; the workspace feels like a dense instrument dashboard where every pixel serves an informational purpose.',
        alignmentStrategy:
          'Monospace type naturally enforces column alignment; wide letter-spacing (0.07em headings, 0.08em labels) creates the character-spaced appearance of technical drawing annotations.',
        densityAndWhitespace:
          'Compact density (0.24rem unit) — the tightest spacing of all themes — maximizes data presentation area like a densely annotated technical drawing.',
        rhythm:
          'Tight vertical rhythm with 1.55 body line-height and 1.3 heading line-height; the compressed line heights fit more data rows per viewport, appropriate for a precision instrument.',
      },
      visualLanguage: {
        color:
          'Cool dark-blue spectrum (hue 242–246) for neutral surfaces; cyan (hue 210) for all interactive elements; drafting yellow (hue 82) exclusively for focus. The palette mimics Prussian blue blueprint paper with architectural annotation colors.',
        typography:
          'All-monospace typography (Cascadia Code) at 1rem base size — the theme\u2019s most distinctive choice. Wide label tracking (0.08em) creates data-readout aesthetics. Even body text feels like technical documentation.',
        shape:
          'Near-zero radius (0.125rem) — the sharpest corners across all themes — creates precisely machined edges appropriate for a precision-drafting environment.',
        surfaces:
          'Dark blue-tinted surfaces with cyan-glow shadows (rgb 91 209 255 / 7%) for interactive states; deep black shadows (rgb 0 4 12 / 26–40%) for elevated panels. No warm tones in shadows.',
        motion:
          'The fastest transitions across all themes — 80ms fast, 150ms normal, 300ms slow — with a sharp mechanical ease curve (0.2, 0.8, 0.2, 1). Everything responds with instrument-panel precision.',
      },
      attention: {
        entryPoint:
          'Monospace headings with extra-wide tracking (0.07em) read like technical annotations on a blueprint — the uniform character width and generous spacing create a data-label focal point against the dark drafting surface.',
        actionHierarchy:
          'Cyan annotations for all interactive elements, drafting-yellow callout for the focus ring. Like architectural blueprints, the "drawing" (content) is in neutral blue while "annotations" (actions) are in contrasting signal colors.',
        contrastStrategy:
          'Maximum luminance range on the dark canvas: background at 14% → content foreground at 91%. Interactive elements occupy the middle range (cyan at 76%), and the yellow focus ring reaches 82% — the brightest non-text element.',
      },
      interactionLanguage: {
        feedbackStyle:
          'Precision-instrument feedback — hover adds a subtle cyan glow border; elements respond with mechanical immediacy. Visual feedback is crisp and binary.',
        stateChangeAmplitude:
          'High contrast: dark rest states (oklch 17\u201319%) jump to cyan-tinged active states (oklch 22\u201323%); the drafting-yellow focus ring provides maximum visibility against dark backgrounds.',
      },
      transferRules: {
        preserve: [
          'All-monospace typography — do not introduce proportional fonts for headings or body; the monospace discipline is the core identity.',
          'Cyan for interaction, yellow for focus — this drafting-signal pair must not be mixed or cross-assigned.',
          'Near-zero corner radius — sharp edges are essential; rounding above 0.25rem breaks the precision aesthetic.',
        ],
        adapt: [
          'Dark background lightness can shift between oklch 10–18% to accommodate different ambient viewing conditions.',
          'Cyan and yellow hues can shift ±10° while maintaining the blueprint annotation color relationship.',
          'Spacing density can relax slightly (up to 0.26rem unit) for touchscreen contexts while preserving the compact character.',
        ],
        avoid: [
          'Do not use proportional or serif fonts — monospace is non-negotiable for this theme.',
          'Do not add rounded corners or pill shapes — the sharp-edge discipline defines the precision aesthetic.',
          'Do not introduce warm surface colors — the dark-blue base temperature is essential to the blueprint metaphor.',
        ],
      },
    },
  },
]

interface SkinStore {
  currentThemeId: string
  colorMode: ColorMode
  setTheme: (id: string) => void
  setColorMode: (mode: ColorMode) => void
}

export const useSkinStore = create<SkinStore>((set, get) => ({
  currentThemeId: 'default',
  colorMode: (getColorModePreference() as ColorMode) || 'light',

  setTheme: (id) => {
    const theme = builtinThemes.find((t) => t.id === id)
    if (theme) {
      set({ currentThemeId: id })
      applyThemeInstantly(() => {
        applyThemeToDOM(theme)
        if (id === 'default') {
          const { colorMode } = get()
          if (colorMode === 'dark') {
            applyColorsToDOM(DARK_DEFAULTS)
          }
          document.documentElement.classList.toggle('dark', colorMode === 'dark')
        }
      })
    }
  },

  setColorMode: (mode) => {
    set({ colorMode: mode })
    setColorModePreference(mode)
    const { currentThemeId } = get()

    applyThemeInstantly(() => {
      if (currentThemeId === 'default') {
        applyColorsToDOM(mode === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS)
      }

      document.documentElement.classList.toggle('dark', mode === 'dark')
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
  const t = coreTranslator(language, 'themeExport')
  const { typography, spacing, layout, shape, elevation, motion } = theme.tokens
  const category = t(`category.${theme.category}`)

  const lines: string[] = [`# ${theme.name}`, '', theme.description, '', `> ${t('category.label')}: ${category}`, '']

  // Design intent
  lines.push(`## ${t('designIntent.heading')}`, '')
  lines.push(`**${t('designIntent.values')}:** ${theme.identity.values.join(' · ')}`, '')
  theme.identity.patterns.forEach((pattern, index) => {
    lines.push(`### ${pattern}`, '', theme.identity.evidence[index], '')
  })

  // Design principles — universal composition rules grounded in this theme's token values
  const densityLabel = t(`density.${spacing.density}`)
  lines.push(`## ${t('principles.heading')}`, '', t('principles.intro'), '')
  lines.push(`### ${t('principles.proximity')}`, '')
  lines.push(t('principles.proximityScale', { unit: spacing.unit }))
  lines.push(t('principles.proximityDensity', { density: densityLabel }), '')
  lines.push(`### ${t('principles.alignment')}`, '')
  lines.push(t('principles.alignmentScale', { unit: spacing.unit }))
  lines.push(t('principles.alignmentSidebar', { sidebarWidth: layout.sidebarWidth }), '')
  lines.push(`### ${t('principles.repetition')}`, '')
  lines.push(t('principles.semanticSteps'))
  lines.push(t('principles.radiusSteps', { radius: shape.radiusBase }), '')
  lines.push(`### ${t('principles.contrast')}`, '')
  lines.push(t('principles.textContrast'))
  lines.push(t('principles.actionContrast'), '')

  // Colors
  lines.push(`## ${t('colors.heading')}`, '')
  lines.push(t('colors.tableHeader'))
  lines.push('|-------|-------|-------|')
  for (const [name, value] of Object.entries(theme.colors)) {
    const key = `colors.usage.${name}`
    const translated = t(key)
    const usage = translated === `themeExport.${key}` ? '-' : translated
    lines.push(`| \`--color-${name}\` | \`${value}\` | ${usage} |`)
  }

  // Typography
  lines.push('', `## ${t('typography.heading')}`, '')
  lines.push(`**${t('typography.fontFamilies')}:**`, '')
  lines.push(`- ${t('typography.body')}: \`${typography.fontBody}\``)
  lines.push(`- ${t('typography.title')}: \`${typography.fontHeading}\``)
  lines.push(`- ${t('typography.monospace')}: \`${typography.fontMono}\``)
  lines.push('')
  lines.push(`**${t('typography.fontSizes')}:**`, '')
  lines.push(t('typography.sizeTableHeader'))
  lines.push('|-------|-------|-------|')
  for (const [name, value] of Object.entries(typography.sizes)) {
    lines.push(`| ${name} | \`${value}\` | \`--text-${name}\` |`)
  }
  lines.push('')
  lines.push(`**${t('typography.lineHeights')}:**`, '')
  lines.push(`- ${t('typography.body')}: \`${typography.lineHeight.body}\``)
  lines.push(`- ${t('typography.title')}: \`${typography.lineHeight.heading}\``)
  lines.push('')
  lines.push(`**${t('typography.letterSpacing')}:**`, '')
  lines.push(`- ${t('typography.body')}: \`${typography.letterSpacing.body}\``)
  lines.push(`- ${t('typography.title')}: \`${typography.letterSpacing.heading}\``)
  lines.push(`- ${t('typography.label')}: \`${typography.letterSpacing.label}\``)

  // Spacing
  lines.push('', `## ${t('spacing.heading')}`, '')
  lines.push(`- ${t('spacing.baseUnit')}: \`${spacing.unit}\``)
  lines.push(`- ${t('spacing.density')}: \`${densityLabel}\``)
  lines.push('')
  lines.push(t('spacing.derived'))
  lines.push('')
  lines.push(t('spacing.tableHeader'))
  lines.push('|-------|-------|')
  const spacingMultipliers = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]
  for (const m of spacingMultipliers) {
    lines.push(`| ${m}x | \`calc(${spacing.unit} * ${m})\` |`)
  }

  // Border Radius
  lines.push('', `## ${t('radius.heading')}`, '')
  lines.push(t('radius.tableHeader'))
  lines.push('|-------|-------|-------|')
  lines.push(`| sm | \`max(0px, calc(${shape.radiusBase} - 0.25rem))\` | \`--radius-sm\` |`)
  lines.push(`| md | \`${shape.radiusBase}\` | \`--radius-md\` |`)
  lines.push(`| lg | \`calc(${shape.radiusBase} + 0.25rem)\` | \`--radius-lg\` |`)
  lines.push(`| xl | \`calc(${shape.radiusBase} + 0.5rem)\` | \`--radius-xl\` |`)

  // Shadows / Elevation
  lines.push('', `## ${t('shadows.heading')}`, '')
  lines.push(t('shadows.tableHeader'))
  lines.push('|-------|-------|')
  lines.push(`| sm | \`${elevation.sm}\` |`)
  lines.push(`| md | \`${elevation.md}\` |`)
  lines.push(`| lg | \`${elevation.lg}\` |`)
  lines.push(`| focus | \`${elevation.focus}\` |`)

  // Borders
  lines.push('', `## ${t('borders.heading')}`, '')
  lines.push(`- ${t('borders.width')}: \`${shape.borderWidth}\``)
  lines.push(`- ${t('borders.iconWidth')}: \`${shape.iconStrokeWidth}\``)

  // Motion
  lines.push('', `## ${t('motion.heading')}`, '')
  lines.push(t('motion.tableHeader'))
  lines.push('|-------|-------|-------|')
  lines.push(`| ${t('motion.fast')} | \`${motion.fast}\` | \`--motion-fast\` |`)
  lines.push(`| ${t('motion.normal')} | \`${motion.normal}\` | \`--motion-normal\` |`)
  lines.push(`| ${t('motion.slow')} | \`${motion.slow}\` | \`--motion-slow\` |`)
  lines.push('')
  lines.push(`**${t('motion.easing')}:** \`${motion.easing}\``)

  // Layout
  lines.push('', `## ${t('layout.heading')}`, '')
  lines.push(`- ${t('layout.sidebarWidth')}: \`${layout.sidebarWidth}\``)
  lines.push(`- ${t('layout.contentMaxWidth')}: \`${layout.contentMaxWidth}\``)

  // Background art direction
  const bgArtDirection = getThemeBackgroundCss(theme.id)
  if (bgArtDirection) {
    lines.push('', `## ${t('background.heading')}`, '')
    lines.push(t('background.intro'))
    lines.push('', '```css', bgArtDirection, '```')
  }

  // CSS variables
  const css = generateThemeCss(theme)
  lines.push('', `## ${t('cssVariables')}`, '')
  lines.push('```css', css.trimEnd(), '```')

  // Design language profile (for built-in themes with hardcoded profiles)
  if (theme.designProfile) {
    lines.push('', '---', '')
    lines.push(`## ${t('profile.heading')}`, '')
    lines.push(t('profile.notice'))
    lines.push('')

    const dp = theme.designProfile
    lines.push(`### ${t('profile.thesis')}`, '', dp.thesis, '')

    lines.push(`### ${t('profile.signatureMoves')}`, '')
    for (const move of dp.signatureMoves) {
      lines.push(`**${move.name}**`, '', move.description, '')
    }

    lines.push(`### ${t('profile.composition')}`, '')
    lines.push(`- **${t('profile.containerStrategy')}:** ${dp.composition.containerStrategy}`)
    lines.push(`- **${t('profile.alignmentStrategy')}:** ${dp.composition.alignmentStrategy}`)
    lines.push(`- **${t('profile.densityAndWhitespace')}:** ${dp.composition.densityAndWhitespace}`)
    lines.push(`- **${t('profile.rhythm')}:** ${dp.composition.rhythm}`)
    lines.push('')

    lines.push(`### ${t('profile.visualLanguage')}`, '')
    lines.push(`- **${t('profile.color')}:** ${dp.visualLanguage.color}`)
    lines.push(`- **${t('profile.typography')}:** ${dp.visualLanguage.typography}`)
    lines.push(`- **${t('profile.shape')}:** ${dp.visualLanguage.shape}`)
    lines.push(`- **${t('profile.surfaces')}:** ${dp.visualLanguage.surfaces}`)
    if (dp.visualLanguage.imagery) {
      lines.push(`- **${t('profile.imagery')}:** ${dp.visualLanguage.imagery}`)
    }
    if (dp.visualLanguage.motion) {
      lines.push(`- **${t('profile.motion')}:** ${dp.visualLanguage.motion}`)
    }
    lines.push('')

    lines.push(`### ${t('profile.attention')}`, '')
    lines.push(`- **${t('profile.entryPoint')}:** ${dp.attention.entryPoint}`)
    lines.push(`- **${t('profile.actionHierarchy')}:** ${dp.attention.actionHierarchy}`)
    lines.push(`- **${t('profile.contrastStrategy')}:** ${dp.attention.contrastStrategy}`)
    lines.push('')

    lines.push(`### ${t('profile.interaction')}`, '')
    lines.push(`- **${t('profile.feedbackStyle')}:** ${dp.interactionLanguage.feedbackStyle}`)
    lines.push(`- **${t('profile.stateChangeAmplitude')}:** ${dp.interactionLanguage.stateChangeAmplitude}`)
    lines.push('')

    lines.push(`### ${t('profile.transferRules')}`, '')
    lines.push(`**${t('profile.preserve')}:**`, '')
    for (const rule of dp.transferRules.preserve) {
      lines.push(`- ${rule}`)
    }
    lines.push('')
    lines.push(`**${t('profile.adapt')}:**`, '')
    for (const rule of dp.transferRules.adapt) {
      lines.push(`- ${rule}`)
    }
    lines.push('')
    lines.push(`**${t('profile.avoid')}:**`, '')
    for (const rule of dp.transferRules.avoid) {
      lines.push(`- ${rule}`)
    }
    lines.push('')
  }

  // Agent Guide
  lines.push('', '---', '')
  lines.push(`## ${t('agent.heading')}`, '')
  lines.push(t('agent.intro', { theme: theme.name }))
  lines.push('')
  lines.push(`### ${t('agent.exampleHeading')}`, '')
  lines.push('```')
  lines.push(t('agent.examplePrompt', { theme: theme.name }))
  lines.push(`- Background: var(--color-card)`)
  lines.push(`- Text: var(--color-card-foreground)`)
  lines.push(`- Border radius: var(--radius-md)`)
  lines.push(`- Shadow: var(--shadow-sm)`)
  lines.push(`- Padding: calc(${spacing.unit} * 6)`)
  lines.push(`- Font: var(--font-body)`)
  lines.push('```')
  lines.push('')
  lines.push(`### ${t('agent.implementationHeading')}`, '')
  for (const rule of ['source', 'reuse', 'hierarchy', 'heading', 'body', 'motion', 'focus']) {
    lines.push(t(`agent.rules.${rule}`))
  }
  lines.push('')
  lines.push(`### ${t('agent.tokenReference')}`, '')
  lines.push(t('agent.tokenTableHeader'))
  lines.push('|---------|--------|')
  const tokenRows: Array<[string, string]> = [
    ['pageBackground', '--color-background'],
    ['surface', '--color-card'],
    ['bodyText', '--color-foreground'],
    ['mutedText', '--color-muted-foreground'],
    ['primaryAction', '--color-primary'],
    ['accent', '--color-accent'],
    ['border', '--color-border'],
    ['focusRing', '--focus-ring-shadow'],
    ['bodyFont', '--font-body'],
    ['headingFont', '--font-heading'],
    ['codeFont', '--font-mono'],
    ['smallGap', 'calc(var(--spacing) * 2)'],
    ['standardGap', 'calc(var(--spacing) * 4)'],
    ['largeGap', 'calc(var(--spacing) * 8)'],
  ]
  for (const [context, token] of tokenRows) lines.push(`| ${t(`agent.contexts.${context}`)} | \`${token}\` |`)

  // Do's and Don'ts
  lines.push('')
  lines.push(`### ${t('agent.dosAndDonts')}`, '')
  lines.push(`**${t('agent.dos')}**`)
  lines.push('')
  for (const rule of ['colors', 'spacing', 'radius', 'shadows']) lines.push(t(`agent.doRules.${rule}`))
  lines.push('')
  lines.push(`**${t('agent.donts')}**`)
  lines.push('')
  for (const rule of ['fonts', 'colors', 'motion', 'density']) lines.push(t(`agent.dontRules.${rule}`))

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
    radial-gradient(circle at 16% 16%, rgb(116 95 255 / 44%), transparent 26%),
    radial-gradient(circle at 82% 18%, rgb(54 218 224 / 42%), transparent 25%),
    radial-gradient(circle at 68% 82%, rgb(255 116 190 / 30%), transparent 27%),
    radial-gradient(circle at 20% 82%, rgb(255 196 100 / 25%), transparent 24%),
    linear-gradient(135deg, #eef0ff, #e9fbfa 54%, #f6eafa);
}

.app-shell::after {
  background:
    linear-gradient(135deg, rgb(255 255 255 / 13%), transparent 44%),
    radial-gradient(circle at 50% 40%, rgb(255 255 255 / 30%), transparent 52%);
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
  const mode = (getColorModePreference() as ColorMode) || 'light'
  useSkinStore.setState({ colorMode: mode })
  document.documentElement.dataset.appTheme = 'default'
  applyThemeTokensToDOM(DEFAULT_THEME_TOKENS)
  document.documentElement.classList.toggle('dark', mode === 'dark')
  if (mode === 'dark') {
    applyColorsToDOM(DARK_DEFAULTS)
  }
}
