import { describe, expect, it } from 'vitest'

import { getDefaultModel, resolveAiModelCapabilities, resolveEffectiveModel } from '../../src/core/ai/capabilities.js'
import { MODEL_CATALOG, getCatalogModel, getRecommendedModel } from '../../src/core/ai/model-catalog.js'

const CATALOG_PROVIDERS = ['openai', 'anthropic', 'google', 'deepseek', 'moonshotai', 'alibaba', 'zhipu', 'xai']

describe('model catalog', () => {
  it('covers every non-custom provider with at least one model', () => {
    for (const provider of CATALOG_PROVIDERS) {
      expect(MODEL_CATALOG[provider]?.length, provider).toBeGreaterThan(0)
    }
    expect(MODEL_CATALOG.custom).toBeUndefined()
  })

  it('keeps unique model IDs and exactly one recommended model per provider', () => {
    for (const [provider, models] of Object.entries(MODEL_CATALOG)) {
      const ids = models.map((entry) => entry.id)
      expect(new Set(ids).size, provider).toBe(ids.length)
      expect(models.filter((entry) => entry.recommended).length, provider).toBe(1)
      for (const entry of models) {
        expect(entry.label.trim(), `${provider}:${entry.id}`).not.toBe('')
        expect(entry.price.trim(), `${provider}:${entry.id}`).not.toBe('')
      }
    }
  })

  it('excludes retired and same-price previous-generation models', () => {
    const allIds = Object.values(MODEL_CATALOG)
      .flat()
      .map((entry) => entry.id)
    for (const retired of [
      'deepseek-chat',
      'deepseek-reasoner',
      'gpt-5.5',
      'claude-opus-4-8',
      'claude-sonnet-4-6',
      'glm-5.1',
    ]) {
      expect(allIds).not.toContain(retired)
    }
  })

  it('resolves provider defaults to the recommended catalog model', () => {
    for (const provider of CATALOG_PROVIDERS) {
      expect(getDefaultModel(provider)).toBe(getRecommendedModel(provider)?.id)
    }
    expect(getDefaultModel('custom')).toBe('')
  })

  it('takes vision capability from the catalog for listed models', () => {
    expect(resolveAiModelCapabilities('moonshotai', 'kimi-k3').vision).toBe(true)
    expect(resolveAiModelCapabilities('moonshotai', 'kimi-k3').imageInputMethod).toBe('inline-base64')
    expect(resolveAiModelCapabilities('deepseek', 'deepseek-v4-flash').vision).toBe(false)
    expect(resolveAiModelCapabilities('zhipu', 'glm-5v-turbo').vision).toBe(true)
    expect(resolveAiModelCapabilities('zhipu', 'glm-5.2').vision).toBe(false)
  })

  it('falls back to name heuristics for models outside the catalog', () => {
    expect(resolveAiModelCapabilities('openai', 'gpt-4o').vision).toBe(true)
    expect(resolveAiModelCapabilities('custom', 'anything', true).vision).toBe(true)
    expect(resolveAiModelCapabilities('custom', 'anything', false).vision).toBe(false)
    expect(getCatalogModel('openai', 'gpt-4o')).toBeNull()
  })

  it('migrates retired saved models to the recommended model, except for custom', () => {
    expect(resolveEffectiveModel('deepseek', 'deepseek-chat')).toBe('deepseek-v4-flash')
    expect(resolveEffectiveModel('deepseek', 'deepseek-v4-pro')).toBe('deepseek-v4-pro')
    expect(resolveEffectiveModel('deepseek', '')).toBe('deepseek-v4-flash')
    expect(resolveEffectiveModel('custom', 'my-internal-model')).toBe('my-internal-model')
  })
})
