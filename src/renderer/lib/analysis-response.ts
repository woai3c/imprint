import type { AnalysisResultData, AnalyzeResponse, AuthWallDetection } from '../../shared/ipc-contract.js'

export type ClassifiedAnalyzeResponse =
  | { kind: 'success'; result: AnalysisResultData }
  | { kind: 'auth-required'; detection: AuthWallDetection }
  | { kind: 'cancelled' }
  | { kind: 'error'; message?: string; stage?: string }

/** Converts the wire-compatible analysis response shapes into one exhaustive renderer contract. */
export function classifyAnalyzeResponse(response: AnalyzeResponse): ClassifiedAnalyzeResponse {
  if ('authRequired' in response) {
    return { kind: 'auth-required', detection: response.detection }
  }
  if ('cancelled' in response) {
    return { kind: 'cancelled' }
  }
  if ('error' in response) {
    return { kind: 'error', message: response.message, stage: response.stage }
  }
  return { kind: 'success', result: response }
}
