import { describe, expect, test } from 'vitest'

import { mergeStyles, mergeStylesWithNormalizedUsage } from '../../src/core/analyzer/style-merge.js'
import { colorFrequency, frequencyForCategory, sortByFrequency } from '../../src/core/analyzer/usage-stats.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

describe('usage statistics', () => {
  test('deduplicates role observations within a capture while preserving locator collisions across captures', () => {
    const shared = {
      elementRef: 'body > button:nth-of-type(1)',
      elementKind: 'button' as const,
      role: 'action' as const,
      foreground: 'rgb(255, 255, 255)',
      background: 'rgb(21, 94, 239)',
    }
    const merged = mergeStyles([
      createExtractedStyles({
        colorRoleObservations: [
          { ...shared, captureId: 'https://example.com|1440x900' },
          { ...shared, captureId: 'https://example.com|1440x900' },
        ],
      }),
      createExtractedStyles({
        colorRoleObservations: [{ ...shared, captureId: 'https://example.com|375x812' }],
      }),
    ])

    expect(merged.colorRoleObservations).toHaveLength(2)
  })

  test('aggregates repeated text and background pair observations within one capture', () => {
    const pair = {
      captureId: 'https://example.com|1440x900',
      background: 'rgb(255, 255, 255)',
      foreground: 'rgb(17, 24, 39)',
      textRole: 'body' as const,
    }
    const merged = mergeStyles([
      createExtractedStyles({ textColorPairObservations: [{ ...pair, count: 2 }] }),
      createExtractedStyles({ textColorPairObservations: [{ ...pair, count: 3 }] }),
    ])

    expect(merged.textColorPairObservations).toEqual([{ ...pair, count: 5 }])
  })
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

  test('sums per-source value counts while retaining the compatibility source set', () => {
    const merged = mergeStyles([
      createExtractedStyles({
        valueSources: { 'spacing:8px': ['element:control-spacing'] },
        valueSourceCounts: { 'spacing:8px': { 'element:control-spacing': 4 } },
      }),
      createExtractedStyles({
        valueSources: { 'spacing:8px': ['element:control-spacing', 'element:content-spacing'] },
        valueSourceCounts: {
          'spacing:8px': { 'element:control-spacing': 3, 'element:content-spacing': 2 },
        },
      }),
    ])

    expect(merged.valueSources?.['spacing:8px']).toEqual(['element:control-spacing', 'element:content-spacing'])
    expect(merged.valueSourceCounts?.['spacing:8px']).toEqual({
      'element:control-spacing': 7,
      'element:content-spacing': 2,
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

  test('gives repeated viewports of one URL a single vote in token selection', () => {
    const merged = mergeStylesWithNormalizedUsage(
      [
        createExtractedStyles({ usageCount: { 'radius:4px': 100 } }),
        createExtractedStyles({ usageCount: { 'radius:4px': 80, 'radius:8px': 20 } }),
        createExtractedStyles({ usageCount: { 'radius:12px': 100 } }),
      ],
      ['https://example.com/', 'https://example.com/', 'https://example.com/pricing'],
    )

    expect(merged.usageCount['radius:4px']).toBeCloseTo(0.9)
    expect(merged.usageCount['radius:8px']).toBeCloseTo(0.1)
    expect(merged.usageCount['radius:12px']).toBeCloseTo(1)
  })
})
