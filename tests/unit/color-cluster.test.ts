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
