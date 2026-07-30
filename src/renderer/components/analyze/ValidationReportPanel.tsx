import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from 'lucide-react'

import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import type { DesignToken } from '../../../core/analyzer/types'
import type { ValidationNode, ValidationReport } from '../../../core/design-intelligence/types'

interface ValidationReportPanelProps {
  report: ValidationReport
  tokens: DesignToken
}

function RecipeNode({ node }: { node: ValidationNode }) {
  const { t } = useTranslation()
  if (node.type === 'stack') {
    return (
      <div className="flex flex-col" style={{ gap: node.gap }}>
        {node.children.map((child, index) => (
          <RecipeNode key={index} node={child} />
        ))}
      </div>
    )
  }
  if (node.type === 'grid') {
    return (
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, Math.min(node.columns, 4))}, minmax(0, 1fr))`,
          gap: node.gap,
        }}
      >
        {node.children.map((child, index) => (
          <RecipeNode key={index} node={child} />
        ))}
      </div>
    )
  }
  if (node.type === 'surface') {
    return (
      <div
        className="border"
        style={{
          borderColor: 'var(--dna-border)',
          borderRadius: 'var(--dna-radius)',
          backgroundColor: 'var(--dna-background)',
          color: 'var(--dna-foreground)',
          boxShadow: 'var(--dna-shadow)',
          padding: 'var(--dna-space-lg)',
        }}
      >
        <div className="flex flex-wrap items-center" style={{ gap: 'var(--dna-space-sm)' }}>
          {node.children.map((child, index) => (
            <RecipeNode key={index} node={child} />
          ))}
        </div>
      </div>
    )
  }
  if (node.type === 'text') {
    const classes =
      node.role === 'display'
        ? 'font-semibold'
        : node.role === 'heading'
          ? 'font-semibold'
          : node.role === 'label'
            ? 'font-medium'
            : ''
    return (
      <p
        className={classes}
        style={{
          color: node.role === 'body' ? 'var(--dna-muted-foreground)' : 'var(--dna-foreground)',
          fontFamily: 'var(--dna-font-family)',
          fontSize:
            node.role === 'display'
              ? 'var(--dna-size-display)'
              : node.role === 'heading'
                ? 'var(--dna-size-heading)'
                : node.role === 'label'
                  ? 'var(--dna-size-label)'
                  : 'var(--dna-size-body)',
        }}
      >
        {t(`analyze.designDna.previewContent.${node.contentKey}`)}
      </p>
    )
  }
  if (node.type === 'button') {
    return (
      <button
        type="button"
        className="font-medium outline-none focus-visible:ring-2"
        style={
          {
            borderRadius: 'var(--dna-radius)',
            backgroundColor: node.variant === 'primary' ? 'var(--dna-primary)' : 'var(--dna-secondary)',
            color: node.variant === 'primary' ? 'var(--dna-primary-foreground)' : 'var(--dna-secondary-foreground)',
            fontFamily: 'var(--dna-font-family)',
            fontSize: 'var(--dna-size-label)',
            paddingBlock: 'var(--dna-space-sm)',
            paddingInline: 'var(--dna-space-md)',
            '--tw-ring-color': 'var(--dna-ring)',
          } as CSSProperties
        }
      >
        {t(`analyze.designDna.previewContent.${node.labelKey}`)}
      </button>
    )
  }
  return (
    <label className="block min-w-32 flex-1">
      <span
        className="block font-medium"
        style={{
          color: 'var(--dna-foreground)',
          fontFamily: 'var(--dna-font-family)',
          fontSize: 'var(--dna-size-label)',
          marginBottom: 'var(--dna-space-sm)',
        }}
      >
        {t('analyze.designDna.previewContent.field')}
      </span>
      <input
        readOnly
        aria-invalid={node.state === 'error'}
        value={node.state === 'error' ? t('analyze.designDna.previewContent.error') : ''}
        className={`w-full border outline-none ${node.state === 'focus' ? 'ring-2' : ''}`}
        style={
          {
            borderColor: node.state === 'error' ? 'var(--dna-primary)' : 'var(--dna-border)',
            borderRadius: 'var(--dna-radius)',
            backgroundColor: 'var(--dna-background)',
            color: 'var(--dna-foreground)',
            fontFamily: 'var(--dna-font-family)',
            fontSize: 'var(--dna-size-label)',
            paddingBlock: 'var(--dna-space-sm)',
            paddingInline: 'var(--dna-space-sm)',
            '--tw-ring-color': 'var(--dna-ring)',
          } as CSSProperties
        }
      />
    </label>
  )
}

export function ValidationReportPanel({ report, tokens }: ValidationReportPanelProps) {
  const { t } = useTranslation()
  const icons = {
    passed: CheckCircle2,
    partial: AlertTriangle,
    failed: XCircle,
    unknown: CircleHelp,
  }

  const colorValues = Object.values(tokens.colors)
  const background = tokens.colors.background || tokens.colors.surface || colorValues[0] || 'transparent'
  const foreground = tokens.colors.foreground || tokens.colors['muted-foreground'] || colorValues[1] || 'currentColor'
  const primary = tokens.colors.primary || tokens.colors.accent || foreground
  const secondary = tokens.colors.secondary || tokens.colors.surface || background
  const border = tokens.colors.border || tokens.colors['muted-foreground'] || foreground
  const spaces = tokens.spacing.length > 0 ? tokens.spacing : ['0']
  const fontSizes = tokens.typography.fontSizes.length > 0 ? tokens.typography.fontSizes : ['inherit']
  const tokenStyles = Object.fromEntries([
    ...Object.entries(tokens.colors).map(([name, value]) => [`--color-${name}`, value]),
    ['--dna-background', background],
    ['--dna-foreground', foreground],
    ['--dna-muted-foreground', tokens.colors['muted-foreground'] || foreground],
    ['--dna-primary', primary],
    ['--dna-primary-foreground', background],
    ['--dna-secondary', secondary],
    ['--dna-secondary-foreground', foreground],
    ['--dna-border', border],
    ['--dna-ring', primary],
    ['--dna-radius', tokens.radii[0] || '0'],
    ['--dna-shadow', tokens.shadows[0] || 'none'],
    ['--dna-space-sm', spaces[Math.min(1, spaces.length - 1)]],
    ['--dna-space-md', spaces[Math.min(2, spaces.length - 1)]],
    ['--dna-space-lg', spaces[Math.min(3, spaces.length - 1)]],
    ['--dna-font-family', tokens.typography.fontStacks[0] || tokens.typography.fontFamilies[0] || 'inherit'],
    ['--dna-size-label', fontSizes[0]],
    ['--dna-size-body', fontSizes[Math.min(1, fontSizes.length - 1)]],
    ['--dna-size-heading', fontSizes[Math.max(0, fontSizes.length - 2)]],
    ['--dna-size-display', fontSizes[fontSizes.length - 1]],
  ])

  return (
    <div data-testid="design-validation-report" className="space-y-4" style={tokenStyles as CSSProperties}>
      <div className="rounded-xl border border-border/60 bg-secondary/25 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('analyze.designDna.safePreview')}
        </p>
        <div className="mt-3">
          <RecipeNode node={report.recipe.root} />
        </div>
      </div>
      <div className="space-y-2">
        {report.checks.map((check) => {
          const Icon = icons[check.status]
          return (
            <article key={check.id} className="rounded-lg border border-border/60 bg-background p-3">
              <div className="flex items-start gap-2">
                <Icon
                  size={15}
                  className={
                    check.status === 'passed'
                      ? 'mt-0.5 text-success'
                      : check.status === 'failed'
                        ? 'mt-0.5 text-destructive'
                        : 'mt-0.5 text-warning'
                  }
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold">
                    {t(`analyze.designDna.checks.${check.id}.rule`, { defaultValue: check.rule })}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t(`analyze.designDna.checks.${check.id}.${check.status}`, {
                      defaultValue: check.deterministicResult,
                    })}
                  </p>
                  {check.previewRef && (
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {t('analyze.designDna.previewRegion', { region: check.previewRef })}
                    </p>
                  )}
                  {check.failureLayer && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {t('analyze.designDna.failureLayer', {
                        layer: t(`analyze.designDna.layers.${check.failureLayer}`),
                      })}
                    </p>
                  )}
                  {check.suggestion && (
                    <p className="mt-1 text-xs text-foreground">
                      {t(`analyze.designDna.checks.${check.id}.suggestion`, {
                        defaultValue: check.suggestion,
                      })}
                    </p>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
