import { useTranslation } from 'react-i18next'

/**
 * Fixed theme-calibration strip rendered above every validation scenario.
 * Every control binds directly to a semantic theme role (primary, ring, input,
 * border, success/warning/destructive) so the same components can be compared
 * across built-in and extracted themes without any arbitrary fallback colors.
 */
export function ThemeCalibrationStrip() {
  const { t } = useTranslation()

  const statusBadges = [
    { key: 'default', className: 'bg-secondary text-secondary-foreground', role: 'secondary' },
    { key: 'success', className: 'bg-success/15 text-success', role: 'success' },
    { key: 'warning', className: 'bg-warning/20 text-warning-strong', role: 'warning' },
    { key: 'error', className: 'bg-destructive/10 text-destructive', role: 'destructive' },
  ] as const

  return (
    <div
      data-testid="theme-calibration-strip"
      className="sticky top-0 z-10 border-b border-border bg-card/95 px-5 py-3 backdrop-blur"
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('templates.calibration.label')}
        </p>
        <p className="text-[10px] text-muted-foreground">{t('templates.calibration.note')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          data-theme-role="primary"
          className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm"
        >
          {t('templates.calibration.primaryAction')}
        </button>
        <button
          type="button"
          data-theme-role="secondary"
          className="h-8 rounded-md border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground"
        >
          {t('templates.calibration.secondaryAction')}
        </button>
        <a
          href="#"
          data-theme-role="link"
          onClick={(event) => event.preventDefault()}
          className="text-xs font-medium text-primary underline underline-offset-2"
        >
          {t('templates.calibration.link')}
        </a>
        <input
          data-theme-role="input-ring"
          placeholder={t('templates.calibration.inputPlaceholder')}
          className="h-8 w-44 rounded-md border border-input bg-background px-2.5 text-xs outline-none transition-shadow focus:ring-2 focus:ring-ring"
        />
        <label data-theme-role="checkbox" className="flex items-center gap-1.5 text-xs text-foreground">
          <input type="checkbox" defaultChecked className="size-3.5 accent-primary" />
          {t('templates.calibration.checkbox')}
        </label>
        <label data-theme-role="radio" className="flex items-center gap-1.5 text-xs text-foreground">
          <input type="radio" name="calibration-radio" defaultChecked className="size-3.5 accent-primary" />
          {t('templates.calibration.radio')}
        </label>
        <div className="flex items-center gap-1.5">
          {statusBadges.map((badge) => (
            <span
              key={badge.key}
              data-theme-role={badge.role}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
            >
              {t(`templates.calibration.status.${badge.key}`)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
