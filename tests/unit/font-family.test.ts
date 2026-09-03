import { describe, expect, test } from 'vitest'

import {
  cssGenericFontFamilies,
  normalizeCssFontFamilyList,
  normalizeCssFontFamilyName,
  parseCssFontFamilyList,
} from '../../src/core/analyzer/font-family.js'

describe('CSS font-family parsing', () => {
  test('normalizes quoted and escaped commas to the same atomic family', () => {
    expect(normalizeCssFontFamilyList('"Foo, Bar", sans-serif')).toBe(
      normalizeCssFontFamilyList('Foo\\, Bar, sans-serif'),
    )
    expect(parseCssFontFamilyList('Foo\\, Bar, sans-serif').map((family) => family.name)).toEqual([
      'Foo, Bar',
      'sans-serif',
    ])
  })

  test('normalizes escaped spaces and CSS hexadecimal escapes', () => {
    expect(normalizeCssFontFamilyName('"Open Sans"')).toBe(normalizeCssFontFamilyName('Open\\ Sans'))
    expect(normalizeCssFontFamilyName('serif')).toBe(normalizeCssFontFamilyName('s\\65 rif'))
    expect(cssGenericFontFamilies('s\\65 rif')).toEqual(['serif'])
  })

  test('keeps a quoted generic word as a custom family', () => {
    expect(normalizeCssFontFamilyName('"serif"')).not.toBe(normalizeCssFontFamilyName('s\\65 rif'))
    expect(cssGenericFontFamilies('"serif"')).toEqual([])
  })
})
