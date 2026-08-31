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
    expect(merged.usageGroupCounts).toEqual({
      'radius:12px': 1,
      'radius:4px': 1,
      'radius:8px': 1,
    })
  })

  test('caps each URL and color-role family to one normalized vote', () => {
    const observation = (captureId: string, elementRef: string, foreground: string) => ({
      captureId,
      elementRef,
      elementKind: 'button' as const,
      role: 'primary-action' as const,
      background: 'rgb(0, 87, 217)',
      foreground,
    })
    const merged = mergeStylesWithNormalizedUsage(
      [
        createExtractedStyles({
          colorRoleObservations: [
            observation('home|desktop', 'main > button.primary', 'rgb(17, 24, 39)'),
            observation('home|desktop', 'main > button.primary', 'rgb(17, 24, 39)'),
          ],
        }),
        createExtractedStyles({
          colorRoleObservations: [
            observation('home|mobile', 'nav > button.primary', 'rgb(17, 24, 39)'),
            observation('home|mobile', 'main > a.primary', 'rgb(17, 24, 39)'),
          ],
        }),
        createExtractedStyles({
          colorRoleObservations: [
            observation('docs|desktop', 'main > button.primary', 'rgb(255, 255, 255)'),
            observation('docs|desktop', 'aside > button.primary', 'rgb(255, 255, 255)'),
          ],
        }),
      ],
      ['https://example.com/', 'https://example.com/', 'https://example.com/docs'],
    )

    const dark = merged.colorRoleObservations!.filter((observation) => observation.foreground === 'rgb(17, 24, 39)')
    const light = merged.colorRoleObservations!.filter((observation) => observation.foreground === 'rgb(255, 255, 255)')
    expect(dark).toHaveLength(3)
    expect(dark.every((observation) => observation.selectionGroup === 'https://example.com/')).toBe(true)
    expect(dark.reduce((sum, observation) => sum + observation.selectionWeight!, 0)).toBe(1)
    expect(light).toHaveLength(2)
    expect(light.every((observation) => observation.selectionGroup === 'https://example.com/docs')).toBe(true)
    expect(light.reduce((sum, observation) => sum + observation.selectionWeight!, 0)).toBe(1)
    expect(merged.colorRoleObservations?.map((observation) => observation.captureId)).toEqual([
      'home|desktop',
      'home|mobile',
      'home|mobile',
      'docs|desktop',
      'docs|desktop',
    ])
  })

  test('normalizes each text-pair capture before averaging repeated URL viewports', () => {
    const pair = (captureId: string, foreground: string, count: number) => ({
      captureId,
      background: 'rgb(255, 255, 255)',
      foreground,
      textRole: 'body' as const,
      count,
    })
    const merged = mergeStylesWithNormalizedUsage(
      [
        createExtractedStyles({ textColorPairObservations: [pair('home|desktop', 'rgb(17, 24, 39)', 1)] }),
        createExtractedStyles({ textColorPairObservations: [pair('home|mobile', 'rgb(17, 24, 39)', 1_000)] }),
        createExtractedStyles({ textColorPairObservations: [pair('docs|desktop', 'rgb(34, 34, 34)', 10)] }),
      ],
      ['https://example.com/', 'https://example.com/', 'https://example.com/docs'],
    )

    expect(merged.textColorPairObservations).toEqual([
      expect.objectContaining({ captureId: 'https://example.com/', count: 1 }),
      expect.objectContaining({ captureId: 'https://example.com/docs', count: 1 }),
    ])
  })

  test('averages value-source counts across repeated viewports of one URL', () => {
    const capture = createExtractedStyles({
      usageCount: { 'spacing:8px': 2, 'radius:8px': 2 },
      valueSourceCounts: {
        'spacing:8px': { 'element:content-spacing': 1, 'element:control-spacing': 1 },
        'radius:8px': { 'computed:ordinary-radius': 1, 'geometry:circle-or-pill': 1 },
      },
    })
    const merged = mergeStylesWithNormalizedUsage(
      [capture, structuredClone(capture)],
      ['https://example.com/', 'https://example.com/'],
    )

    expect(merged.valueSourceCounts).toEqual({
      'radius:8px': { 'computed:ordinary-radius': 1, 'geometry:circle-or-pill': 1 },
      'spacing:8px': { 'element:content-spacing': 1, 'element:control-spacing': 1 },
    })
  })

  test('unions normalized length aliases before counting URL-group support', () => {
    const merged = mergeStylesWithNormalizedUsage(
      [
        createExtractedStyles({ usageCount: { 'spacing:0.96px': 60, 'spacing:1px': 40 } }),
        createExtractedStyles({ usageCount: { 'spacing:1px': 100 } }),
      ],
      ['https://example.com/', 'https://example.com/'],
    )

    expect(merged.usageCount['spacing:1px']).toBeCloseTo(1)
    expect(merged.usageCount).not.toHaveProperty('spacing:0.96px')
    expect(merged.usageGroupCounts).toEqual({ 'spacing:1px': 1 })
  })
})
