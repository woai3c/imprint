import { Moon, Sun } from 'lucide-react'

import { useTranslation } from 'react-i18next'

import type { DesignToken } from '../../core/analyzer/types'

interface TokenPreviewProps {
  tokens: DesignToken
  darkTokens?: Record<string, string> | null
  hasDarkMode?: boolean
}

export function TokenPreview({ tokens, darkTokens, hasDarkMode }: TokenPreviewProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-8 p-6">
      <ColorSection
        colors={tokens.colors}
        darkColors={darkTokens}
        hasDarkMode={hasDarkMode}
        usageCount={tokens.usageCount}
        t={t}
      />
      <TypographySection typography={tokens.typography} usageCount={tokens.usageCount} t={t} />
      <SpacingShapeSection spacing={tokens.spacing} radii={tokens.radii} t={t} />
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
      <h3 className="text-base font-semibold text-foreground mb-5">{title}</h3>
      {children}
    </div>
  )
}

function getColorUsage(name: string, usageCount?: Record<string, number>): { rank: number; count: number } | undefined {
  if (!usageCount) return undefined
  const colorEntries = Object.entries(usageCount)
    .filter(([k]) => k.startsWith('color:') || k.startsWith('backgroundColor:') || k.startsWith('textColor:'))
    .sort((a, b) => b[1] - a[1])

  for (let i = 0; i < colorEntries.length; i++) {
    const key = colorEntries[i][0]
    if (key.includes(name)) {
      return { rank: i + 1, count: colorEntries[i][1] }
    }
  }
  return undefined
}

function ColorSection({
  colors,
  darkColors,
  hasDarkMode,
  usageCount,
  t,
}: {
  colors: Record<string, string>
  darkColors?: Record<string, string> | null
  hasDarkMode?: boolean
  usageCount?: Record<string, number>
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const grouped = groupColors(colors)

  return (
    <SectionCard title={t('preview.colors')}>
      {hasDarkMode && (
        <h4 className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sun size={13} aria-hidden="true" />
          {t('preview.lightTheme')}
        </h4>
      )}

      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} className="mb-6 last:mb-0">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t(`preview.colorGroups.${group}`)}
          </p>
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
            {items.map(([name, value]) => {
              const usage = getColorUsage(value, usageCount)
              return <ColorCard key={name} name={name} value={value} usage={usage} t={t} />
            })}
          </div>
        </div>
      ))}

      {hasDarkMode && darkColors && Object.keys(darkColors).length > 0 && (
        <>
          <div className="border-t border-border my-6" />
          <h4 className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Moon size={13} aria-hidden="true" />
            {t('preview.darkTheme')}
          </h4>
          {Object.entries(groupColors(darkColors)).map(([group, items]) => (
            <div key={group} className="mb-6 last:mb-0">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t(`preview.colorGroups.${group}`)}
              </p>
              <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
                {items.map(([name, value]) => (
                  <ColorCard key={name} name={name} value={value} dark t={t} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </SectionCard>
  )
}

function ColorCard({
  name,
  value,
  dark,
  usage,
  t,
}: {
  name: string
  value: string
  dark?: boolean
  usage?: { rank: number; count: number }
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {})
  }

  return (
    <div className="group/swatch flex flex-col gap-1.5">
      <div
        className="w-full aspect-square rounded-lg border border-border/60 transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/swatch:scale-105 group-hover/swatch:shadow-[0_6px_20px_-4px_rgba(0,0,0,0.15)]"
        style={{ backgroundColor: value, ...(dark ? { outline: '1px solid rgba(255,255,255,0.08)' } : {}) }}
      />
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="min-w-0 truncate text-xs font-semibold text-foreground leading-tight" title={name}>
          {name}
        </span>
        <span className="shrink-0 py-px px-1 text-[10px] font-semibold uppercase tracking-wider rounded text-muted-foreground bg-secondary">
          {getGroupLabel(name)}
        </span>
      </div>
      {usage && (
        <span className="text-[10px] text-muted-foreground leading-tight truncate">
          {t('preview.frequencyRank', { rank: usage.rank })} ({t('preview.occurrences', { count: usage.count })})
        </span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={t('preview.copyValue', { value })}
        className="self-start text-left text-[10px] font-mono text-muted-foreground cursor-pointer transition-colors duration-150 hover:text-foreground"
      >
        {value}
      </button>
    </div>
  )
}

function TypographySection({
  typography,
  usageCount,
  t,
}: {
  typography: DesignToken['typography']
  usageCount?: Record<string, number>
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const fontSizeRanks = typography.fontSizes.map((size) => {
    if (!usageCount) return undefined
    const entries = Object.entries(usageCount)
      .filter(([k]) => k.startsWith('fontSize:'))
      .sort((a, b) => b[1] - a[1])
    for (let i = 0; i < entries.length; i++) {
      if (entries[i][0] === `fontSize:${size}`) return { rank: i + 1, count: entries[i][1] }
    }
    return undefined
  })

  const combinations = typography.fontSizes.map((size, i) => ({
    size,
    weight: typography.fontWeights[Math.min(i, typography.fontWeights.length - 1)] || '400',
    lineHeight: typography.lineHeights[Math.min(i, typography.lineHeights.length - 1)] || '1.5',
    letterSpacing: typography.letterSpacings?.[Math.min(i, (typography.letterSpacings?.length || 1) - 1)] || '0',
    family: typography.fontFamilies[0] || 'system-ui',
    familyShort: (typography.fontFamilies[0] || 'system-ui').split(',')[0].replace(/['"]/g, '').trim(),
    rank: fontSizeRanks[i],
  }))

  return (
    <SectionCard title={t('preview.typography')}>
      {typography.fontStacks && typography.fontStacks.length > 0 && (
        <div className="mb-5 pb-5 border-b border-border/60">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{t('preview.fontStacks')}</p>
          <div className="space-y-1.5">
            {typography.fontStacks.map((stack, i) => (
              <code key={i} className="block rounded-md bg-muted/40 px-3 py-1.5 font-mono text-xs text-foreground/80">
                {stack}
              </code>
            ))}
          </div>
        </div>
      )}
      <div className="divide-y divide-border/60">
        {combinations.map((combo, i) => (
          <div key={i} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
            <div className="w-24 shrink-0 text-xs text-muted-foreground">
              {combo.rank
                ? t('preview.frequencyRank', { rank: combo.rank })
                : t('preview.styleIndex', { index: i + 1 })}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="truncate text-foreground"
                style={{
                  fontFamily: combo.family,
                  fontSize: combo.size,
                  fontWeight: combo.weight,
                  lineHeight: combo.lineHeight,
                }}
              >
                {t('preview.typeSampleShort')}
              </p>
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground space-y-0.5">
              <p className="font-medium text-foreground/70">{combo.familyShort}</p>
              <p className="font-mono">
                {combo.size}
                <span className="mx-1 text-muted-foreground/30">·</span>
                {combo.weight}
                <span className="mx-1 text-muted-foreground/30">·</span>
                {combo.lineHeight}
                {combo.letterSpacing !== '0' && (
                  <>
                    <span className="mx-1 text-muted-foreground/30">·</span>
                    {combo.letterSpacing}
                  </>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function SpacingShapeSection({
  spacing,
  radii,
  t,
}: {
  spacing: string[]
  radii: string[]
  t: (key: string) => string
}) {
  const sorted = [...spacing]
    .map((v, i) => ({ value: v, px: parseFloat(v), index: i }))
    .filter((s) => !isNaN(s.px))
    .sort((a, b) => a.px - b.px)
  const maxValue = sorted.length > 0 ? sorted[sorted.length - 1].px : 1

  return (
    <SectionCard title={t('preview.spacingAndShape')}>
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('preview.spacing')}</p>
      <div className="space-y-1">
        {sorted.map((s) => {
          const percent = (s.px / maxValue) * 100
          return (
            <div key={s.index} className="flex items-center gap-3 h-7">
              <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
                space-{s.index + 1}
              </span>
              <div className="flex-1 flex items-center">
                <div className="h-2 rounded-full bg-foreground/25" style={{ width: `${Math.max(percent, 2)}%` }} />
              </div>
              <span className="w-14 text-right font-mono text-xs text-muted-foreground">{s.value}</span>
            </div>
          )
        })}
      </div>

      {radii.length > 0 && (
        <>
          <div className="border-t border-border/60 my-6" />
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('preview.radius')}
          </p>
          <div className="flex flex-wrap gap-5">
            {radii.map((value, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 border-2 border-foreground/20 bg-muted/20" style={{ borderRadius: value }} />
                <div className="text-center">
                  <span className="block text-xs font-medium text-foreground/70">radius-{i + 1}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">{value}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  )
}

function ShadowSection({ shadows, t }: { shadows: string[]; t: (key: string) => string }) {
  const names = ['sm', 'md', 'lg', 'xl', '2xl']

  return (
    <SectionCard title={t('preview.shadows')}>
      <div className="flex flex-wrap gap-6">
        {shadows.map((value, i) => (
          <div key={i} className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-xl bg-background" style={{ boxShadow: value }} />
            <div className="text-center">
              <span className="block text-xs font-medium text-foreground/70">shadow-{names[i] || i + 1}</span>
              <span className="block font-mono text-[10px] text-muted-foreground max-w-28 truncate" title={value}>
                {value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function LetterSpacingSection({ spacings, t }: { spacings: string[]; t: (key: string) => string }) {
  return (
    <SectionCard title={t('preview.letterSpacing')}>
      <div className="space-y-3">
        {spacings.map((value, i) => (
          <div key={i} className="flex items-center gap-4">
            <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">{value}</span>
            <p className="text-sm truncate text-foreground/80" style={{ letterSpacing: value }}>
              {t('preview.typeSampleLong')}
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
      <div className="flex flex-wrap gap-4">
        {transitions.map((value, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="min-w-16 h-12 px-3 rounded-lg bg-secondary/50 border border-border flex items-center justify-center">
              <span className="max-w-28 truncate font-mono text-xs text-foreground/80">{value}</span>
            </div>
            <span className="text-xs text-muted-foreground">{names[i] || `t-${i + 1}`}</span>
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
      group = 'surface'
    } else if (name.includes('foreground') || name.includes('text') || name.includes('muted')) {
      group = 'text'
    } else if (name.includes('primary') || name.includes('secondary') || name.includes('accent')) {
      group = 'brand'
    } else if (name.includes('border') || name.includes('ring')) {
      group = 'border'
    } else {
      group = 'palette'
    }

    if (!groups[group]) groups[group] = []
    groups[group].push([name, value])
  }

  return groups
}

function getGroupLabel(name: string): string {
  if (name.includes('background') || name.includes('surface') || name === 'card') return 'SURFACE'
  if (name.includes('foreground') || name.includes('text') || name.includes('muted')) return 'TEXT'
  if (name.includes('primary') || name.includes('secondary') || name.includes('accent')) return 'BRAND'
  if (name.includes('border') || name.includes('ring')) return 'BORDER'
  return 'COLOR'
}
