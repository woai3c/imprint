import type { AnalysisRecord } from '../../shared/ipc-contract.js'

let cachedRecords: AnalysisRecord[] | null = null
let pendingLoad: Promise<AnalysisRecord[]> | null = null
let generation = 0

export function peekComparisonRecords(): AnalysisRecord[] | null {
  return cachedRecords
}

export function loadComparisonRecords(): Promise<AnalysisRecord[]> {
  if (cachedRecords) return Promise.resolve(cachedRecords)
  if (pendingLoad) return pendingLoad

  const loadGeneration = generation
  pendingLoad = window.electronAPI
    .getAnalysisSummaries()
    .then((records) => {
      if (generation === loadGeneration) cachedRecords = records
      return records
    })
    .finally(() => {
      if (generation === loadGeneration) pendingLoad = null
    })
  return pendingLoad
}

export function invalidateComparisonRecords(): void {
  generation += 1
  cachedRecords = null
  pendingLoad = null
}

export function removeComparisonRecords(ids: Iterable<string>): void {
  if (!cachedRecords) return
  const removed = new Set(ids)
  cachedRecords = cachedRecords.filter((record) => !removed.has(record.id))
}
