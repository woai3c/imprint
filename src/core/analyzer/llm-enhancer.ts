import type { DesignToken } from './index.js'

/**
 * LLM-enhanced semantic naming and design intent analysis.
 * Only called when AI is configured. Falls back gracefully without LLM.
 */

export interface LlmEnhancement {
  colorNames: Record<string, string>
  designSummary: string
  designIntent: string
  featureTagsEnhanced: string[]
}

export interface LlmConfig {
  provider: string
  apiKey: string
  baseUrl?: string
  model?: string
}

/**
 * Attempt LLM-based enhancement. Returns null if no AI is configured or call fails.
 */
export async function enhanceWithLlm(
  tokens: DesignToken,
  url: string,
  config: LlmConfig | null,
): Promise<LlmEnhancement | null> {
  if (!config || !config.apiKey) return null

  try {
    const prompt = buildEnhancementPrompt(tokens, url)
    const response = await callLlm(config, prompt)
    return parseEnhancementResponse(response)
  } catch {
    return null
  }
}

function buildEnhancementPrompt(tokens: DesignToken, url: string): string {
  const colorList = Object.entries(tokens.colors)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n')

  return `You are a design system analyst. Analyze the following design tokens extracted from ${url}.

Colors:
${colorList}

Font families: ${tokens.typography.fontFamilies.join(', ')}
Font sizes: ${tokens.typography.fontSizes.join(', ')}

Respond in JSON format:
{
  "colorNames": { "<current_name>": "<semantic_name>" },
  "designSummary": "<1-2 sentence summary of the visual style>",
  "designIntent": "<what feeling/brand impression this design conveys>",
  "featureTags": ["<tag1>", "<tag2>", "<tag3>"]
}

Rules:
- Color names should be semantic (e.g., "surface-primary", "text-muted", "action-brand")
- Keep summary concise and professional
- Tags should describe notable design patterns (max 5 tags)`
}

async function callLlm(config: LlmConfig, prompt: string): Promise<string> {
  const baseUrl = config.baseUrl || getDefaultBaseUrl(config.provider)
  const model = config.model || getDefaultModel(config.provider)

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`)
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
  return data.choices[0]?.message?.content || ''
}

function parseEnhancementResponse(response: string): LlmEnhancement | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0]) as {
      colorNames?: Record<string, string>
      designSummary?: string
      designIntent?: string
      featureTags?: string[]
    }

    return {
      colorNames: parsed.colorNames || {},
      designSummary: parsed.designSummary || '',
      designIntent: parsed.designIntent || '',
      featureTagsEnhanced: parsed.featureTags || [],
    }
  } catch {
    return null
  }
}

function getDefaultBaseUrl(provider: string): string {
  const urls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
    moonshot: 'https://api.moonshot.cn/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    silicon: 'https://api.siliconflow.cn/v1',
  }
  return urls[provider] || urls['openai']
}

function getDefaultModel(provider: string): string {
  const models: Record<string, string> = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-20241022',
    deepseek: 'deepseek-chat',
    moonshot: 'moonshot-v1-8k',
    zhipu: 'glm-4-flash',
    qwen: 'qwen-turbo',
    silicon: 'Qwen/Qwen2.5-7B-Instruct',
  }
  return models[provider] || 'gpt-4o-mini'
}
