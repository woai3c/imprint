import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { saveSettings } from '../../src/main/settings.js'

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
  it('normalizes and persists supported settings only', () => {
    const settings = saveSettings({
      analysisDepth: 'deep',
      analysisPageCount: 0,
      validationScenario: 'content-feed',
    })
    const persisted = JSON.parse(fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8'))

    expect(settings.analysisPageCount).toBe(3)
    expect(settings.validationScenario).toBe('content-feed')
    expect(persisted).toEqual(settings)
  })
})
