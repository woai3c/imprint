import type { RendererPerformanceSample } from '../../shared/ipc-contract'

const REPORT_INTERVAL_MS = 15_000
const SLOW_FRAME_MS = 50

export interface FrameSummary {
  fps: number
  p95FrameMs: number
  maxFrameMs: number
  framesOver50Ms: number
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function summarizeFrameWindow(windowMs: number, frames: number, frameIntervals: number[]): FrameSummary {
  if (windowMs <= 0 || frames <= 0 || frameIntervals.length === 0) {
    return { fps: 0, p95FrameMs: 0, maxFrameMs: 0, framesOver50Ms: 0 }
  }

  const sortedIntervals = [...frameIntervals].sort((left, right) => left - right)
  const percentileIndex = Math.max(0, Math.ceil(sortedIntervals.length * 0.95) - 1)

  return {
    fps: round((frames * 1000) / windowMs),
    p95FrameMs: round(sortedIntervals[percentileIndex]),
    maxFrameMs: round(sortedIntervals[sortedIntervals.length - 1]),
    framesOver50Ms: frameIntervals.filter((interval) => interval > SLOW_FRAME_MS).length,
  }
}

export function startRendererPerformanceMonitor(): () => void {
  let animationFrameId = 0
  let windowStartedAt = performance.now()
  let previousFrameAt: number | null = null
  let frames = 0
  let frameIntervals: number[] = []
  let longTasks = 0
  let longTaskMs = 0

  const resetWindow = (now: number) => {
    windowStartedAt = now
    previousFrameAt = now
    frames = 0
    frameIntervals = []
    longTasks = 0
    longTaskMs = 0
  }

  const report = (now: number) => {
    const windowMs = now - windowStartedAt
    if (frames < 2 || frameIntervals.length === 0) {
      resetWindow(now)
      return
    }

    const frameSummary = summarizeFrameWindow(windowMs, frames, frameIntervals)
    const sample: RendererPerformanceSample = {
      windowMs: Math.round(windowMs),
      frames,
      ...frameSummary,
      longTasks,
      longTaskMs: round(longTaskMs),
      focused: document.hasFocus(),
      theme: document.documentElement.dataset.appTheme || 'default',
      route: window.location.hash.slice(1).split('?')[0] || '/',
      devicePixelRatio: round(window.devicePixelRatio, 2),
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
    }
    window.electronAPI.reportPerformance(sample)
    resetWindow(now)
  }

  const onAnimationFrame = (now: number) => {
    if (document.visibilityState === 'visible') {
      frames += 1
      if (previousFrameAt !== null) frameIntervals.push(now - previousFrameAt)
      previousFrameAt = now

      if (now - windowStartedAt >= REPORT_INTERVAL_MS) report(now)
    } else {
      previousFrameAt = null
    }

    animationFrameId = requestAnimationFrame(onAnimationFrame)
  }

  const onVisibilityChange = () => {
    resetWindow(performance.now())
    if (document.visibilityState !== 'visible') previousFrameAt = null
  }

  let longTaskObserver: PerformanceObserver | null = null
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      if (document.visibilityState !== 'visible') return
      for (const entry of list.getEntries()) {
        longTasks += 1
        longTaskMs += entry.duration
      }
    })
    longTaskObserver.observe({ type: 'longtask' })
  } catch {
    // Long Task timing is supplementary; frame timing still works when unavailable.
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  animationFrameId = requestAnimationFrame(onAnimationFrame)

  return () => {
    cancelAnimationFrame(animationFrameId)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    longTaskObserver?.disconnect()
  }
}
