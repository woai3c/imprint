import { colorFrequency } from './usage-stats.js'

/**
 * Color clustering algorithm.
 * Groups similar colors together and picks representative values.
 * Pure code implementation - no LLM needed.
 */

interface ColorRGB {
  r: number
  g: number
  b: number
  a: number
  original: string
  count: number
}

export interface ClusteredColors {
  palette: Array<{ hex: string; count: number; role?: string }>
  backgrounds: string[]
  texts: string[]
  accents: string[]
}

function parseColor(colorStr: string): ColorRGB | null {
  const rgba = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (rgba) {
    return {
      r: parseInt(rgba[1]),
      g: parseInt(rgba[2]),
      b: parseInt(rgba[3]),
      a: rgba[4] ? parseFloat(rgba[4]) : 1,
      original: colorStr,
      count: 1,
    }
  }

  // Handle hex
  const hex = colorStr.match(/^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
      original: colorStr,
      count: 1,
    }
  }

  return null
}

function colorDistance(a: ColorRGB, b: ColorRGB): number {
  return Math.sqrt(Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2))
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

export function clusterColors(rawColors: string[], usageCount: Readonly<Record<string, number>> = {}): ClusteredColors {
  const freq = colorFrequency(rawColors, usageCount)

  // Parse and deduplicate
  const parsed: ColorRGB[] = []
  for (const [colorStr, count] of freq) {
    const color = parseColor(colorStr)
    if (color) {
      color.count = count
      parsed.push(color)
    }
  }

  if (parsed.length === 0) {
    return { palette: [], backgrounds: [], texts: [], accents: [] }
  }

  // Simple clustering: merge colors within distance threshold
  const threshold = 30
  const clusters: ColorRGB[][] = []

  for (const color of parsed) {
    let merged = false
    for (const cluster of clusters) {
      if (colorDistance(cluster[0], color) < threshold) {
        cluster.push(color)
        merged = true
        break
      }
    }
    if (!merged) {
      clusters.push([color])
    }
  }

  // Sort clusters by total frequency
  clusters.sort((a, b) => b.reduce((sum, c) => sum + c.count, 0) - a.reduce((sum, c) => sum + c.count, 0))

  // Take top colors (most frequent member of each cluster)
  const palette = clusters.slice(0, 20).map((cluster) => {
    const rep = cluster.sort((a, b) => b.count - a.count)[0]
    const totalCount = cluster.reduce((s, c) => s + c.count, 0)
    return {
      hex: rgbToHex(rep.r, rep.g, rep.b),
      count: totalCount,
    }
  })

  // Classify by luminance
  const backgrounds: string[] = []
  const texts: string[] = []
  const accents: string[] = []

  for (const item of palette) {
    const parsed2 = parseColor(item.hex)
    if (!parsed2) continue
    const lum = luminance(parsed2.r, parsed2.g, parsed2.b)

    if (lum > 0.85) {
      backgrounds.push(item.hex)
    } else if (lum < 0.15) {
      texts.push(item.hex)
    } else {
      accents.push(item.hex)
    }
  }

  return { palette, backgrounds, texts, accents }
}
