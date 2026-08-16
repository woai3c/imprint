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

describe('settings persistence', () => {
  it('drops obsolete fields while preserving supported preferences', () => {
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({
        provider: 'legacy-provider',
        apiKey: 'legacy-secret',
        proxyServer: 'http://127.0.0.1:7890',
        analysisDepth: 'deep',
        validationScenario: 'pricing',
        analysisPageCount: 9,
      }),
    )

    expect(getSettings()).toEqual({
      analysisDepth: 'deep',
      exportFormat: 'markdown',
      proxyServer: 'http://127.0.0.1:7890',
      language: '',
      colorMode: '',
      themePreference: '',
      validationScenario: 'pricing',
      analysisPageCount: 5,
    })
    const persisted = JSON.parse(fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8'))
    expect(persisted).not.toHaveProperty('provider')
    expect(persisted).not.toHaveProperty('apiKey')
  })

  it('normalizes and persists supported settings only', () => {
    const settings = saveSettings({
      analysisDepth: 'deep',
      analysisPageCount: 0,
      exportFormat: 'json',
      validationScenario: 'content-feed',
    })
    const persisted = JSON.parse(fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8'))

    expect(settings.analysisPageCount).toBe(3)
    expect(settings.validationScenario).toBe('content-feed')
    expect(persisted).toEqual(settings)
    expect(persisted).not.toHaveProperty('provider')
    expect(persisted).not.toHaveProperty('apiKeys')
  })
})
