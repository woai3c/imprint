import { describe, expect, it } from 'vitest'

import { formatRendererPerformanceSample } from '../../src/main/renderer-performance-sample.js'

const validSample = {
  windowMs: 15_000,
  frames: 900,
  fps: 59.96,
  p95FrameMs: 16.74,
  maxFrameMs: 80.05,
  framesOver50Ms: 2,
  longTasks: 1,
  longTaskMs: 51.26,
  focused: true,
  theme: 'default',
  route: '/history',
  devicePixelRatio: 1.255,
  hardwareConcurrency: 8,
}

describe('renderer performance sample formatter', () => {
  it('formats bounded numeric fields and renderer labels', () => {
    expect(formatRendererPerformanceSample(validSample)).toBe(
      'renderer windowMs=15000 frames=900 fps=60 p95FrameMs=16.7 maxFrameMs=80.1 framesOver50Ms=2 longTasks=1 longTaskMs=51.3 focused=true theme=default route=/history dpr=1.25 cores=8',
    )
  })

  it('sanitizes labels and clamps out-of-range measurements', () => {
    const formatted = formatRendererPerformanceSample({
      ...validSample,
      fps: 800,
      focused: false,
      theme: 'theme\nname',
      route: '',
      devicePixelRatio: 0,
    })

    expect(formatted).toContain('fps=500')
    expect(formatted).toContain('focused=false theme=theme name route=unknown dpr=0.1')
  })

  it('rejects incomplete or non-finite samples', () => {
    expect(formatRendererPerformanceSample(null)).toBeNull()
    expect(formatRendererPerformanceSample({ ...validSample, frames: Number.NaN })).toBeNull()
    expect(formatRendererPerformanceSample({ ...validSample, longTasks: undefined })).toBeNull()
  })
})
