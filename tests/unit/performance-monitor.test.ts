import { describe, expect, it } from 'vitest'

import { summarizeFrameWindow } from '../../src/renderer/lib/performance-monitor'

describe('renderer performance monitor', () => {
  it('summarizes frame rate, tail latency, and visible stalls', () => {
    const intervals = Array.from({ length: 98 }, () => 16.7).concat([34, 80])

    expect(summarizeFrameWindow(1_700, 102, intervals)).toEqual({
      fps: 60,
      p95FrameMs: 16.7,
      maxFrameMs: 80,
      framesOver50Ms: 1,
    })
  })

  it('returns an empty summary when there is no usable frame window', () => {
    expect(summarizeFrameWindow(0, 0, [])).toEqual({
      fps: 0,
      p95FrameMs: 0,
      maxFrameMs: 0,
      framesOver50Ms: 0,
    })
  })
})
