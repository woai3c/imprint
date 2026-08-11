import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getSettings, saveSettings } from '../../src/main/settings.js'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.env.IMPRINT_SETTINGS_TEST_DIR || '',
  },
}))

let settingsDir = ''

beforeEach(() => {
  settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-settings-test-'))
  process.env.IMPRINT_SETTINGS_TEST_DIR = settingsDir
})

afterEach(() => {
  delete process.env.IMPRINT_SETTINGS_TEST_DIR
  fs.rmSync(settingsDir, { recursive: true, force: true })
})

describe('settings API keys', () => {
  it('migrates the legacy key to its selected provider', () => {
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({ provider: 'deepseek', apiKey: 'legacy-deepseek-key' }),
    )

    const settings = getSettings()

    expect(settings.apiKeys).toEqual({ deepseek: 'legacy-deepseek-key' })
    expect(settings).not.toHaveProperty('apiKey')

    saveSettings({ apiKeys: { openai: 'openai-key' } })
    const persisted = JSON.parse(fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8'))
    expect(persisted.apiKeys).toEqual({ deepseek: 'legacy-deepseek-key', openai: 'openai-key' })
    expect(persisted).not.toHaveProperty('apiKey')
  })

  it('keeps and clears keys independently by provider', () => {
    saveSettings({ provider: 'deepseek', apiKeys: { deepseek: 'deepseek-key' } })
    const switched = saveSettings({ provider: 'openai' })

    expect(switched.apiKeys.openai).toBeUndefined()
    expect(switched.apiKeys.deepseek).toBe('deepseek-key')

    saveSettings({ apiKeys: { openai: 'openai-key' } })
    const cleared = saveSettings({ provider: 'deepseek', apiKeys: { deepseek: '' } })
    expect(cleared.apiKeys.deepseek).toBeUndefined()
    expect(cleared.apiKeys.openai).toBe('openai-key')
  })
})
