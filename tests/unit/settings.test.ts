import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getSettings, saveSettings } from '../../src/main/settings.js'

vi.mock('electron', () => ({
  app: {
    getLocale: () => process.env.IMPRINT_SETTINGS_TEST_LOCALE || 'en-US',
    getPath: () => process.env.IMPRINT_SETTINGS_TEST_DIR || '',
  },
}))

let settingsDir = ''

beforeEach(() => {
  settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-settings-test-'))
  process.env.IMPRINT_SETTINGS_TEST_DIR = settingsDir
  process.env.IMPRINT_SETTINGS_TEST_LOCALE = 'en-US'
})

afterEach(() => {
  delete process.env.IMPRINT_SETTINGS_TEST_DIR
  delete process.env.IMPRINT_SETTINGS_TEST_LOCALE
  fs.rmSync(settingsDir, { recursive: true, force: true })
})

describe('settings persistence', () => {
  it('normalizes and persists supported settings only', () => {
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({ analysisDepth: 'standard', analysisPageCount: 4 }),
    )
    const settings = saveSettings({
      analysisDepth: 'deep',
      validationScenario: 'content-feed',
    })
    const persisted = JSON.parse(fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8'))

    expect(settings.analysisPageCount).toBe(4)
    expect(settings.validationScenario).toBe('content-feed')
    expect(persisted).toEqual(settings)
  })

  it('keeps the page limit inside the supported range', () => {
    expect(saveSettings({ analysisPageCount: 20 }).analysisPageCount).toBe(20)
    expect(saveSettings({ analysisPageCount: 250 }).analysisPageCount).toBe(20)
    expect(saveSettings({ analysisPageCount: 0 }).analysisPageCount).toBe(8)
  })

  it('detects and persists the system language only when no preference exists', () => {
    process.env.IMPRINT_SETTINGS_TEST_LOCALE = 'zh-CN'
    expect(getSettings().language).toBe('zh-CN')

    process.env.IMPRINT_SETTINGS_TEST_LOCALE = 'en-US'
    expect(getSettings().language).toBe('zh-CN')
    expect(JSON.parse(fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8')).language).toBe('zh-CN')
  })

  it('keeps an explicit language preference when the system language changes', () => {
    expect(saveSettings({ language: 'en' }).language).toBe('en')

    process.env.IMPRINT_SETTINGS_TEST_LOCALE = 'zh-CN'
    expect(getSettings().language).toBe('en')
  })
})
