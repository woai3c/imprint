import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { useTranslation } from 'react-i18next'

import { useFeedbackStore } from '../stores/feedback-store'

export function AppFeedback() {
  const { t } = useTranslation()
  const { message, tone, dismiss } = useFeedbackStore()

  if (!message) return null

  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? XCircle : Info

  return (
    <div
      className={`app-feedback app-no-drag fixed right-4 top-12 z-50 flex max-w-sm items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm shadow-lg ${
        tone === 'error'
          ? 'border-destructive/30 bg-card text-destructive'
          : 'border-border bg-card text-card-foreground'
      }`}
    >
      <Icon size={16} className={tone === 'success' ? 'text-emerald-600' : undefined} />
      <span
        className="min-w-0 flex-1"
        role={tone === 'error' ? 'alert' : 'status'}
        aria-live={tone === 'error' ? 'assertive' : 'polite'}
      >
        {message}
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="-mr-1 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label={t('feedback.dismiss')}
      >
        <X size={14} />
      </button>
    </div>
  )
}
