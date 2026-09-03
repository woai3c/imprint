import type { AnalysisRecord } from '../../shared/ipc-contract.js'

export function laterRecordsFor(earlier: AnalysisRecord, records: AnalysisRecord[]): AnalysisRecord[] {
  const earlierTime = Date.parse(earlier.created_at)
  if (!earlier.route_identity || Number.isNaN(earlierTime)) return []
  return records.filter((record) => {
    if (record.id === earlier.id || record.route_identity !== earlier.route_identity) return false
    const laterTime = Date.parse(record.created_at)
    return !Number.isNaN(laterTime) && laterTime > earlierTime
  })
}
