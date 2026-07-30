import { CheckCircle2, CircleOff, KeyRound, Loader2, RefreshCw, Terminal, XCircle } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getAgentCliDisplayName } from '../../shared/agent-clis'
import type { AgentCliInfo, AppSettings } from '../../shared/ipc-contract'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { IconButton } from '../components/ui/IconButton'
import { useFeedbackStore } from '../stores/feedback-store'

let cachedAgentClis: AgentCliInfo[] | null = null
let activeAgentCliDetection: Promise<AgentCliInfo[]> | null = null

const PROVIDERS = [
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

async function requestAgentCliDetection(force: boolean): Promise<AgentCliInfo[]> {
  if (activeAgentCliDetection) return activeAgentCliDetection
  if (!force && cachedAgentClis) return cachedAgentClis

  const detection = window.electronAPI.detectAgentClis(force)
  activeAgentCliDetection = detection

  try {
    const result = await detection
    cachedAgentClis = result
    return result
  } finally {
    if (activeAgentCliDetection === detection) activeAgentCliDetection = null
  }
}

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const notify = useFeedbackStore((state) => state.show)
  const [aiMode, setAiMode] = useState<'apiKey' | 'agentCli'>('apiKey')
  const [provider, setProvider] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [modelSupportsVision, setModelSupportsVision] = useState(false)
  const [visionAnalysisConsent, setVisionAnalysisConsent] = useState(false)
  const [managedVisionConsent, setManagedVisionConsent] = useState(false)
  const [agentClis, setAgentClis] = useState<AgentCliInfo[]>(() => cachedAgentClis ?? [])
  const [selectedCli, setSelectedCli] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      setAiMode(s.aiMode || 'apiKey')
      setProvider(s.provider || '')
      setApiKey(s.apiKey || '')
      setCustomBaseUrl(s.baseUrl || '')
      setModel(s.model || '')
      setModelSupportsVision(s.modelSupportsVision === true)
      setVisionAnalysisConsent(s.visionAnalysisConsent === true)
      setManagedVisionConsent(s.managedVisionConsent === true)
      setSelectedCli(s.agentCli || '')
      setLoaded(true)

      if (s.aiMode === 'agentCli') {
        const showProgress = cachedAgentClis === null
        if (showProgress) setDetecting(true)
        requestAgentCliDetection(false)
          .then((result) => {
            setAgentClis(result)
          })
          .catch((err: unknown) => {
            console.error('Failed to detect agent CLIs:', err)
            window.electronAPI.logEvent(
              'error',
              `Initial Agent CLI detection failed in renderer: ${err instanceof Error ? err.message : String(err)}`,
            )
          })
          .finally(() => {
            if (showProgress) setDetecting(false)
          })
      }
    })
  }, [])

  const save = (patch: Partial<AppSettings>) => {
    window.electronAPI.saveSettings(patch)
  }

  const handleAiModeChange = (mode: 'apiKey' | 'agentCli') => {
    setAiMode(mode)
    save({ aiMode: mode })
    if (mode === 'agentCli' && agentClis.length === 0) {
      handleDetectClis(false)
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
    save({ baseUrl: v })
  }

  const handleModelChange = (v: string) => {
    setModel(v)
    save({ model: v })
  }

  const handleModelSupportsVisionChange = (value: boolean) => {
    setModelSupportsVision(value)
    save({ modelSupportsVision: value })
  }

  const handleVisionConsentChange = (value: boolean) => {
    setVisionAnalysisConsent(value)
    save({ visionAnalysisConsent: value })
  }

  const handleManagedVisionConsentChange = (value: boolean) => {
    setManagedVisionConsent(value)
    save({ managedVisionConsent: value })
  }

  const handleCliSelect = (command: string) => {
    const nextCommand = selectedCli === command ? '' : command
    setSelectedCli(nextCommand)
    save({ agentCli: nextCommand })
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.testApiKey(provider, apiKey, customBaseUrl || undefined)
      setTestResult(result)
    } catch {
      setTestResult({ success: false, message: t('settings.ai.testFailed') })
    } finally {
      setTesting(false)
    }
  }

  const handleDetectClis = async (force: boolean) => {
    const showProgress = force || cachedAgentClis === null
    if (showProgress) setDetecting(true)
    try {
      const result = await requestAgentCliDetection(force)
      setAgentClis(result)
    } catch (err: unknown) {
      console.error('Failed to detect agent CLIs:', err)
      window.electronAPI.logEvent(
        'error',
        `Agent CLI detection failed in renderer: ${err instanceof Error ? err.message : String(err)}`,
      )
      notify(t('feedback.actionFailed'), 'error')
    } finally {
      if (showProgress) setDetecting(false)
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
      const importResult = await window.electronAPI.importTheme(i18n.language)
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
      const analyses = await window.electronAPI.getAnalysisSummaries()
      if (analyses.length > 0) await window.electronAPI.deleteAnalyses(analyses.map((analysis) => analysis.id))
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

  const selectedProvider = PROVIDERS.find((item) => item.id === provider)
  const selectedAgentCli = agentClis.find((item) => item.command === selectedCli)
  const hasApiKeyConfiguration = Boolean(provider && apiKey)
  const hasAgentCliConfiguration = Boolean(selectedCli && (agentClis.length === 0 || selectedAgentCli?.available))
  const hasActiveAiConfiguration = aiMode === 'apiKey' ? hasApiKeyConfiguration : hasAgentCliConfiguration
  const activeEngineLabel =
    aiMode === 'apiKey' && hasApiKeyConfiguration
      ? t('settings.ai.activeApiKey', { provider: selectedProvider?.name || provider })
      : aiMode === 'agentCli' && hasAgentCliConfiguration
        ? t('settings.ai.activeAgentCli', { name: selectedAgentCli?.name || getAgentCliDisplayName(selectedCli) })
        : t('settings.ai.notConfigured')
  const activeEngineHint = hasActiveAiConfiguration
    ? t('settings.ai.activeHint')
    : t(aiMode === 'apiKey' ? 'settings.ai.apiKeyIncomplete' : 'settings.ai.agentCliIncomplete')
  const apiKeySummary = hasApiKeyConfiguration
    ? t('settings.ai.apiKeyConfigured', { provider: selectedProvider?.name || provider })
    : t('settings.ai.apiKeyNotConfigured')
  const agentCliSummary = !selectedCli
    ? t('settings.ai.agentCliNotConfigured')
    : hasAgentCliConfiguration
      ? t('settings.ai.agentCliConfigured', { name: selectedAgentCli?.name || getAgentCliDisplayName(selectedCli) })
      : t('settings.ai.agentCliUnavailable', { name: selectedAgentCli?.name || getAgentCliDisplayName(selectedCli) })

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

          <div
            data-testid="ai-engine-status"
            aria-live="polite"
            className={`mb-5 flex items-start gap-3 rounded-lg border p-4 ${
              hasActiveAiConfiguration ? 'border-success/40 bg-success/5' : 'border-border bg-secondary/35'
            }`}
          >
            <span
              className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                hasActiveAiConfiguration ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
              }`}
            >
              {hasActiveAiConfiguration ? (
                <CheckCircle2 size={17} aria-hidden="true" />
              ) : (
                <CircleOff size={17} aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{t('settings.ai.currentEngine')}</p>
              <p data-testid="ai-engine-status-label" className="mt-0.5 text-sm font-semibold">
                {activeEngineLabel}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{activeEngineHint}</p>
            </div>
          </div>

          <fieldset className="mb-6">
            <legend className="mb-2 text-sm font-medium">{t('settings.ai.methodLabel')}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                data-testid="ai-mode-api-key"
                type="button"
                onClick={() => handleAiModeChange('apiKey')}
                aria-pressed={aiMode === 'apiKey'}
                className={`flex min-h-20 items-center gap-3 rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  aiMode === 'apiKey'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-accent/35'
                }`}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
                    aiMode === 'apiKey' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  <KeyRound size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t('settings.ai.useApiKey')}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{apiKeySummary}</span>
                </span>
                {aiMode === 'apiKey' && <CheckCircle2 size={16} className="shrink-0 text-primary" aria-hidden="true" />}
              </button>

              <button
                data-testid="ai-mode-agent-cli"
                type="button"
                onClick={() => handleAiModeChange('agentCli')}
                aria-pressed={aiMode === 'agentCli'}
                className={`flex min-h-20 items-center gap-3 rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  aiMode === 'agentCli'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-accent/35'
                }`}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
                    aiMode === 'agentCli' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  <Terminal size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t('settings.ai.useAgentCli')}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{agentCliSummary}</span>
                </span>
                {aiMode === 'agentCli' && (
                  <CheckCircle2 size={16} className="shrink-0 text-primary" aria-hidden="true" />
                )}
              </button>
            </div>
          </fieldset>

          {aiMode === 'apiKey' ? (
            <div className="space-y-4 p-4 rounded-lg border border-border">
              <div>
                <label htmlFor="ai-provider" className="text-sm font-medium block mb-1.5">
                  {t('settings.ai.provider')}
                </label>
                <select
                  id="ai-provider"
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm
                             focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">{t('settings.ai.selectProvider')}</option>
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {provider && (
                <>
                  <div>
                    <label htmlFor="ai-api-key" className="text-sm font-medium block mb-1.5">
                      {t('settings.ai.apiKey')}
                      <span className="text-muted-foreground font-normal ml-2">
                        ({PROVIDERS.find((p) => p.id === provider)?.envVar})
                      </span>
                    </label>
                    <input
                      id="ai-api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      placeholder="sk-..."
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm
                                 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label htmlFor="ai-model" className="text-sm font-medium block mb-1.5">
                      {t('settings.ai.model')}
                    </label>
                    <input
                      id="ai-model"
                      type="text"
                      value={model}
                      onChange={(e) => handleModelChange(e.target.value)}
                      placeholder={t('settings.ai.modelPlaceholder')}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm
                                 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('settings.ai.modelHint')}</p>
                  </div>
                  {provider === 'custom' && (
                    <>
                      <div>
                        <label htmlFor="ai-base-url" className="text-sm font-medium block mb-1.5">
                          {t('settings.ai.baseUrl')}
                          <span className="text-muted-foreground font-normal ml-2">(OPENAI_COMPATIBLE_BASE_URL)</span>
                        </label>
                        <input
                          id="ai-base-url"
                          type="text"
                          value={customBaseUrl}
                          onChange={(e) => handleBaseUrlChange(e.target.value)}
                          placeholder="https://api.example.com/v1"
                          className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm
                                     placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/25 p-3">
                        <input
                          type="checkbox"
                          checked={modelSupportsVision}
                          onChange={(event) => handleModelSupportsVisionChange(event.target.checked)}
                          className="mt-0.5 size-4 accent-primary"
                        />
                        <span>
                          <span className="block text-sm font-medium">{t('settings.ai.customVision')}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {t('settings.ai.customVisionHint')}
                          </span>
                        </span>
                      </label>
                    </>
                  )}
                  <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/25 p-3">
                    <input
                      data-testid="vision-analysis-consent"
                      type="checkbox"
                      checked={visionAnalysisConsent}
                      onChange={(event) => handleVisionConsentChange(event.target.checked)}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium">{t('settings.ai.visionConsent')}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {t('settings.ai.visionConsentHint', { provider: selectedProvider?.name || provider })}
                      </span>
                    </span>
                  </label>
                  {visionAnalysisConsent && (
                    <label className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
                      <input
                        data-testid="managed-vision-consent"
                        type="checkbox"
                        checked={managedVisionConsent}
                        onChange={(event) => handleManagedVisionConsentChange(event.target.checked)}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      <span>
                        <span className="block text-sm font-medium">{t('settings.ai.managedVisionConsent')}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {t('settings.ai.managedVisionConsentHint', { provider: selectedProvider?.name || provider })}
                        </span>
                      </span>
                    </label>
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
              <p className="mb-4 rounded-lg bg-secondary/45 p-3 text-xs leading-5 text-muted-foreground">
                {t('settings.ai.agentCliStructuralHint')}
              </p>
              <div className="mb-4 space-y-2">
                <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/25 p-3">
                  <input
                    data-testid="agent-cli-vision-consent"
                    type="checkbox"
                    checked={visionAnalysisConsent}
                    onChange={(event) => handleVisionConsentChange(event.target.checked)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium">{t('settings.ai.agentCliVisionConsent')}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {t('settings.ai.agentCliVisionConsentHint')}
                    </span>
                  </span>
                </label>
                {visionAnalysisConsent && (
                  <label className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
                    <input
                      data-testid="managed-vision-consent"
                      type="checkbox"
                      checked={managedVisionConsent}
                      onChange={(event) => handleManagedVisionConsentChange(event.target.checked)}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium">{t('settings.ai.managedVisionConsent')}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {t('settings.ai.managedVisionConsentHint', {
                          provider: selectedCli ? getAgentCliDisplayName(selectedCli) : 'CLI',
                        })}
                      </span>
                    </span>
                  </label>
                )}
              </div>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t('settings.ai.detectDescription')}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('settings.ai.detectHint')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {selectedCli && (
                    <button
                      data-testid="agent-cli-clear"
                      type="button"
                      onClick={() => handleCliSelect(selectedCli)}
                      className="h-8 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t('settings.ai.clearCli')}
                    </button>
                  )}
                  <IconButton
                    icon={RefreshCw}
                    label={t('settings.ai.redetect')}
                    onClick={() => handleDetectClis(true)}
                    disabled={detecting}
                  />
                </div>
              </div>

              {detecting && (
                <div
                  data-testid="agent-cli-detecting"
                  className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"
                  role="status"
                >
                  <Loader2 size={16} className="animate-spin" />
                  {t('settings.ai.detecting')}
                </div>
              )}

              <div data-testid="agent-cli-list" className="space-y-2">
                {agentClis.map((cli) => (
                  <button
                    key={cli.command}
                    data-testid={`agent-cli-option-${cli.command}`}
                    type="button"
                    aria-pressed={selectedCli === cli.command}
                    aria-label={t(selectedCli === cli.command ? 'settings.ai.deselectCli' : 'settings.ai.selectCli', {
                      name: cli.name,
                    })}
                    onClick={() => handleCliSelect(cli.command)}
                    disabled={!cli.available}
                    className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selectedCli === cli.command
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    } ${!cli.available ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                        selectedCli === cli.command ? 'border-primary' : 'border-muted-foreground/50'
                      }`}
                      aria-hidden="true"
                    >
                      {selectedCli === cli.command && <span className="size-2 rounded-full bg-primary" />}
                    </span>
                    <div className="min-w-0 flex-1">
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
                  </button>
                ))}
                {agentClis.length === 0 && !detecting && (
                  <p className="text-sm text-muted-foreground">{t('settings.ai.noCli')}</p>
                )}
              </div>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-4">{t('settings.data.title')}</h3>
          <div className="p-4 rounded-lg border border-border space-y-3">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExportAll}
                className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm whitespace-nowrap
                                 hover:bg-accent transition-colors"
              >
                {t('settings.data.exportAll')}
              </button>
              <button
                onClick={handleImportData}
                className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm whitespace-nowrap
                                 hover:bg-accent transition-colors"
              >
                {t('settings.data.import')}
              </button>
              <button
                onClick={() => setConfirmClearAll(true)}
                className="h-9 px-4 rounded-md bg-destructive text-destructive-foreground text-sm whitespace-nowrap
                                 hover:opacity-90 transition-opacity"
              >
                {t('settings.data.clearAll')}
              </button>
              <button
                onClick={() => window.electronAPI.openLogsFolder()}
                className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm whitespace-nowrap
                                 hover:bg-accent transition-colors"
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
