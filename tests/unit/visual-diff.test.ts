import { describe, expect, it } from 'vitest'

import { type VisualDiffImage, createVisualDiff, fitVisualDiffPreview } from '../../src/renderer/lib/visual-diff.js'

function image(width: number, height: number, pixels: number[][]): VisualDiffImage {
  return { width, height, data: new Uint8ClampedArray(pixels.flat()) }
}

describe('visual screenshot diff', () => {
  it('uses one uniform preview scale for captures with different long-page heights', () => {
    const preview = fitVisualDiffPreview(1440, 4090, 1440, 3501, 1200, 4_000_000)

    expect(preview.scale).toBe(preview.width / 1440)
    expect(preview.referenceHeight).toBe(Math.floor(4090 * preview.scale))
    expect(preview.targetHeight).toBe(Math.floor(3501 * preview.scale))
    expect(preview.width * preview.referenceHeight).toBeLessThanOrEqual(4_000_000)
    expect(preview.scaled).toBe(true)
  })

  it('rejects preview geometry for screenshots with different widths', () => {
    expect(() => fitVisualDiffPreview(1440, 900, 375, 812, 1200, 4_000_000)).toThrow('Screenshot widths do not match')
  })

  it('does not report identical pixels as changed', () => {
    const capture = image(1, 1, [[40, 80, 120, 255]])
    const result = createVisualDiff(capture, capture)

    expect(result.changedPixels).toBe(0)
    expect(result.referenceRegions).toEqual([])
    expect(result.targetRegions).toEqual([])
  })

  it('highlights a meaningful color difference on both captures', () => {
    const reference = image(2, 1, [
      [20, 40, 60, 255],
      [255, 255, 255, 255],
    ])
    const target = image(2, 1, [
      [20, 40, 60, 255],
      [25, 87, 214, 255],
    ])
    const result = createVisualDiff(reference, target)

    expect(result.changedPixels).toBe(1)
    expect(result.referenceRegions).toHaveLength(1)
    expect(result.targetRegions).toHaveLength(1)
  })

  it('reports pixels that exist on only one page when capture heights differ', () => {
    const row = [40, 80, 120, 255]
    const reference = image(1, 2, [row, row])
    const target = image(1, 1, [row])
    const result = createVisualDiff(reference, target)

    expect(result.changedPixels).toBe(1)
    expect(result.referenceRegions).toHaveLength(1)
  })

  it('aligns an unchanged suffix after a contiguous section-height removal', () => {
    const row = (red: number, green: number, blue: number) =>
      Array.from({ length: 8 }, () => [red, green, blue, 255]).flat()
    const prefix = [row(10, 20, 30), row(40, 80, 120), row(70, 140, 210)]
    const removed = [row(220, 20, 40), row(20, 220, 40), row(40, 20, 220)]
    const suffix = [
      row(15, 180, 90),
      row(180, 90, 15),
      row(90, 15, 180),
      row(30, 150, 220),
      row(150, 220, 30),
      row(220, 30, 150),
    ]
    const reference = image(8, 12, [...prefix, ...removed, ...suffix])
    const target = image(8, 9, [...prefix, ...suffix])
    const result = createVisualDiff(reference, target)

    expect(result.alignment).toBe('height-shift')
    expect(result.changedPixels).toBe(removed.length * reference.width)
    expect(result.referenceRegions.length).toBeGreaterThan(0)
    expect(result.targetRegions.length).toBeGreaterThan(0)
  })

  it('rejects screenshots with different widths instead of fabricating pixel alignment', () => {
    const reference = image(1, 1, [[0, 0, 0, 255]])
    const target = image(2, 1, [
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ])

    expect(() => createVisualDiff(reference, target)).toThrow('Screenshot widths do not match')
  })
})
