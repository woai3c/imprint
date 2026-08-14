import { afterEach, describe, expect, test, vi } from 'vitest'

import en from '../../src/renderer/i18n/locales/en.json' with { type: 'json' }
import zhCN from '../../src/renderer/i18n/locales/zh-CN.json' with { type: 'json' }
import type { AppTheme } from '../../src/renderer/stores/skin-store.js'

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key))
}

function normalizePluralKey(key: string): string {
  return key.replace(/_(?:zero|one|two|few|many|other)$/u, '')
}

describe('renderer i18n', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('keeps locale catalogs aligned after accounting for locale-specific plural forms', () => {
    const englishKeys = [...new Set(leafKeys(en).map(normalizePluralKey))].sort()
    const chineseKeys = [...new Set(leafKeys(zhCN).map(normalizePluralKey))].sort()

    expect(chineseKeys).toEqual(englishKeys)
  })

  test('provides complete localized identity metadata for every built-in theme', () => {
    const themeIds = ['default', 'chinese-landscape', 'cyberpunk', 'nordic', 'glassmorphism', 'dunhuang', 'blueprint']
    for (const id of themeIds) {
      for (const locale of [en, zhCN]) {
        const preset = locale.themes.presets[id as keyof typeof locale.themes.presets]
        expect(preset.name).toBeTruthy()
        expect(preset.description).toBeTruthy()
        expect(preset.values).toHaveLength(3)
        expect(preset.patterns).toHaveLength(3)
        expect(preset.evidence).toHaveLength(3)
      }
    }
  })

  test('renders Theme Library Markdown framework copy from the selected locale', async () => {
    vi.stubGlobal('window', { electronAPI: { initialSettings: {} } })
    const { builtinThemes, generateThemeMarkdown } = await import('../../src/renderer/stores/skin-store.js')
    const theme = builtinThemes[0]
    const localized = (locale: typeof en | typeof zhCN): AppTheme => {
      const preset = locale.themes.presets.default
      return {
        ...theme,
        name: preset.name,
        description: preset.description,
        identity: {
          values: preset.values as AppTheme['identity']['values'],
          patterns: preset.patterns as AppTheme['identity']['patterns'],
          evidence: preset.evidence as AppTheme['identity']['evidence'],
        },
      }
    }

    const english = generateThemeMarkdown(localized(en), 'en')
    const chinese = generateThemeMarkdown(localized(zhCN), 'zh-CN')

    expect(english).toContain('## Design principles')
    expect(english).toContain('### Token usage reference')
    expect(chinese).toContain('## 设计原则')
    expect(chinese).toContain('### 令牌使用速查')
    expect(english).not.toContain('themeExport.')
    expect(chinese).not.toContain('themeExport.')
  })
})
