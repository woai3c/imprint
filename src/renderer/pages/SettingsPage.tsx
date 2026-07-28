import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useFeedbackStore } from '../stores/feedback-store'

interface AgentCliInfo {
  name: string
  command: string
  version: string | null
  available: boolean
}

interface Settings {
  aiMode: 'apiKey' | 'agentCli'
  provider: string
  apiKey: string
  baseUrl?: string
  agentCli: string
}

export function SettingsPage() {
  const { t } = useTranslation()
  const notify = useFeedbackStore((state) => state.show)
  const [aiMode, setAiMode] = useState<'apiKey' | 'agentCli'>('apiKey')
  const [provider, setProvider] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [agentClis, setAgentClis] = useState<AgentCliInfo[]>([])
  const [selectedCli, setSelectedCli] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearing, setClearing] = useState(false)

  const providers = [
    { id: 'deepseek', name: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY' },
    { id: 'anthropic', name: 'Anthropic (Claude)', envVar: 'ANTHROPIC_API_KEY' },
    { id: 'openai', name: 'OpenAI (GPT)', envVar: 'OPENAI_API_KEY' },
    { id: 'google', name: 'Google (Gemini)', envVar: 'GOOGLE_GENERATIVE_AI_API_KEY' },
    { id: 'moonshotai', name: 'Moonshot (Kimi)', envVar: 'MOONSHOT_API_KEY' },
    { id: 'alibaba', name: 'Qwen (Alibaba)', envVar: 'ALIBABA_API_KEY' },
    { id: 'zhipu', name: 'GLM (Zhipu)', envVar: 'ZHIPU_API_KEY' },
    { id: 'xai', name: 'xAI (Grok)', envVar: 'XAI_API_KEY' },
    { id: 'custom', name: 'OpenAI Compatible', envVar: 'OPENAI_COMPATIBLE_API_KEY' },
  ]

  useEffect(() => {
    window.electronAPI.getSettings().then((s: Settings) => {
      setAiMode(s.aiMode || 'apiKey')
      setProvider(s.provider || '')
      setApiKey(s.apiKey || '')
      setCustomBaseUrl(s.baseUrl || '')
      setSelectedCli(s.agentCli || '')
      setLoaded(true)

      if (s.aiMode === 'agentCli') {
        setDetecting(true)
        window.electronAPI
          .detectAgentClis()
          .then((result: AgentCliInfo[]) => {
            setAgentClis(result)
            if (!s.agentCli) {
              const firstAvailable = result.find((c) => c.available)
              if (firstAvailable) {
                setSelectedCli(firstAvailable.command)
                window.electronAPI.saveSettings({ agentCli: firstAvailable.command })
              }
            }
          })
          .catch((err: unknown) => {
            console.error('Failed to detect agent CLIs:', err)
          })
          .finally(() => {
            setDetecting(false)
          })
      }
    })
  }, [])

  const save = (patch: Partial<Settings>) => {
    window.electronAPI.saveSettings(patch)
  }

  const handleAiModeChange = (mode: 'apiKey' | 'agentCli') => {
    setAiMode(mode)
    save({ aiMode: mode })
    if (mode === 'agentCli' && agentClis.length === 0) {
      handleDetectClis()
    }
  }

  const handleProviderChange = (v: string) => {
    setProvider(v)
    setTestResult(null)
    save({ provider: v })
  }

  const handleApiKeyChange = (v: string) => {
    setApiKey(v)
    setTestResult(null)
    save({ apiKey: v })
  }

  const handleBaseUrlChange = (v: string) => {
    setCustomBaseUrl(v)
    save({ baseUrl: v } as Partial<Settings>)
  }

  const handleCliSelect = (command: string) => {
    setSelectedCli(command)
    save({ agentCli: command })
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.testApiKey(provider, apiKey)
      setTestResult(result)
    } catch {
      setTestResult({ success: false, message: t('settings.ai.testFailed') })
    } finally {
      setTesting(false)
    }
  }

  const handleDetectClis = async () => {
    setDetecting(true)
    try {
      const result = await window.electronAPI.detectAgentClis()
      setAgentClis(result)
      const firstAvailable = result.find((c: AgentCliInfo) => c.available)
      if (firstAvailable && !selectedCli) {
        handleCliSelect(firstAvailable.command)
      }
    } catch (err) {
      console.error('Failed to detect agent CLIs:', err)
    } finally {
      setDetecting(false)
    }
  }

  const handleExportAll = async () => {
    try {
      const themes = await window.electronAPI.getThemes()
      const analyses = await window.electronAPI.getAnalyses()
      const settings = await window.electronAPI.getSettings()
      const { apiKey: _apiKey, ...exportableSettings } = settings
      const blob = JSON.stringify({ themes, analyses, settings: exportableSettings }, null, 2)
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `imprint-local-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(blobUrl)
      notify(t('feedback.dataExported'))
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleImportData = async () => {
    try {
      const importResult = await window.electronAPI.importTheme()
      if (importResult.success) notify(t('feedback.importFinished'))
      else if (!importResult.canceled) notify(t('feedback.importFailed'), 'error')
    } catch {
      notify(t('feedback.actionFailed'), 'error')
    }
  }

  const handleClearAll = async () => {
    setClearing(true)
    try {
      const themes = await window.electronAPI.getThemes()
      for (const theme of themes) {
        await window.electronAPI.deleteTheme(theme.id)
      }
      const analyses = await window.electronAPI.getAnalyses()
      for (const analysis of analyses) {
        await window.electronAPI.deleteAnalysis(analysis.id)
      }
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
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
            <CheckCircle2 size={13} className="text-success" />
            {t('settings.autoSave')}
          </span>
        }
      />

      <div className="px-8 pb-8 space-y-8 max-w-2xl">
        <section>
          <h3 className="text-lg font-semibold mb-2">{t('settings.ai.title')}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t('settings.ai.description')}</p>

          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => handleAiModeChange('apiKey')}
              aria-pressed={aiMode === 'apiKey'}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                aiMode === 'apiKey'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              }`}
            >
              {t('settings.ai.useApiKey')}
            </button>
            <button
              type="button"
              onClick={() => handleAiModeChange('agentCli')}
              aria-pressed={aiMode === 'agentCli'}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                aiMode === 'agentCli'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              }`}
            >
              {t('settings.ai.useAgentCli')}
            </button>
          </div>

          {aiMode === 'apiKey' ? (
            <div className="space-y-4 p-4 rounded-lg border border-border">
              <div>
                <label className="text-sm font-medium block mb-1.5">{t('settings.ai.provider')}</label>
                <select
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm
                             focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">{t('settings.ai.selectProvider')}</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {provider && (
                <>
                  <div>
                    <label className="text-sm font-medium block mb-1.5">
                      {t('settings.ai.apiKey')}
                      <span className="text-muted-foreground font-normal ml-2">
                        ({providers.find((p) => p.id === provider)?.envVar})
                      </span>
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      placeholder="sk-..."
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm
                                 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  {provider === 'custom' && (
                    <div>
                      <label className="text-sm font-medium block mb-1.5">
                        {t('settings.ai.baseUrl')}
                        <span className="text-muted-foreground font-normal ml-2">(OPENAI_COMPATIBLE_BASE_URL)</span>
                      </label>
                      <input
                        type="text"
                        value={customBaseUrl}
                        onChange={(e) => handleBaseUrlChange(e.target.value)}
                        placeholder="https://api.example.com/v1"
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm
                                   placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  )}
                </>
              )}

              {provider && apiKey && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm
                               hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {testing ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        {t('settings.ai.testing')}
                      </span>
                    ) : (
                      t('settings.ai.testConnection')
                    )}
                  </button>
                  {testResult && (
                    <span
                      className={`text-xs flex items-center gap-1 ${testResult.success ? 'text-success' : 'text-destructive'}`}
                    >
                      {testResult.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {testResult.message}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-border">
              <p className="text-sm text-muted-foreground mb-3">{t('settings.ai.detectDescription')}</p>

              {detecting ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  {t('settings.ai.detecting')}
                </div>
              ) : (
                <div className="space-y-2">
                  {agentClis.map((cli) => (
                    <label
                      key={cli.command}
                      className={`flex items-center gap-3 p-3 rounded-md border transition-colors cursor-pointer ${
                        selectedCli === cli.command
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground/30'
                      } ${!cli.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="radio"
                        name="agentCli"
                        value={cli.command}
                        checked={selectedCli === cli.command}
                        onChange={(e) => handleCliSelect(e.target.value)}
                        disabled={!cli.available}
                        className="accent-primary"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{cli.name}</span>
                          <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">{cli.command}</code>
                        </div>
                        {cli.version && <span className="text-xs text-muted-foreground">{cli.version}</span>}
                      </div>
                      {cli.available ? (
                        <CheckCircle2 size={14} className="text-success" />
                      ) : (
                        <XCircle size={14} className="text-muted-foreground" />
                      )}
                    </label>
                  ))}
                  {agentClis.length === 0 && !detecting && (
                    <p className="text-sm text-muted-foreground">{t('settings.ai.noCli')}</p>
                  )}
                </div>
              )}

              <button
                onClick={handleDetectClis}
                disabled={detecting}
                className="mt-3 h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm
                           hover:bg-accent transition-colors disabled:opacity-50"
              >
                {t('settings.ai.redetect')}
              </button>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-4">{t('settings.data.title')}</h3>
          <div className="p-4 rounded-lg border border-border space-y-3">
            <div className="flex gap-3">
              <button
                onClick={handleExportAll}
                className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm
                                 hover:bg-accent transition-colors"
              >
                {t('settings.data.exportAll')}
              </button>
              <button
                onClick={handleImportData}
                className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm
                                 hover:bg-accent transition-colors"
              >
                {t('settings.data.import')}
              </button>
              <button
                onClick={() => setConfirmClearAll(true)}
                className="h-9 px-4 rounded-md bg-destructive text-destructive-foreground text-sm
                                 hover:opacity-90 transition-opacity"
              >
                {t('settings.data.clearAll')}
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
