import { describe, expect, it } from 'vitest'

import { summarizeInterpretationDiagnostics } from '../../src/core/design-intelligence/diagnostic-summary.js'

describe('interpretation diagnostic summary', () => {
  it('separates claim and assertion diagnostics and deduplicates affected claim paths', () => {
    expect(
      summarizeInterpretationDiagnostics(
        [
          'visualLanguage.color:missing-evidence',
          'visualLanguage.color.assertions.0:unsupported',
          'visualLanguage.color.assertions.1:unsupported',
          'attention.entryPoint.assertions.0:unsupported',
        ],
        ['claims:deduplicated(2)'],
      ),
    ).toEqual({
      rejectedClaims: 1,
      rejectedAssertions: 3,
      affectedClaimPaths: 2,
      repairEvents: 1,
      selectionDiagnostics: 0,
    })
  })

  it('does not mislabel selection protocol errors as rejected claims', () => {
    expect(summarizeInterpretationDiagnostics(['selection.selectedClaimIds.0:unknown-claim-id'])).toEqual({
      rejectedClaims: 0,
      rejectedAssertions: 0,
      affectedClaimPaths: 0,
      repairEvents: 0,
      selectionDiagnostics: 1,
    })
  })
})
