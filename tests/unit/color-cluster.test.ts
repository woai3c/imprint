import { describe, expect, test } from 'vitest'

import { clusterColors } from '../../src/core/analyzer/color-cluster.js'

describe('color clustering', () => {
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
})
