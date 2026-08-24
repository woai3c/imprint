import type { RendererPerformanceSample } from '../shared/ipc-contract.js'
import { isRecord } from '../shared/type-guards.js'

function readPerformanceNumber(value: unknown, minimum: number, maximum: number, digits = 1): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(Math.min(maximum, Math.max(minimum, value)) * factor) / factor
}

function readPerformanceLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  return value.replace(/[\r\n\t]/g, ' ').slice(0, 120) || fallback
}

export function formatRendererPerformanceSample(value: unknown): string | null {
  if (!isRecord(value)) return null

  const windowMs = readPerformanceNumber(value.windowMs, 1, 60_000, 0)
  const frames = readPerformanceNumber(value.frames, 1, 10_000, 0)
  const fps = readPerformanceNumber(value.fps, 0, 500)
  const p95FrameMs = readPerformanceNumber(value.p95FrameMs, 0, 60_000)
  const maxFrameMs = readPerformanceNumber(value.maxFrameMs, 0, 60_000)
  const framesOver50Ms = readPerformanceNumber(value.framesOver50Ms, 0, 10_000, 0)
  const longTasks = readPerformanceNumber(value.longTasks, 0, 10_000, 0)
  const longTaskMs = readPerformanceNumber(value.longTaskMs, 0, 60_000)
  const devicePixelRatio = readPerformanceNumber(value.devicePixelRatio, 0.1, 10, 2)
  const hardwareConcurrency = readPerformanceNumber(value.hardwareConcurrency, 0, 512, 0)

  if (
    windowMs === null ||
    frames === null ||
    fps === null ||
    p95FrameMs === null ||
    maxFrameMs === null ||
    framesOver50Ms === null ||
    longTasks === null ||
    longTaskMs === null ||
    devicePixelRatio === null ||
    hardwareConcurrency === null
  ) {
    return null
  }

  const sample = value as unknown as RendererPerformanceSample
  return [
    'renderer',
    `windowMs=${windowMs}`,
    `frames=${frames}`,
    `fps=${fps}`,
    `p95FrameMs=${p95FrameMs}`,
    `maxFrameMs=${maxFrameMs}`,
    `framesOver50Ms=${framesOver50Ms}`,
    `longTasks=${longTasks}`,
    `longTaskMs=${longTaskMs}`,
    `focused=${sample.focused === true}`,
    `theme=${readPerformanceLabel(sample.theme, 'unknown')}`,
    `route=${readPerformanceLabel(sample.route, 'unknown')}`,
    `dpr=${devicePixelRatio}`,
    `cores=${hardwareConcurrency}`,
  ].join(' ')
}
