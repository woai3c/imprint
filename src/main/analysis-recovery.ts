import type { AnalysisRecoveryResponse, AnalyzeResponse } from '../shared/ipc-contract.js'

export interface RecoverableAnalysisRun {
  url: string
  status: 'running' | 'complete'
  progress?: { step: string; percent: number }
  response?: AnalyzeResponse
}

export class AnalysisRecoveryRegistry {
  private readonly runs = new Map<number, RecoverableAnalysisRun>()

  start(ownerId: number, url: string): RecoverableAnalysisRun {
    const run: RecoverableAnalysisRun = { url, status: 'running' }
    this.runs.set(ownerId, run)
    return run
  }

  updateProgress(ownerId: number, run: RecoverableAnalysisRun, step: string, percent: number): void {
    if (this.runs.get(ownerId) !== run || run.status !== 'running') return
    run.progress = { step, percent }
  }

  complete(ownerId: number, run: RecoverableAnalysisRun, response: AnalyzeResponse): AnalyzeResponse {
    if (this.runs.get(ownerId) !== run) return response
    run.status = 'complete'
    run.response = response
    run.progress = undefined
    return response
  }

  recover(ownerId: number): AnalysisRecoveryResponse {
    const run = this.runs.get(ownerId)
    if (!run) return { status: 'idle' }
    if (run.status === 'running') {
      return {
        status: 'running',
        url: run.url,
        ...(run.progress ? { progress: run.progress } : {}),
      }
    }
    if (!run.response) return { status: 'idle' }
    return { status: 'complete', url: run.url, response: run.response }
  }

  acknowledge(ownerId: number): boolean {
    const run = this.runs.get(ownerId)
    if (!run || run.status !== 'complete') return false
    this.runs.delete(ownerId)
    return true
  }

  remove(ownerId: number, run: RecoverableAnalysisRun): void {
    if (this.runs.get(ownerId) === run) this.runs.delete(ownerId)
  }
}
