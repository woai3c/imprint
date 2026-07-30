import { describe, expect, it } from 'vitest'

import { buildVisionPromptSuffix, resolveAgentCliCapabilities } from '../../src/main/agent-enhancer.js'

describe('Agent CLI vision attachments', () => {
  it('declares vision capability for whitelisted CLIs only', () => {
    for (const command of ['xc', 'claude', 'codex', 'opencode', 'gemini', 'kimi']) {
      expect(resolveAgentCliCapabilities(command).vision).toBe(true)
    }
    expect(resolveAgentCliCapabilities('unknown-cli').vision).toBe(false)
  })

  it('builds a language-aware attachment suffix with a self-check requirement', () => {
    const en = buildVisionPromptSuffix([{ name: 'image-a.png' }, { name: 'image-b.png' }], 'en')
    expect(en).toContain('./image-a.png')
    expect(en).toContain('./image-b.png')
    expect(en).toContain('imageObservations')

    const zh = buildVisionPromptSuffix([{ name: 'image-a.png' }], 'zh-CN')
    expect(zh).toContain('./image-a.png')
    expect(zh).toContain('imageObservations')
    expect(zh).toContain('证据截图')
  })
})
