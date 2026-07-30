import type { AiModelCapabilities } from '../design-intelligence/types.js'

export function getDefaultModel(provider: string): string {
  const models: Record<string, string> = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-20241022',
    google: 'gemini-2.0-flash',
    deepseek: 'deepseek-chat',
    moonshotai: 'moonshot-v1-8k',
    alibaba: 'qwen-plus',
    zhipu: 'glm-4-flash',
    xai: 'grok-3-mini',
    custom: '',
  }
  return models[provider] || ''
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
