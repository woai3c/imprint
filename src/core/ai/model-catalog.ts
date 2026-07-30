// Curated model catalog for the desktop Settings UI (last reviewed 2026-07).
// Curation rule: list only each provider's current generation; an older generation is kept
// only when its pricing differs from the newest one, so users never pay the same price for
// an outdated model. Free-text model entry stays available only for the `custom` provider.
// The CLI/MCP accept any model ID by flag for power users; this catalog governs the app UI.
export interface CatalogModel {
  id: string
  label: string
  vision: boolean
  recommended?: boolean
  /** Display string: standard rate per 1M tokens as "input / output" USD. */
  price: string
}

export const MODEL_CATALOG: Record<string, CatalogModel[]> = {
  // GPT-5.5 is excluded: same $5/$30 rate as GPT-5.6 Sol.
  openai: [
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', vision: true, recommended: true, price: '$2.50 / $15' },
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', vision: true, price: '$5 / $30' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', vision: true, price: '$1 / $6' },
  ],
  // Opus 4.8 and Sonnet 4.6 are excluded: same rates as Opus 5 / Sonnet 5.
  anthropic: [
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', vision: true, recommended: true, price: '$3 / $15' },
    { id: 'claude-opus-5', label: 'Claude Opus 5', vision: true, price: '$5 / $25' },
    { id: 'claude-fable-5', label: 'Claude Fable 5', vision: true, price: '$10 / $50' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', vision: true, price: '$1 / $5' },
  ],
  // Gemini 3.5 Flash is excluded: same input rate as 3.6 Flash but more expensive output.
  google: [
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', vision: true, recommended: true, price: '$1.50 / $7.50' },
    { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', vision: true, price: '$2 / $12' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', vision: true, price: '$0.30 / $2.50' },
  ],
  // The legacy deepseek-chat / deepseek-reasoner aliases were retired on 2026-07-24.
  deepseek: [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', vision: false, recommended: true, price: '$0.14 / $0.28' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', vision: false, price: '$0.435 / $0.87' },
  ],
  // The kimi-k2 series was discontinued on 2026-05-25. moonshot-v1 stays as the budget line.
  moonshotai: [
    { id: 'kimi-k3', label: 'Kimi K3', vision: true, recommended: true, price: '$3 / $15' },
    { id: 'moonshot-v1-128k', label: 'Moonshot V1 128K', vision: false, price: '¥60 / ¥60' },
    { id: 'moonshot-v1-32k', label: 'Moonshot V1 32K', vision: false, price: '¥24 / ¥24' },
    { id: 'moonshot-v1-8k', label: 'Moonshot V1 8K', vision: false, price: '¥12 / ¥12' },
  ],
  // Qwen3.6 Plus is excluded: Qwen3.7 Plus supersedes it at a lower multimodal rate.
  alibaba: [
    { id: 'qwen3.7-plus', label: 'Qwen3.7 Plus', vision: true, recommended: true, price: '$0.32–0.96 / $1.28–3.84' },
    { id: 'qwen3.7-max', label: 'Qwen3.7 Max', vision: false, price: '$1.25 / $3.75' },
    { id: 'qwen3.5-flash', label: 'Qwen3.5 Flash', vision: false, price: '$0.10 / $0.40' },
  ],
  // GLM-5.1 is excluded: same $1.4/$4.4 rate as GLM-5.2.
  zhipu: [
    { id: 'glm-5v-turbo', label: 'GLM-5V Turbo', vision: true, recommended: true, price: '$1.20 / $4' },
    { id: 'glm-5.2', label: 'GLM-5.2', vision: false, price: '$1.40 / $4.40' },
    { id: 'glm-5', label: 'GLM-5', vision: false, price: '$1 / $3.20' },
    { id: 'glm-4.7-flashx', label: 'GLM-4.7 FlashX', vision: false, price: '$0.07 / $0.40' },
  ],
  xai: [{ id: 'grok-4.5', label: 'Grok 4.5', vision: true, recommended: true, price: '$2 / $6' }],
}

export function getCatalogModels(provider: string): CatalogModel[] {
  return MODEL_CATALOG[provider] ?? []
}

export function getCatalogModel(provider: string, modelId: string): CatalogModel | null {
  return getCatalogModels(provider).find((entry) => entry.id === modelId) ?? null
}

export function getRecommendedModel(provider: string): CatalogModel | null {
  const models = getCatalogModels(provider)
  return models.find((entry) => entry.recommended) ?? models[0] ?? null
}
