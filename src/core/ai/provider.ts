import { getDefaultBaseUrl, getDefaultModel } from './capabilities.js'

export interface AiProviderConfig {
  provider: string
  apiKey: string
  baseUrl?: string
  model?: string
  signal?: AbortSignal
}

export interface AiImageInput {
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  base64: string
}

export function mimeTypeForPath(filePath: string): AiImageInput['mimeType'] {
  if (/\.jpe?g$/i.test(filePath)) return 'image/jpeg'
  if (/\.webp$/i.test(filePath)) return 'image/webp'
  return 'image/png'
}

export interface AiResponse {
  text: string
  model: string
  usage?: {
    input?: number
    output?: number
  }
}

const MAX_RESPONSE_CHARS = 2_000_000
const MAX_PROMPT_CHARS = 2_000_000
const MAX_IMAGES = 6
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024

function validateRequestBudget(prompt: string, images: AiImageInput[]): void {
  if (prompt.length > MAX_PROMPT_CHARS) throw new Error('AI provider prompt exceeded the size limit')
  if (images.length > MAX_IMAGES) throw new Error('AI provider image count exceeded the limit')
  let totalBytes = 0
  for (const image of images) {
    const bytes = Math.ceil((image.base64.length * 3) / 4)
    if (bytes > MAX_IMAGE_BYTES) throw new Error('AI provider image exceeded the size limit')
    totalBytes += bytes
  }
  if (totalBytes > MAX_TOTAL_IMAGE_BYTES) throw new Error('AI provider image input exceeded the total size limit')
}

function imageLabel(image: AiImageInput): string {
  return image.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w-]/g, '')
    .slice(0, 120)
}

function requestSignal(config: AiProviderConfig): AbortSignal {
  const timeout = AbortSignal.timeout(60_000)
  return config.signal ? AbortSignal.any([config.signal, timeout]) : timeout
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`)
  if (text.length > MAX_RESPONSE_CHARS) throw new Error('AI provider response exceeded the size limit')
  return JSON.parse(text)
}

async function callAnthropic(
  config: Required<Pick<AiProviderConfig, 'apiKey' | 'provider'>> & AiProviderConfig,
  model: string,
  baseUrl: string,
  prompt: string,
  images: AiImageInput[],
): Promise<AiResponse> {
  const content = [
    ...images.flatMap((image) => [
      { type: 'text', text: `Evidence image ID: ${imageLabel(image)}` },
      {
        type: 'image',
        source: { type: 'base64', media_type: image.mimeType, data: image.base64 },
      },
    ]),
    { type: 'text', text: prompt },
  ]
  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': config.apiKey,
    },
    body: JSON.stringify({ model, max_tokens: 6000, temperature: 0.2, messages: [{ role: 'user', content }] }),
    signal: requestSignal(config),
  })
  const data = (await readJsonResponse(response)) as {
    content?: Array<{ type?: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  return {
    text: data.content?.find((item) => item.type === 'text')?.text || '',
    model,
    usage: { input: data.usage?.input_tokens, output: data.usage?.output_tokens },
  }
}

async function callGoogle(
  config: Required<Pick<AiProviderConfig, 'apiKey' | 'provider'>> & AiProviderConfig,
  model: string,
  baseUrl: string,
  prompt: string,
  images: AiImageInput[],
): Promise<AiResponse> {
  const parts = [
    ...images.flatMap((image) => [
      { text: `Evidence image ID: ${imageLabel(image)}` },
      { inlineData: { mimeType: image.mimeType, data: image.base64 } },
    ]),
    { text: prompt },
  ]
  const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${config.apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 6000, responseMimeType: 'application/json' },
    }),
    signal: requestSignal(config),
  })
  const data = (await readJsonResponse(response)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  return {
    text: data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '',
    model,
    usage: {
      input: data.usageMetadata?.promptTokenCount,
      output: data.usageMetadata?.candidatesTokenCount,
    },
  }
}

async function callOpenAiCompatible(
  config: Required<Pick<AiProviderConfig, 'apiKey' | 'provider'>> & AiProviderConfig,
  model: string,
  baseUrl: string,
  prompt: string,
  images: AiImageInput[],
): Promise<AiResponse> {
  const content =
    images.length > 0
      ? [
          { type: 'text', text: prompt },
          ...images.flatMap((image) => [
            { type: 'text', text: `Evidence image ID: ${imageLabel(image)}` },
            {
              type: 'image_url',
              image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: 'high' },
            },
          ]),
        ]
      : prompt
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      temperature: 0.2,
      max_tokens: 6000,
    }),
    signal: requestSignal(config),
  })
  const data = (await readJsonResponse(response)) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  return {
    text: data.choices?.[0]?.message?.content || '',
    model,
    usage: { input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens },
  }
}

async function callAiProviderOnce(
  config: AiProviderConfig,
  prompt: string,
  images: AiImageInput[] = [],
): Promise<AiResponse> {
  if (!config.apiKey) throw new Error('AI API key is not configured')
  const model = config.model || getDefaultModel(config.provider)
  const baseUrl = (config.baseUrl || getDefaultBaseUrl(config.provider)).replace(/\/$/, '')
  if (!model) throw new Error('AI model is not configured')
  if (!baseUrl) throw new Error('AI provider base URL is not configured')
  if (config.provider === 'anthropic') return callAnthropic(config, model, baseUrl, prompt, images)
  if (config.provider === 'google') return callGoogle(config, model, baseUrl, prompt, images)
  return callOpenAiCompatible(config, model, baseUrl, prompt, images)
}

function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /HTTP (?:429|5\d\d)|fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(error.message)
}

export async function callAiProvider(
  config: AiProviderConfig,
  prompt: string,
  images: AiImageInput[] = [],
): Promise<AiResponse> {
  validateRequestBudget(prompt, images)
  try {
    return await callAiProviderOnce(config, prompt, images)
  } catch (error: unknown) {
    if (!isRetryableProviderError(error)) throw error
    await new Promise((resolve) => setTimeout(resolve, 250))
    return callAiProviderOnce(config, prompt, images)
  }
}
