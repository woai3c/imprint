import { getDefaultBaseUrl, getDefaultModel } from './capabilities.js'

export interface AiProviderConfig {
  provider: string
  apiKey: string
  baseUrl?: string
  model?: string
  signal?: AbortSignal
  fetchFn?: typeof fetch
  reasoningEffort?: string
  thinkingEnabled?: boolean
  maxOutputTokens?: number
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
  // Set when the first attempt returned no content (thinking models can exhaust the
  // completion budget on reasoning tokens) and the request was retried with thinking off.
  retriedWithoutThinking?: boolean
  // Provider stop reason (e.g. 'stop', 'length'); 'length' means the answer was truncated.
  finishReason?: string
  usage?: {
    input?: number
    output?: number
    // Reasoning (thinking) tokens consumed before the visible answer; reported
    // separately and excluded from `output` so usage stats reflect real content.
    reasoning?: number
  }
}

const MAX_RESPONSE_CHARS = 2_000_000
const MAX_PROMPT_CHARS = 2_000_000
const MAX_IMAGES = 6
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024

function outputTokenLimit(config: AiProviderConfig, fallback: number): number {
  // Thinking models charge reasoning tokens against the same completion budget, so the
  // visible answer needs a reasoning reserve on top — otherwise a long reasoning phase
  // truncates the actual JSON output (finish_reason=length).
  const reasoningReserve = 16_384
  const cap = config.thinkingEnabled ? 65_536 : 16_384
  const requested = config.maxOutputTokens
  if (!requested || !Number.isFinite(requested)) {
    return Math.min(cap, config.thinkingEnabled ? fallback * 2 + reasoningReserve : fallback)
  }
  const visible = Math.max(256, Math.round(requested))
  return Math.min(cap, config.thinkingEnabled ? visible + reasoningReserve : visible)
}

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
  // Thinking models generate reasoning tokens before the visible answer and can take
  // several minutes on large prompts, so they get a longer per-request budget.
  const timeout = AbortSignal.timeout(config.thinkingEnabled ? 600_000 : 300_000)
  return config.signal ? AbortSignal.any([config.signal, timeout]) : timeout
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!response.ok) throw providerHttpError(response, text)
  if (text.length > MAX_RESPONSE_CHARS) throw new Error('AI provider response exceeded the size limit')
  return JSON.parse(text)
}

function providerHttpError(response: Response, text: string): Error {
  let detail = ''
  try {
    const body = JSON.parse(text) as { error?: { message?: string }; message?: string }
    detail = body?.error?.message || body?.message || ''
  } catch {
    detail = text.slice(0, 200)
  }
  return new Error(`HTTP ${response.status}${detail ? ': ' + detail : ''}`)
}

interface StreamedCompletion {
  text: string
  finishReason?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    completion_tokens_details?: { reasoning_tokens?: number }
  }
}

// Long generations (thinking + large JSON) can take several minutes. Gateway proxies in
// front of providers kill connections that stay silent for ~5 minutes (HTTP 504), so for
// known-slow providers we stream: tokens start flowing immediately and keep the
// connection alive for the whole generation.
function supportsStreaming(provider: string): boolean {
  return provider === 'deepseek' || provider === 'moonshotai'
}

async function readOpenAiStream(response: Response): Promise<StreamedCompletion> {
  const body = response.body
  if (!body) throw new Error('AI provider response had no body')
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let finishReason: string | undefined
  let usage: StreamedCompletion['usage']
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
          usage?: StreamedCompletion['usage']
        }
        const choice = chunk.choices?.[0]
        if (choice?.delta?.content) text += choice.delta.content
        if (choice?.finish_reason) finishReason = choice.finish_reason
        if (chunk.usage) usage = chunk.usage
      } catch {
        // Ignore malformed keep-alive chunks.
      }
      if (text.length > MAX_RESPONSE_CHARS) throw new Error('AI provider response exceeded the size limit')
    }
  }
  return { text, finishReason, usage }
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
  const doFetch = config.fetchFn || fetch
  const response = await doFetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': config.apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: outputTokenLimit(config, 16_384),
      temperature: 0.2,
      messages: [{ role: 'user', content }],
    }),
    signal: requestSignal(config),
  })
  const data = (await readJsonResponse(response)) as {
    content?: Array<{ type?: string; text?: string }>
    stop_reason?: string
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  return {
    text: data.content?.find((item) => item.type === 'text')?.text || '',
    model,
    finishReason: data.stop_reason,
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
  const doFetch = config.fetchFn || fetch
  const response = await doFetch(
    `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: outputTokenLimit(config, 6000),
          responseMimeType: 'application/json',
        },
      }),
      signal: requestSignal(config),
    },
  )
  const data = (await readJsonResponse(response)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  return {
    text: data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '',
    model,
    finishReason: data.candidates?.[0]?.finishReason,
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
  const isDeepseekV4 = config.provider === 'deepseek' && /deepseek-v4/.test(model)
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content }],
  }
  if (config.thinkingEnabled) {
    body.max_completion_tokens = outputTokenLimit(config, 16_384)
  } else {
    body.max_tokens = outputTokenLimit(config, 16_384)
  }
  const noTemperature = isDeepseekV4 || config.provider === 'moonshotai'
  if (!noTemperature) {
    body.temperature = 0.2
  }
  if (config.thinkingEnabled) {
    if (config.provider === 'moonshotai') {
      body.thinking = { type: 'enabled', keep: 'all' }
    } else if (isDeepseekV4) {
      body.thinking = { type: 'enabled' }
    }
    if (config.reasoningEffort) {
      body.reasoning_effort = config.reasoningEffort
    }
  } else if (isDeepseekV4) {
    body.thinking = { type: 'disabled' }
  }
  const useStream = supportsStreaming(config.provider)
  if (useStream) {
    body.stream = true
    body.stream_options = { include_usage: true }
  }
  const doFetch = config.fetchFn || fetch
  const response = await doFetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: requestSignal(config),
  })
  if (useStream && response.ok) {
    const streamed = await readOpenAiStream(response)
    const reasoning = streamed.usage?.completion_tokens_details?.reasoning_tokens || 0
    const completion = streamed.usage?.completion_tokens
    return {
      text: streamed.text,
      model,
      finishReason: streamed.finishReason,
      usage: {
        input: streamed.usage?.prompt_tokens,
        output: typeof completion === 'number' ? Math.max(0, completion - reasoning) : undefined,
        ...(reasoning > 0 ? { reasoning } : {}),
      },
    }
  }
  const data = (await readJsonResponse(response)) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      completion_tokens_details?: { reasoning_tokens?: number }
    }
  }
  const reasoning = data.usage?.completion_tokens_details?.reasoning_tokens || 0
  const completion = data.usage?.completion_tokens
  return {
    text: data.choices?.[0]?.message?.content || '',
    model,
    finishReason: data.choices?.[0]?.finish_reason,
    usage: {
      input: data.usage?.prompt_tokens,
      output: typeof completion === 'number' ? Math.max(0, completion - reasoning) : undefined,
      ...(reasoning > 0 ? { reasoning } : {}),
    },
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

async function callAiProviderWithHttpRetry(
  config: AiProviderConfig,
  prompt: string,
  images: AiImageInput[],
): Promise<AiResponse> {
  try {
    return await callAiProviderOnce(config, prompt, images)
  } catch (error: unknown) {
    if (!isRetryableProviderError(error)) throw error
    await new Promise((resolve) => setTimeout(resolve, 250))
    return callAiProviderOnce(config, prompt, images)
  }
}

export async function callAiProvider(
  config: AiProviderConfig,
  prompt: string,
  images: AiImageInput[] = [],
): Promise<AiResponse> {
  validateRequestBudget(prompt, images)
  const response = await callAiProviderWithHttpRetry(config, prompt, images)
  if (config.thinkingEnabled && (!response.text || response.finishReason === 'length')) {
    // An empty answer or a length-truncated one with thinking on almost always means
    // reasoning tokens consumed the completion budget. Degrade to a non-thinking call
    // instead of failing the entire run and discarding the tokens already spent.
    const fallback = await callAiProviderWithHttpRetry({ ...config, thinkingEnabled: false }, prompt, images)
    fallback.retriedWithoutThinking = true
    return fallback
  }
  return response
}
