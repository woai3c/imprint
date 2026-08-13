import { describe, expect, test } from 'vitest'

import { clusterColors, normalizeColorValue } from '../../src/core/analyzer/color-cluster.js'

describe('color clustering', () => {
  test('normalizes opaque colors without discarding observed alpha', () => {
    expect(normalizeColorValue('rgb(23, 114, 246)')).toBe('#1772f6')
    expect(normalizeColorValue('rgba(23, 114, 246, 0.5)')).toBe('rgba(23, 114, 246, 0.5)')
  })

  test('orders accent clusters by extracted usage counts', () => {
    const blue = 'rgb(37, 99, 235)'
    const orange = 'rgb(245, 158, 11)'

    const result = clusterColors([orange, blue], {
      [`bgColor:${blue}`]: 40,
      [`textColor:${blue}`]: 5,
      [`bgColor:${orange}`]: 3,
    })

    expect(result.accents[0]).toBe('#2563eb')
    expect(result.palette.find((item) => item.hex === '#2563eb')?.count).toBe(45)
    expect(result.palette.find((item) => item.hex === '#f59e0b')?.count).toBe(3)
  })

  test('preserves observed roles for dark surfaces and light text', () => {
    const dark = 'rgb(22, 23, 29)'
    const white = 'rgb(255, 255, 255)'
    const purple = 'rgb(111, 66, 193)'

    const result = clusterColors(
      [dark, white, purple],
      {
        [`bgColor:${white}`]: 120,
        [`textColor:${dark}`]: 180,
        [`bgColor:${dark}`]: 20,
        [`textColor:${white}`]: 30,
        [`textColor:${purple}`]: 8,
      },
      {
        [`bgArea:${dark}`]: 1,
        [`textColor:${white}`]: 30,
        [`accentColor:${purple}`]: 4,
      },
    )

    expect(result.backgrounds[0]).toBe('#16171d')
    expect(result.texts[0]).toBe('#ffffff')
    expect(result.accents[0]).toBe('#6f42c1')
  })

  test('prefers a chromatic interactive color over frequent neutral colors', () => {
    const result = clusterColors(['rgb(132, 145, 165)', 'rgb(23, 114, 246)', 'rgb(255, 255, 255)'], {
      'textColor:rgb(132, 145, 165)': 200,
      'bgColor:rgb(255, 255, 255)': 100,
      'accentColor:rgb(23, 114, 246)': 5,
    })

    expect(result.accents[0]).toBe('#1772f6')
  })

  test('prefers an observed action color over a more frequent decorative hue', () => {
    const result = clusterColors(['rgb(23, 114, 246)', 'rgb(124, 58, 237)', 'rgb(255, 255, 255)'], {
      'bgColor:rgb(124, 58, 237)': 40,
      'bgColor:rgb(23, 114, 246)': 4,
      'actionColor:rgb(23, 114, 246)': 4,
    })

    expect(result.accents[0]).toBe('#1772f6')
  })

  test('uses a declared brand token as primary evidence without promoting neutral tokens', () => {
    const result = clusterColors(['rgb(23, 114, 246)', 'rgb(124, 58, 237)', 'rgb(255, 255, 255)'], {
      'bgColor:rgb(124, 58, 237)': 30,
      'declaredColor:rgb(23, 114, 246)': 1,
      'brandTokenColor:rgb(23, 114, 246)': 1,
      'declaredColor:rgb(255, 255, 255)': 1,
    })

    expect(result.accents[0]).toBe('#1772f6')
  })

  test('prefers an observed action color over an unused declared brand token', () => {
    const result = clusterColors(['rgb(23, 114, 246)', 'rgb(124, 58, 237)'], {
      'declaredColor:rgb(124, 58, 237)': 1,
      'brandTokenColor:rgb(124, 58, 237)': 1,
      'actionColor:rgb(23, 114, 246)': 2,
    })

    expect(result.accents[0]).toBe('#1772f6')
  })

  test('keeps entry-page surfaces while accepting cross-page action evidence', () => {
    const result = clusterColors(
      ['rgb(255, 255, 255)', 'rgb(17, 24, 39)', 'rgb(23, 114, 246)'],
      {
        'bgColor:rgb(255, 255, 255)': 2,
        'textColor:rgb(17, 24, 39)': 2,
        'actionColor:rgb(23, 114, 246)': 1,
      },
      {
        'bgArea:rgb(255, 255, 255)': 1,
        'textColor:rgb(17, 24, 39)': 3,
      },
      { 'actionColor:rgb(23, 114, 246)': 1 },
    )

    expect(result.backgrounds[0]).toBe('#ffffff')
    expect(result.accents[0]).toBe('#1772f6')
  })

  test('prefers a primary CTA over a more frequent generic action color', () => {
    const result = clusterColors(
      ['rgb(23, 114, 246)', 'rgb(124, 58, 237)'],
      {},
      {},
      {
        'primaryActionColor:rgb(23, 114, 246)': 1,
        'actionColor:rgb(124, 58, 237)': 20,
      },
    )

    expect(result.accents[0]).toBe('#1772f6')
  })

  test('uses paired action backgrounds without promoting their foreground text', () => {
    const result = clusterColors(
      ['rgb(234, 88, 12)', 'rgb(251, 191, 36)', 'rgb(255, 255, 255)', 'rgb(67, 20, 7)'],
      {},
      {},
      {
        'actionBackgroundColor:rgb(234, 88, 12)': 2,
        'actionForegroundColor:rgb(255, 255, 255)': 2,
        'actionBackgroundColor:rgb(251, 191, 36)': 1,
        'actionForegroundColor:rgb(67, 20, 7)': 1,
      },
    )

    expect(result.accents.slice(0, 2)).toEqual(['#ea580c', '#fbbf24'])
    expect(result.accents).not.toContain('#ffffff')
    expect(result.accents).not.toContain('#431407')
  })

  test('excludes status background and foreground colors from generic accents', () => {
    const result = clusterColors(
      ['rgb(21, 94, 239)', 'rgb(6, 118, 71)', 'rgb(180, 35, 24)', 'rgb(181, 71, 8)'],
      {},
      {},
      {
        'actionBackgroundColor:rgb(21, 94, 239)': 1,
        'statusForegroundColor:rgb(6, 118, 71)': 4,
        'statusForegroundColor:rgb(180, 35, 24)': 2,
        'statusForegroundColor:rgb(181, 71, 8)': 1,
      },
    )

    expect(result.accents[0]).toBe('#155eef')
    expect(result.accents).not.toEqual(expect.arrayContaining(['#067647', '#b42318', '#b54708']))
  })

  test('does not use a status-only color as the brand fallback', () => {
    const result = clusterColors(
      ['rgb(255, 255, 255)', 'rgb(17, 24, 39)', 'rgb(220, 38, 38)'],
      {},
      {},
      { 'bgColor:rgb(220, 38, 38)': 8, 'statusColor:rgb(220, 38, 38)': 8 },
    )

    expect(result.accents).not.toContain('#dc2626')
  })

  test('preserves a white card surface above a near-white page canvas', () => {
    const canvas = 'rgb(244, 246, 249)'
    const surface = 'rgb(255, 255, 255)'
    const disabled = 'rgb(196, 199, 206)'
    const primary = 'rgb(23, 114, 246)'
    const result = clusterColors(
      [canvas, surface, disabled, primary],
      {
        [`bgColor:${surface}`]: 192,
        [`bgColor:${canvas}`]: 4,
        [`bgColor:${disabled}`]: 4,
        [`bgColor:${primary}`]: 8,
      },
      {
        [`bgArea:${canvas}`]: 4,
        [`bgArea:${surface}`]: 3.5988,
        [`bgArea:${disabled}`]: 0.000035,
        [`actionColor:${primary}`]: 8,
      },
    )

    expect(result.backgrounds.slice(0, 2)).toEqual(['#f4f6f9', '#ffffff'])
    expect(result.accents[0]).toBe('#1772f6')
  })
})
