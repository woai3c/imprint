import { AlertTriangle, Info, X, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { ReactNode } from 'react'

type AlertTone = 'warning' | 'error' | 'info'

interface AlertProps {
  tone: AlertTone
  title?: string
  children: ReactNode
  onDismiss?: () => void
  dismissLabel?: string
  className?: string
  testId?: string
}

const toneConfig: Record<AlertTone, { icon: LucideIcon; classes: string }> = {
  warning: {
    icon: AlertTriangle,
    classes: 'border-warning/30 bg-warning/10 text-warning-strong',
  },
  error: {
    icon: XCircle,
    classes: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  info: {
    icon: Info,
    classes: 'border-primary/20 bg-primary/5 text-foreground',
  },
}

export function Alert({ tone, title, children, onDismiss, dismissLabel, className = '', testId }: AlertProps) {
  const { icon: Icon, classes } = toneConfig[tone]

  return (
    <div
      data-testid={testId}
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${classes} ${className}`}
    >
      <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-medium">{title}</p>}
        <div className="text-xs leading-5">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="shrink-0 cursor-pointer rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
