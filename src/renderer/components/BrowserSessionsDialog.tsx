import { Loader2, ShieldCheck, Trash2, X } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface BrowserSession {
  id: string
  origin: string
  hostname: string
  createdAt: string
  updatedAt: string
}

interface BrowserSessionsDialogProps {
  onClose: () => void
}

export function BrowserSessionsDialog({ onClose }: BrowserSessionsDialogProps) {
  const { i18n, t } = useTranslation()
  const [sessions, setSessions] = useState<BrowserSession[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    window.electronAPI
      .listBrowserSessions()
      .then((items: BrowserSession[]) => setSessions(items))
      .catch(() => setError(true))
      .finally(() => setLoading(false))

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const formatDate = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }

  const handleDelete = async (id: string) => {
    setBusyId(id)
    setError(false)
    try {
      const result = (await window.electronAPI.deleteBrowserSession(id)) as {
        success: boolean
      }
      if (!result.success) throw new Error('Unable to delete browser session')
      setSessions((items) => items.filter((item) => item.id !== id))
      setPendingDeleteId(null)
    } catch {
      setError(true)
    } finally {
      setBusyId(null)
    }
  }

  const handleClearAll = async () => {
    setBusyId('all')
    setError(false)
    try {
      const result = (await window.electronAPI.clearBrowserSessions()) as {
        success: boolean
      }
      if (!result.success) throw new Error('Unable to clear browser sessions')
      setSessions([])
      setConfirmClearAll(false)
    } catch {
      setError(true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]">
      <div
        data-testid="browser-sessions-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="browser-sessions-title"
        className="ui-enter flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <header className="flex items-start gap-3 border-b border-border px-6 py-5">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <ShieldCheck size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="browser-sessions-title" className="text-base font-semibold">
              {t('analyze.sessions.title')}
            </h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{t('analyze.sessions.description')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('analyze.sessions.close')}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={17} />
          </button>
        </header>

        <div data-testid="browser-sessions-purpose" className="border-b border-border bg-muted/40 px-6 py-3">
          <p className="text-xs leading-5 text-muted-foreground">{t('analyze.sessions.notice')}</p>
        </div>

        <div className="min-h-48 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              {t('analyze.sessions.loading')}
            </div>
          ) : sessions.length === 0 ? (
            <div
              data-testid="browser-sessions-empty"
              className="flex min-h-40 flex-col items-center justify-center px-6 text-center"
            >
              <p className="text-sm font-medium">{t('analyze.sessions.emptyTitle')}</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                {t('analyze.sessions.emptyDescription')}
              </p>
            </div>
          ) : (
            <div data-testid="browser-sessions-list" className="space-y-2">
              {sessions.map((session) => {
                const confirming = pendingDeleteId === session.id
                return (
                  <article
                    key={session.id}
                    data-testid="browser-session"
                    className={`rounded-xl border p-4 transition-colors ${
                      confirming ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-background/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{session.hostname}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground/80">
                          {t('analyze.sessions.lastUsed', { date: formatDate(session.updatedAt) })}
                        </p>
                      </div>

                      {confirming ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(null)}
                            disabled={busyId === session.id}
                            className="min-h-9 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-secondary"
                          >
                            {t('analyze.sessions.keep')}
                          </button>
                          <button
                            type="button"
                            data-testid="browser-session-confirm-delete"
                            onClick={() => handleDelete(session.id)}
                            disabled={busyId === session.id}
                            className="flex min-h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {busyId === session.id && <Loader2 size={12} className="animate-spin" />}
                            {t('analyze.sessions.confirmDelete')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          data-testid="browser-session-delete"
                          onClick={() => {
                            setPendingDeleteId(session.id)
                            setConfirmClearAll(false)
                          }}
                          aria-label={t('analyze.sessions.deleteSite', { site: session.hostname })}
                          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {t('analyze.sessions.error')}
            </p>
          )}
        </div>

        {!loading && sessions.length > 0 && (
          <footer className="flex min-h-16 items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">{t('analyze.sessions.count', { count: sessions.length })}</p>
            {confirmClearAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('analyze.sessions.clearAllQuestion')}</span>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  disabled={busyId === 'all'}
                  className="min-h-9 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-secondary"
                >
                  {t('analyze.sessions.keep')}
                </button>
                <button
                  type="button"
                  data-testid="browser-sessions-confirm-clear"
                  onClick={handleClearAll}
                  disabled={busyId === 'all'}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busyId === 'all' && <Loader2 size={12} className="animate-spin" />}
                  {t('analyze.sessions.confirmClearAll')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="browser-sessions-clear"
                onClick={() => {
                  setConfirmClearAll(true)
                  setPendingDeleteId(null)
                }}
                className="flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 size={14} />
                {t('analyze.sessions.clearAll')}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}
