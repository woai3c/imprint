import type { AiModelCapabilities } from '../design-intelligence/types.js'
import { getCatalogModel, getRecommendedModel } from './model-catalog.js'

export function getDefaultModel(provider: string): string {
  return getRecommendedModel(provider)?.id ?? ''
}

// Catalog providers never trust a saved model that left the catalog (retired or renamed
// upstream); they fall back to the recommended model. `custom` keeps free-text IDs.
export function resolveEffectiveModel(provider: string, savedModel: string): string {
  if (provider === 'custom') return savedModel
  return getCatalogModel(provider, savedModel)?.id ?? getDefaultModel(provider)
}

export function getDefaultBaseUrl(provider: string): string {
  const urls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    deepseek: 'https://api.deepseek.com/v1',
    moonshotai: 'https://api.moonshot.cn/v1',
    alibaba: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    xai: 'https://api.x.ai/v1',
    custom: '',
  }
  return urls[provider] || ''
}

export function resolveAiModelCapabilities(provider: string, model: string, customVision = false): AiModelCapabilities {
  const catalogEntry = getCatalogModel(provider, model)
  if (catalogEntry) {
    return {
      text: true,
      vision: catalogEntry.vision,
      structuredOutput: true,
      ...(catalogEntry.vision ? { imageInputMethod: 'inline-base64' as const, maxImages: 6 } : {}),
    }
  }
  const normalized = model.toLowerCase()
  const vision =
    provider === 'openai'
      ? /(?:gpt-4o|gpt-4\.1|gpt-5|o3|o4)/.test(normalized)
      : provider === 'anthropic'
        ? /claude-3|claude-4/.test(normalized)
        : provider === 'google'
          ? /gemini/.test(normalized)
          : provider === 'xai'
            ? /vision/.test(normalized)
            : provider === 'zhipu'
              ? /glm-4v/.test(normalized)
              : provider === 'alibaba'
                ? /qwen.*vl/.test(normalized)
                : provider === 'custom'
                  ? customVision
                  : false
  return {
    text: true,
    vision,
    structuredOutput: true,
    ...(vision ? { imageInputMethod: 'inline-base64' as const, maxImages: 6 } : {}),
  }
}
