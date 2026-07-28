import { AlertTriangle, ShieldCheck } from 'lucide-react'

import { useTranslation } from 'react-i18next'

interface AuthChoiceDialogProps {
  kind: 'choice'
  onCancel: () => void
  onContinueAnonymous: () => void
  onLogin: () => void
}

interface LoginBrowserDialogProps {
  kind: 'login'
  retry: boolean
  onCancel: () => void
  onContinue: () => void
  onContinueAnonymous: () => void
}

type AuthRequiredDialogProps = AuthChoiceDialogProps | LoginBrowserDialogProps

export function AuthRequiredDialog(props: AuthRequiredDialogProps) {
  const { t } = useTranslation()
  const choosingAccess = props.kind === 'choice'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]">
      <div
        data-testid="auth-required-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        aria-describedby="auth-dialog-description"
        className="ui-enter w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-warning/12 p-2 text-warning-strong">
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="auth-dialog-title" className="text-base font-semibold">
              {choosingAccess
                ? t('analyze.auth.requiredTitle')
                : props.retry
                  ? t('analyze.auth.loginIncompleteTitle')
                  : t('analyze.auth.loginWindowTitle')}
            </h2>
            <p id="auth-dialog-description" className="mt-2 text-sm leading-6 text-muted-foreground">
              {choosingAccess
                ? t('analyze.auth.requiredDescription')
                : props.retry
                  ? t('analyze.auth.loginIncompleteDescription')
                  : t('analyze.auth.loginWindowDescription')}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-xs leading-5 text-muted-foreground">{t('analyze.auth.privacy')}</p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={props.onCancel}
            className="min-h-10 rounded-lg px-4 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {t('analyze.auth.cancel')}
          </button>
          {choosingAccess ? (
            <>
              <button
                type="button"
                data-testid="auth-continue-anonymous"
                onClick={props.onContinueAnonymous}
                className="min-h-10 rounded-lg bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
              >
                {t('analyze.auth.continueAnonymous')}
              </button>
              <button
                type="button"
                data-testid="auth-login"
                onClick={props.onLogin}
                className="min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t('analyze.auth.loginAndContinue')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                data-testid="auth-login-anonymous"
                onClick={props.onContinueAnonymous}
                className="min-h-10 rounded-lg bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
              >
                {t('analyze.auth.continueAnonymous')}
              </button>
              <button
                type="button"
                data-testid="auth-login-complete"
                onClick={props.onContinue}
                className="min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t('analyze.auth.loginComplete')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
