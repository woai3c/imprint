import { describe, expect, test } from 'vitest'

import { hasMeaningfulDarkModeChange } from '../../src/core/analyzer/dark-mode-detect.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

describe('dark mode validation', () => {
  test('accepts a page-level light-to-dark surface change', () => {
    const light = createExtractedStyles({
      usageCount: {
        'bgArea:rgb(255, 255, 255)': 1,
        'textColor:rgb(25, 27, 31)': 20,
      },
    })
    const dark = createExtractedStyles({
      usageCount: {
        'bgArea:rgb(22, 23, 29)': 1,
        'textColor:rgb(245, 245, 245)': 20,
      },
    })

    expect(hasMeaningfulDarkModeChange(light, dark)).toBe(true)
  })

  test('rejects a dark selector that only changes a small accent', () => {
    const light = createExtractedStyles({
      usageCount: {
        'bgArea:rgb(255, 255, 255)': 1,
        'textColor:rgb(25, 27, 31)': 20,
        'accentColor:rgb(23, 114, 246)': 1,
      },
    })
    const unchanged = createExtractedStyles({
      usageCount: {
        'bgArea:rgb(255, 255, 255)': 1,
        'textColor:rgb(25, 27, 31)': 20,
        'accentColor:rgb(85, 142, 255)': 1,
      },
    })

    expect(hasMeaningfulDarkModeChange(light, unchanged)).toBe(false)
  })
})
