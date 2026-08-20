import { describe, expect, test } from 'vitest'

import { coreT } from '../../src/core/i18n/index.js'
import en from '../../src/core/i18n/locales/en.json' with { type: 'json' }
import zhCN from '../../src/core/i18n/locales/zh-CN.json' with { type: 'json' }

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key))
}

describe('core i18n', () => {
  test('keeps English and Chinese catalogs structurally aligned', () => {
    expect(leafKeys(zhCN).sort()).toEqual(leafKeys(en).sort())
  })

  test('interpolates export copy without leaking message keys', () => {
    expect(coreT('en', 'export.reconstruction.siteScope', { title: 'Example', pageCount: 3 })).toBe(
      'This analysis covers 3 observed pages from Example.',
    )
    expect(coreT('zh-CN', 'export.reconstruction.siteScope', { title: '示例', pageCount: 3 })).toBe(
      '本次分析覆盖 示例 的 3 个已观察页面。',
    )
  })
})
