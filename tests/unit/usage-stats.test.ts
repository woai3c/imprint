import { describe, expect, test } from 'vitest'

import { mergeStyles, mergeStylesWithNormalizedUsage } from '../../src/core/analyzer/style-merge.js'
import { colorFrequency, frequencyForCategory, sortByFrequency } from '../../src/core/analyzer/usage-stats.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

describe('usage statistics', () => {
  test('uses category counts instead of deduplicated fallback arrays', () => {
    const styles = createExtractedStyles({
      fontSizes: ['12px', '16px'],
      usageCount: {
        'fontSize:12px': 2,
        'fontSize:16px': 20,
      },
    })

    const frequency = frequencyForCategory(styles, 'fontSize', styles.fontSizes)

    expect(sortByFrequency(frequency)).toEqual(['16px', '12px'])
  })

  test('sums color usage across text, background, and border contexts', () => {
    const frequency = colorFrequency(['rgb(37, 99, 235)', 'rgb(245, 158, 11)'], {
      'textColor:rgb(37, 99, 235)': 4,
      'bgColor:rgb(37, 99, 235)': 30,
      'borderColor:rgb(37, 99, 235)': 2,
      'bgColor:rgb(245, 158, 11)': 3,
    })

    expect(frequency.get('rgb(37, 99, 235)')).toBe(36)
    expect(frequency.get('rgb(245, 158, 11)')).toBe(3)
  })

  test('preserves merged counts while keeping compact value arrays', () => {
    const merged = mergeStyles([
      createExtractedStyles({
        fontSizes: ['16px', '24px'],
        usageCount: { 'fontSize:16px': 8, 'fontSize:24px': 2 },
      }),
      createExtractedStyles({
        fontSizes: ['16px', '32px'],
        usageCount: { 'fontSize:16px': 5, 'fontSize:32px': 1 },
      }),
    ])

    expect(merged.fontSizes).toEqual(['16px', '24px', '32px'])
    expect(merged.usageCount).toMatchObject({
      'fontSize:16px': 13,
      'fontSize:24px': 2,
      'fontSize:32px': 1,
    })
  })

  test('normalizes each capture before combining token-selection frequencies', () => {
    const merged = mergeStylesWithNormalizedUsage([
      createExtractedStyles({ usageCount: { 'fontSize:16px': 10 } }),
      createExtractedStyles({ usageCount: { 'fontSize:12px': 900, 'fontSize:16px': 100 } }),
    ])

    expect(merged.usageCount['fontSize:16px']).toBeCloseTo(1.1)
    expect(merged.usageCount['fontSize:12px']).toBeCloseTo(0.9)
  })
})
