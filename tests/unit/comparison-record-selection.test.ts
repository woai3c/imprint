import { describe, expect, it } from 'vitest'

import { opaqueRouteIdentity } from '../../src/core/analyzer/url-identity.js'
import { laterRecordsFor } from '../../src/renderer/lib/comparison-record-selection.js'
import type { AnalysisRecord } from '../../src/shared/ipc-contract.js'

function record(id: string, routeIdentity: string | null, createdAt: string): AnalysisRecord {
  return {
    id,
    theme_id: null,
    theme_name: null,
    site_name: 'Example',
    url: 'https://example.com/app',
    pages_analyzed: 1,
    viewports: '["desktop"]',
    duration_ms: 100,
    created_at: createdAt,
    screenshot_path: null,
    route_identity: routeIdentity,
  }
}

describe('comparison history record selection', () => {
  it('includes repeated captures of one query document and excludes another query document', () => {
    const alpha = opaqueRouteIdentity('https://example.com/app?doc=alpha')
    const beta = opaqueRouteIdentity('https://example.com/app?doc=beta')
    const earlier = record('alpha-before', alpha, '2026-09-02T00:00:00.000Z')
    const alphaLater = record('alpha-after', alpha, '2026-09-02T01:00:00.000Z')
    const betaLater = record('beta-after', beta, '2026-09-02T02:00:00.000Z')

    expect(laterRecordsFor(earlier, [earlier, betaLater, alphaLater])).toEqual([alphaLater])
  })

  it('includes a current capture for a migrated non-query route and excludes an unrecoverable legacy record', () => {
    const migratedIdentity = opaqueRouteIdentity('https://example.com/about')
    const migrated = record('legacy-about', migratedIdentity, '2026-09-02T00:00:00.000Z')
    const current = record('current-about', migratedIdentity, '2026-09-02T01:00:00.000Z')
    const unrecoverable = record('legacy-redacted-query', null, '2026-09-02T00:30:00.000Z')

    expect(laterRecordsFor(migrated, [migrated, unrecoverable, current])).toEqual([current])
    expect(laterRecordsFor(unrecoverable, [migrated, unrecoverable, current])).toEqual([])
  })
})
