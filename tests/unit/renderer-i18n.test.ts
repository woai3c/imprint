import { describe, expect, test } from 'vitest'

import en from '../../src/renderer/i18n/locales/en.json' with { type: 'json' }
import zhCN from '../../src/renderer/i18n/locales/zh-CN.json' with { type: 'json' }

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key))
}

function normalizePluralKey(key: string): string {
  return key.replace(/_(?:zero|one|two|few|many|other)$/u, '')
}

describe('renderer i18n', () => {
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
})
