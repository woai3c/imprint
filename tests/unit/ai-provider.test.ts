import { describe, expect, it } from 'vitest'

import { aiPipelineTimeoutMs, aiRequestTimeoutMs, callAiProvider } from '../../src/core/ai/provider.js'

function sseResponse(
  chunks: Array<{
    content?: string
    reasoningContent?: string
    finishReason?: string
    usage?: Record<string, unknown>
  }>,
): Response {
  const lines = chunks.map((chunk) => {
    const payload: Record<string, unknown> = {
      choices: [
        {
          delta: {
            content: chunk.content || '',
            ...(chunk.reasoningContent ? { reasoning_content: chunk.reasoningContent } : {}),
          },
          finish_reason: chunk.finishReason || null,
        },
      ],
    }
    if (chunk.usage) payload.usage = chunk.usage
    return `data: ${JSON.stringify(payload)}\n\n`
  })
  return new Response(`${lines.join('')}data: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

describe('AI provider output budgets', () => {
  it('gives thinking requests a full ten-minute request budget plus pipeline grace', () => {
    expect(aiRequestTimeoutMs(false)).toBe(300_000)
    expect(aiPipelineTimeoutMs(false)).toBe(330_000)
    expect(aiRequestTimeoutMs(true)).toBe(600_000)
    expect(aiPipelineTimeoutMs(true)).toBe(630_000)
  })

  it('reports the real HTTP attempt count when a retry succeeds', async () => {
    let calls = 0
    const response = await callAiProvider(
      {
        provider: 'custom',
        apiKey: 'test-key',
        baseUrl: 'https://provider.example/v1',
        model: 'test-model',
        fetchFn: async () => {
          calls += 1
          if (calls === 1) return new Response('temporary failure', { status: 503 })
          return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        },
      },
      'Return JSON',
    )

    expect(calls).toBe(2)
    expect(response.transportAttempts).toBe(2)
    expect(response.transportMs).toBeGreaterThanOrEqual(0)
  })

  it('attaches the real attempt count when both HTTP attempts fail', async () => {
    let calls = 0
    const request = callAiProvider(
      {
        provider: 'custom',
        apiKey: 'test-key',
        baseUrl: 'https://provider.example/v1',
        model: 'test-model',
        fetchFn: async () => {
          calls += 1
          return new Response('temporary failure', { status: 503 })
        },
      },
      'Return JSON',
    )

    await expect(request).rejects.toMatchObject({ transportAttempts: 2 })
    expect(calls).toBe(2)
  })

  it('applies the per-pass output token limit to compatible providers', async () => {
    let requestBody: Record<string, unknown> | undefined
    const response = await callAiProvider(
      {
        provider: 'custom',
        apiKey: 'test-key',
        baseUrl: 'https://provider.example/v1',
        model: 'test-model',
        maxOutputTokens: 4096,
        fetchFn: async (_input, init) => {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"ok":true}' } }],
              usage: { prompt_tokens: 10, completion_tokens: 3 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        },
      },
      'Return JSON',
    )

    expect(requestBody?.max_tokens).toBe(4096)
    expect(response.usage).toEqual({ input: 10, output: 3 })
  })

  it('omits reasoning_effort and disables thinking for deepseek-v4 when thinking is off', async () => {
    let requestBody: Record<string, unknown> | undefined
    await callAiProvider(
      {
        provider: 'deepseek',
        apiKey: 'test-key',
        baseUrl: 'https://provider.example/v1',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'medium',
        thinkingEnabled: false,
        fetchFn: async (_input, init) => {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
          return sseResponse([{ content: '{"ok":true}', finishReason: 'stop' }])
        },
      },
      'Return JSON',
    )

    expect(requestBody?.thinking).toEqual({ type: 'disabled' })
    expect(requestBody).not.toHaveProperty('reasoning_effort')
    expect(requestBody).toHaveProperty('max_tokens')
    expect(requestBody?.stream).toBe(true)
  })

  it('sends reasoning_effort and enlarged completion budget when thinking is on', async () => {
    let requestBody: Record<string, unknown> | undefined
    await callAiProvider(
      {
        provider: 'deepseek',
        apiKey: 'test-key',
        baseUrl: 'https://provider.example/v1',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'medium',
        thinkingEnabled: true,
        maxOutputTokens: 8192,
        fetchFn: async (_input, init) => {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
          return sseResponse([{ content: '{"ok":true}', finishReason: 'stop' }])
        },
      },
      'Return JSON',
    )

    expect(requestBody?.thinking).toEqual({ type: 'enabled' })
    expect(requestBody?.reasoning_effort).toBe('medium')
    // Requested visible budget plus the reasoning reserve.
    expect(requestBody?.max_completion_tokens).toBe(8192 + 16384)
    expect(requestBody).not.toHaveProperty('max_tokens')
  })

  it('excludes reasoning tokens from the reported output usage', async () => {
    const response = await callAiProvider(
      {
        provider: 'deepseek',
        apiKey: 'test-key',
        baseUrl: 'https://provider.example/v1',
        model: 'deepseek-v4-flash',
        thinkingEnabled: true,
        fetchFn: async () =>
          sseResponse([
            { content: '{"ok":', finishReason: undefined },
            {
              content: 'true}',
              finishReason: 'stop',
              usage: {
                prompt_tokens: 100,
                completion_tokens: 8192,
                completion_tokens_details: { reasoning_tokens: 8000 },
              },
            },
          ]),
      },
      'Return JSON',
    )

    expect(response.text).toBe('{"ok":true}')
    expect(response.finishReason).toBe('stop')
    expect(response.usage).toEqual({ input: 100, output: 192, reasoning: 8000 })
  })

  it('reports streaming progress without exposing reasoning or response content', async () => {
    const progress: Array<{ eventCount: number; contentChars: number; reasoningChars: number }> = []
    await callAiProvider(
      {
        provider: 'moonshotai',
        apiKey: 'test-key',
        baseUrl: 'https://provider.example/v1',
        model: 'kimi-k3',
        thinkingEnabled: true,
        onStreamProgress: (item) => progress.push(item),
        fetchFn: async () =>
          sseResponse([{ reasoningContent: 'private reasoning' }, { content: '{"ok":true}', finishReason: 'stop' }]),
      },
      'Return JSON',
    )

    expect(progress.at(-1)).toEqual({ eventCount: 2, reasoningChars: 17, contentChars: 11 })
    expect(progress.at(-1)).not.toHaveProperty('content')
    expect(progress.at(-1)).not.toHaveProperty('reasoningContent')
  })

  it('retries with thinking disabled when a thinking call returns empty content', async () => {
    const requestBodies: Record<string, unknown>[] = []
    const response = await callAiProvider(
      {
        provider: 'deepseek',
        apiKey: 'test-key',
        baseUrl: 'https://provider.example/v1',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'medium',
        thinkingEnabled: true,
        fetchFn: async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>
          requestBodies.push(body)
          const empty = requestBodies.length === 1
          return sseResponse([
            {
              content: empty ? '' : '{"ok":true}',
              finishReason: empty ? 'length' : 'stop',
              usage: {
                prompt_tokens: 100,
                completion_tokens: 8192,
                ...(empty ? { completion_tokens_details: { reasoning_tokens: 8192 } } : {}),
              },
            },
          ])
        },
      },
      'Return JSON',
    )

    expect(requestBodies).toHaveLength(2)
    expect(requestBodies[0]?.thinking).toEqual({ type: 'enabled' })
    expect(requestBodies[0]).toHaveProperty('max_completion_tokens')
    expect(requestBodies[1]?.thinking).toEqual({ type: 'disabled' })
    expect(requestBodies[1]).not.toHaveProperty('reasoning_effort')
    expect(requestBodies[1]).toHaveProperty('max_tokens')
    expect(response.text).toBe('{"ok":true}')
    expect(response.retriedWithoutThinking).toBe(true)
  })

  it('retries with thinking disabled when a thinking call is truncated at the length limit', async () => {
    const requestBodies: Record<string, unknown>[] = []
    const response = await callAiProvider(
      {
        provider: 'moonshotai',
        apiKey: 'test-key',
        baseUrl: 'https://provider.example/v1',
        model: 'kimi-k3',
        thinkingEnabled: true,
        fetchFn: async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>
          requestBodies.push(body)
          const truncated = requestBodies.length === 1
          return sseResponse([
            {
              content: truncated ? '{"schemaVersion":"1","thesis":{' : '{"ok":true}',
              finishReason: truncated ? 'length' : 'stop',
              usage: {
                prompt_tokens: 29024,
                completion_tokens: 2202,
                ...(truncated ? { completion_tokens_details: { reasoning_tokens: 22374 } } : {}),
              },
            },
          ])
        },
      },
      'Return JSON',
    )

    expect(requestBodies).toHaveLength(2)
    expect(requestBodies[0]?.thinking).toEqual({ type: 'enabled', keep: 'all' })
    expect(requestBodies[1]?.thinking).toBeUndefined()
    expect(requestBodies[1]).toHaveProperty('max_tokens')
    expect(response.text).toBe('{"ok":true}')
    expect(response.retriedWithoutThinking).toBe(true)
  })

  it('does not retry empty content when thinking is already off', async () => {
    let calls = 0
    const response = await callAiProvider(
      {
        provider: 'deepseek',
        apiKey: 'test-key',
        baseUrl: 'https://provider.example/v1',
        model: 'deepseek-v4-flash',
        thinkingEnabled: false,
        fetchFn: async () => {
          calls++
          return sseResponse([{ content: '', finishReason: 'length' }])
        },
      },
      'Return JSON',
    )

    expect(calls).toBe(1)
    expect(response.text).toBe('')
    expect(response.retriedWithoutThinking).toBeUndefined()
  })

  it('allows latency-sensitive callers to disable the automatic thinking fallback', async () => {
    let calls = 0
    const response = await callAiProvider(
      {
        provider: 'deepseek',
        apiKey: 'test-key',
        baseUrl: 'https://provider.example/v1',
        model: 'deepseek-v4-flash',
        thinkingEnabled: true,
        allowThinkingFallback: false,
        fetchFn: async () => {
          calls++
          return sseResponse([{ content: '', finishReason: 'length' }])
        },
      },
      'Return JSON',
    )

    expect(calls).toBe(1)
    expect(response.text).toBe('')
    expect(response.retriedWithoutThinking).toBeUndefined()
  })
})
