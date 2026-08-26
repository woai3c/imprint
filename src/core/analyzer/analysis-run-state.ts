import type { AnalysisProgress, AnalysisTiming } from './types.js'
import { pageIdentityUrl } from './url-identity.js'

type MeasuredTimingKey = 'preparationMs' | 'extractionMs' | 'healthGateMs' | 'screenshotCaptureMs'

export interface AnalysisRunStateOptions {
  startTime: number
  onProgress?: (progress: AnalysisProgress) => void
  canFinishPartially: () => boolean
  ensureActive: () => void
}

/** Owns mutable progress and timing bookkeeping for one analysis run. */
export class AnalysisRunState {
  readonly timing: AnalysisTiming = {
    browserMs: 0,
    preparationMs: 0,
    extractionMs: 0,
    healthGateMs: 0,
    screenshotCaptureMs: 0,
    validationMs: 0,
    totalMs: 0,
    imageCount: 0,
    budgetExceeded: [],
  }

  private userWaitDurationMs = 0
  private completedUrls = new Set<string>()
  private progressStep = 'progress.launchingBrowser'
  private progressPercent = 0
  private progressDiscoveredPages = 1

  constructor(private readonly options: AnalysisRunStateOptions) {}

  get activeElapsedMs(): number {
    return Math.max(0, Date.now() - this.options.startTime - this.userWaitDurationMs)
  }

  get analyzedPageCount(): number {
    return this.completedUrls.size
  }

  get discoveredPageCount(): number {
    return this.progressDiscoveredPages
  }

  addUserWait(durationMs: number): void {
    this.userWaitDurationMs += durationMs
  }

  setDiscoveredPageCount(count: number): void {
    this.progressDiscoveredPages = count
  }

  reportProgress = (step = this.progressStep, percent = this.progressPercent): void => {
    this.progressStep = step
    this.progressPercent = percent
    this.options.onProgress?.({
      step,
      percent,
      analyzedPages: this.analyzedPageCount,
      discoveredPages: Math.max(this.analyzedPageCount, this.progressDiscoveredPages),
      resultReady: this.options.canFinishPartially() && this.analyzedPageCount > 0,
      activeElapsedMs: this.activeElapsedMs,
    })
  }

  markPageReady = (pageUrl: string): void => {
    this.completedUrls.add(pageIdentityUrl(pageUrl))
    this.reportProgress()
  }

  measure = async <T>(key: MeasuredTimingKey, run: () => Promise<T>): Promise<T> => {
    this.options.ensureActive()
    const startedAt = Date.now()
    try {
      const result = await run()
      this.options.ensureActive()
      return result
    } finally {
      this.addTiming(key, Date.now() - startedAt)
    }
  }

  addTiming(key: MeasuredTimingKey, durationMs: number): void {
    this.timing[key] = (this.timing[key] || 0) + durationMs
  }

  addBudgetExceeded(stage: string): void {
    this.timing.budgetExceeded?.push(stage)
  }

  finalizeTiming(imageCount: number): void {
    this.timing.imageCount = imageCount
    this.timing.totalMs = this.activeElapsedMs
    this.timing.userWaitMs = this.userWaitDurationMs
    if ((this.timing.preparationMs || 0) > 100_000) this.addBudgetExceeded('preparation')
    if ((this.timing.healthGateMs || 0) > 20_000) this.addBudgetExceeded('health-gate')
    if ((this.timing.screenshotCaptureMs || 0) > 45_000) this.addBudgetExceeded('screenshot-capture')
  }
}
