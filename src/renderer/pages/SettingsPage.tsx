import { Loader2 } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AppSettings } from '../../shared/ipc-contract'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { invalidateComparisonRecords } from '../lib/comparison-records-cache.js'
import { useFeedbackStore } from '../stores/feedback-store'

export function SettingsPage() {
  const { t } = useTranslation()
  const notify = useFeedbackStore((state) => state.show)
  const [proxyServer, setProxyServer] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    window.electronAPI.getSettings().then((settings) => {
      setProxyServer(settings.proxyServer || '')
      setLoaded(true)
    })
  }, [])

  const save = (patch: Partial<AppSettings>) => {
    window.electronAPI.saveSettings(patch)
  }

  const handleExportAll = async () => {
    try {
      const result = await window.electronAPI.exportLocalData()
      if (!result.success) return
      notify(t('feedback.dataExported'))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleClearAll = async () => {
    setClearing(true)
    try {
      await window.electronAPI.clearLocalData()
      invalidateComparisonRecords()
      notify(t('feedback.dataCleared'))
      setConfirmClearAll(false)
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    } finally {
      setClearing(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground" role="status">
        <Loader2 size={16} className="mr-2 animate-spin" />
        {t('settings.loading')}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-auto">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />

      <div className="px-8 pb-8 space-y-8 max-w-2xl">
        <section>
          <h3 className="text-lg font-semibold mb-4">{t('settings.network.title')}</h3>
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div>
              <label htmlFor="proxy-server" className="block text-sm font-medium">
                {t('settings.network.proxyLabel')}
              </label>
              <input
                id="proxy-server"
                data-testid="proxy-server"
                type="text"
                value={proxyServer}
                onChange={(event) => {
                  setProxyServer(event.target.value)
                  save({ proxyServer: event.target.value })
                }}
                placeholder="http://127.0.0.1:7890"
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('settings.network.proxyHint')}</p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-4">{t('settings.data.title')}</h3>
          <div className="p-4 rounded-lg border border-border space-y-3">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExportAll}
                className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm whitespace-nowrap hover:bg-accent transition-colors"
              >
                {t('settings.data.exportAll')}
              </button>
              <button
                onClick={() => setConfirmClearAll(true)}
                className="h-9 px-4 rounded-md bg-destructive text-destructive-foreground text-sm whitespace-nowrap hover:opacity-90 transition-opacity"
              >
                {t('settings.data.clearAll')}
              </button>
              <button
                onClick={() => window.electronAPI.openLogsFolder()}
                className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm whitespace-nowrap hover:bg-accent transition-colors"
              >
                {t('settings.data.openLogs')}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t('settings.data.tip')}</p>
          </div>
        </section>
      </div>

      {confirmClearAll && (
        <ConfirmDialog
          title={t('settings.data.confirmClearTitle')}
          description={t('settings.data.confirmClear')}
          confirmLabel={t('settings.data.clearAll')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleClearAll}
          onCancel={() => setConfirmClearAll(false)}
          loading={clearing}
        />
      )}
    </div>
  )
}
