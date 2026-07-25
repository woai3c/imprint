import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface AgentCliInfo {
  name: string
  command: string
  version: string | null
  available: boolean
}

export function SettingsPage() {
  const { t } = useTranslation()
  const [aiMode, setAiMode] = useState<'apiKey' | 'agentCli'>('apiKey')
  const [provider, setProvider] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [agentClis, setAgentClis] = useState<AgentCliInfo[]>([])
  const [selectedCli, setSelectedCli] = useState('')
  const [detecting, setDetecting] = useState(false)

  const providers = [
    { id: 'deepseek', name: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY' },
    { id: 'anthropic', name: 'Anthropic (Claude)', envVar: 'ANTHROPIC_API_KEY' },
    { id: 'openai', name: 'OpenAI (GPT)', envVar: 'OPENAI_API_KEY' },
    { id: 'google', name: 'Google (Gemini)', envVar: 'GOOGLE_GENERATIVE_AI_API_KEY' },
    { id: 'moonshotai', name: 'Moonshot (Kimi)', envVar: 'MOONSHOT_API_KEY' },
    { id: 'alibaba', name: '通义千问 (Qwen)', envVar: 'ALIBABA_API_KEY' },
    { id: 'zhipu', name: '智谱 (GLM)', envVar: 'ZHIPU_API_KEY' },
    { id: 'xai', name: 'xAI (Grok)', envVar: 'XAI_API_KEY' },
    { id: 'custom', name: 'OpenAI Compatible', envVar: 'OPENAI_COMPATIBLE_API_KEY' },
  ]

  useEffect(() => {
    if (aiMode === 'agentCli') {
      const detect = async () => {
        setDetecting(true)
        try {
          const result = await window.electronAPI.detectAgentClis()
          setAgentClis(result)
          const firstAvailable = result.find((c: AgentCliInfo) => c.available)
          if (firstAvailable) {
            setSelectedCli(firstAvailable.command)
          }
        } catch (err) {
          console.error('Failed to detect agent CLIs:', err)
        } finally {
          setDetecting(false)
        }
      }
      detect()
    }
  }, [aiMode])

  const handleDetectClis = async () => {
    setDetecting(true)
    try {
      const result = await window.electronAPI.detectAgentClis()
      setAgentClis(result)
      const firstAvailable = result.find((c: AgentCliInfo) => c.available)
      if (firstAvailable) {
        setSelectedCli(firstAvailable.command)
      }
    } catch (err) {
      console.error('Failed to detect agent CLIs:', err)
    } finally {
      setDetecting(false)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="px-8 pt-4 pb-6">
        <h2 className="text-2xl font-bold">{t('settings.title')}</h2>
        <p className="text-muted-foreground mt-1">{t('settings.description')}</p>
      </div>

      <div className="px-8 pb-8 space-y-8 max-w-2xl">
        <section>
          <h3 className="text-lg font-semibold mb-2">{t('settings.ai.title')}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t('settings.ai.description')}</p>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setAiMode('apiKey')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                aiMode === 'apiKey'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              }`}
            >
              {t('settings.ai.useApiKey')}
            </button>
            <button
              onClick={() => setAiMode('agentCli')}
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
                  onChange={(e) => setProvider(e.target.value)}
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
                      onChange={(e) => setApiKey(e.target.value)}
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
                        onChange={(e) => setCustomBaseUrl(e.target.value)}
                        placeholder="https://api.example.com/v1"
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm
                                   placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  )}
                </>
              )}

              {provider && apiKey && (
                <button
                  className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm
                                   hover:bg-accent transition-colors"
                >
                  {t('settings.ai.testConnection')}
                </button>
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
                        onChange={(e) => setSelectedCli(e.target.value)}
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
                        <CheckCircle2 size={14} className="text-green-500" />
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
          <h3 className="text-lg font-semibold mb-4">{t('settings.export.title')}</h3>
          <div className="p-4 rounded-lg border border-border space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1.5">{t('settings.export.defaultFormat')}</label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm
                                 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="css">{t('settings.export.css')}</option>
                <option value="tailwind">{t('settings.export.tailwind')}</option>
                <option value="both">{t('settings.export.both')}</option>
                <option value="json">{t('settings.export.json')}</option>
                <option value="markdown">{t('settings.export.markdown')}</option>
                <option value="all">{t('settings.export.all')}</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-4">{t('settings.data.title')}</h3>
          <div className="p-4 rounded-lg border border-border space-y-3">
            <div className="flex gap-3">
              <button
                className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm
                                 hover:bg-accent transition-colors"
              >
                {t('settings.data.exportAll')}
              </button>
              <button
                className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm
                                 hover:bg-accent transition-colors"
              >
                {t('settings.data.import')}
              </button>
              <button
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
    </div>
  )
}
