import { describe, expect, it } from 'vitest'

import { callAiProvider } from '../../src/core/ai/provider.js'

describe('AI provider output budgets', () => {
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
})
