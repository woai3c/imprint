import { useTranslation } from 'react-i18next'

interface TokenData {
  colors: Record<string, string>
  typography: {
    fontFamilies: string[]
    fontStacks?: string[]
    fontSizes: string[]
    fontWeights: string[]
    lineHeights: string[]
    letterSpacings?: string[]
  }
  spacing: string[]
  radii: string[]
  shadows: string[]
  borders: string[]
  zIndices?: string[]
  transitions?: string[]
}

interface TokenPreviewProps {
  tokens: TokenData
  darkTokens?: Record<string, string> | null
  hasDarkMode?: boolean
}

export function TokenPreview({ tokens, darkTokens, hasDarkMode }: TokenPreviewProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-8 p-6">
      <ColorSection colors={tokens.colors} darkColors={darkTokens} hasDarkMode={hasDarkMode} t={t} />
      <TypographySection typography={tokens.typography} t={t} />
      <SpacingSection spacing={tokens.spacing} t={t} />
      <RadiusSection radii={tokens.radii} t={t} />
      {tokens.shadows.length > 0 && <ShadowSection shadows={tokens.shadows} t={t} />}
      {tokens.typography.letterSpacings && tokens.typography.letterSpacings.length > 0 && (
        <LetterSpacingSection spacings={tokens.typography.letterSpacings} t={t} />
      )}
      {tokens.transitions && tokens.transitions.length > 0 && (
        <TransitionSection transitions={tokens.transitions} t={t} />
      )}
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-5">{title}</h3>
      {children}
    </div>
  )
}

function ColorSection({
  colors,
  darkColors,
  hasDarkMode,
  t,
}: {
  colors: Record<string, string>
  darkColors?: Record<string, string> | null
  hasDarkMode?: boolean
  t: (key: string) => string
}) {
  const grouped = groupColors(colors)

  return (
    <SectionCard title={t('preview.colors')}>
      {hasDarkMode && <h4 className="text-sm font-medium text-muted-foreground mb-3">● {t('preview.lightTheme')}</h4>}

      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} className="mb-5 last:mb-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">{group}</p>
          <div className="flex flex-wrap gap-3">
            {items.map(([name, value]) => (
              <ColorSwatch key={name} name={name} value={value} />
            ))}
          </div>
        </div>
      ))}

      {hasDarkMode && darkColors && Object.keys(darkColors).length > 0 && (
        <>
          <div className="border-t border-border my-5" />
          <h4 className="text-sm font-medium text-muted-foreground mb-3">● {t('preview.darkTheme')}</h4>
          {Object.entries(groupColors(darkColors)).map(([group, items]) => (
            <div key={group} className="mb-5 last:mb-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">{group}</p>
              <div className="flex flex-wrap gap-3">
                {items.map(([name, value]) => (
                  <ColorSwatch key={name} name={name} value={value} dark />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </SectionCard>
  )
}

function ColorSwatch({ name, value, dark }: { name: string; value: string; dark?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 w-18">
      <div
        className="w-full h-10 rounded-md border border-black/5 dark:border-white/10"
        style={{ backgroundColor: value, ...(dark ? { outline: '1px solid rgba(255,255,255,0.08)' } : {}) }}
      />
      <span className="text-[10px] text-muted-foreground text-center leading-tight truncate w-full" title={name}>
        {name}
      </span>
      <span className="text-[9px] text-muted-foreground/60 font-mono truncate w-full text-center" title={value}>
        {value}
      </span>
    </div>
  )
}

function TypographySection({ typography, t }: { typography: TokenData['typography']; t: (key: string) => string }) {
  const combinations = typography.fontSizes.map((size, i) => ({
    size,
    weight: typography.fontWeights[Math.min(i, typography.fontWeights.length - 1)] || '400',
    lineHeight: typography.lineHeights[Math.min(i, typography.lineHeights.length - 1)] || '1.5',
    family: typography.fontFamilies[0] || 'system-ui',
  }))

  return (
    <SectionCard title={t('preview.typography')}>
      {typography.fontStacks && typography.fontStacks.length > 0 && (
        <div className="mb-5 pb-4 border-b border-border/50">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
            {t('preview.fontStacks')}
          </p>
          <div className="space-y-1">
            {typography.fontStacks.map((stack, i) => (
              <code
                key={i}
                className="block text-[11px] text-foreground/70 font-mono bg-muted/40 px-2.5 py-1 rounded-md"
              >
                {stack}
              </code>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-0 divide-y divide-border/40">
        {combinations.map((combo, i) => (
          <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
            <div className="flex-1 min-w-0 mr-4">
              <p
                className="truncate text-foreground/85"
                style={{
                  fontFamily: combo.family,
                  fontSize: combo.size,
                  fontWeight: combo.weight,
                  lineHeight: combo.lineHeight,
                }}
              >
                The quick brown fox jumps
              </p>
            </div>
            <div className="text-right text-[11px] text-muted-foreground/70 shrink-0 font-mono">
              <span>{combo.size}</span>
              <span className="mx-1 text-muted-foreground/30">·</span>
              <span>{combo.weight}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function SpacingSection({ spacing, t }: { spacing: string[]; t: (key: string) => string }) {
  const maxValue = Math.max(...spacing.map((s) => parseFloat(s)).filter((v) => !isNaN(v)), 1)

  return (
    <SectionCard title={t('preview.spacing')}>
      <div className="space-y-1.5">
        {spacing.map((value, i) => {
          const px = parseFloat(value)
          const percent = isNaN(px) ? 0 : (px / maxValue) * 100
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground/70 w-14 shrink-0 font-mono">space-{i + 1}</span>
              <div className="flex-1 h-4 bg-muted/30 rounded-sm overflow-hidden">
                <div className="h-full bg-foreground/15 rounded-sm" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground/70 w-10 text-right font-mono">{value}</span>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

function RadiusSection({ radii, t }: { radii: string[]; t: (key: string) => string }) {
  const names = ['sm', 'md', 'lg', 'xl', '2xl', 'pill']

  return (
    <SectionCard title={t('preview.radius')}>
      <div className="flex flex-wrap gap-4">
        {radii.map((value, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 border border-foreground/15 bg-muted/30" style={{ borderRadius: value }} />
            <span className="text-[10px] text-muted-foreground font-mono">{value}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function ShadowSection({ shadows, t }: { shadows: string[]; t: (key: string) => string }) {
  const names = ['sm', 'md', 'lg', 'xl']

  return (
    <SectionCard title={t('preview.shadows')}>
      <div className="flex flex-wrap gap-5">
        {shadows.map((value, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-lg bg-background" style={{ boxShadow: value }} />
            <span className="text-[10px] text-muted-foreground font-mono">shadow-{names[i] || i + 1}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function groupColors(colors: Record<string, string>): Record<string, [string, string][]> {
  const groups: Record<string, [string, string][]> = {}

  for (const [name, value] of Object.entries(colors)) {
    let group: string
    if (name.includes('background') || name.includes('surface') || name === 'card') {
      group = 'SURFACE'
    } else if (name.includes('foreground') || name.includes('text') || name.includes('muted')) {
      group = 'TEXT'
    } else if (name.includes('primary') || name.includes('secondary') || name.includes('accent')) {
      group = 'BRAND'
    } else if (name.includes('border') || name.includes('ring')) {
      group = 'BORDER'
    } else {
      group = 'PALETTE'
    }

    if (!groups[group]) groups[group] = []
    groups[group].push([name, value])
  }

  return groups
}

function LetterSpacingSection({ spacings, t }: { spacings: string[]; t: (key: string) => string }) {
  return (
    <SectionCard title={t('preview.letterSpacing')}>
      <div className="space-y-2">
        {spacings.map((value, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground/70 w-14 shrink-0 font-mono">{value}</span>
            <p className="text-sm truncate text-foreground/75" style={{ letterSpacing: value }}>
              The quick brown fox jumps over the lazy dog
            </p>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function TransitionSection({ transitions, t }: { transitions: string[]; t: (key: string) => string }) {
  const names = ['fast', 'normal', 'slow', 'slower', 'slowest']
  return (
    <SectionCard title={t('preview.transitions')}>
      <div className="flex flex-wrap gap-3">
        {transitions.map((value, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="min-w-14 h-10 px-2 rounded-md bg-secondary/60 border border-border flex items-center justify-center">
              <span className="text-[10px] font-mono text-foreground/70 truncate max-w-20">{value}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{names[i] || `t-${i + 1}`}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
