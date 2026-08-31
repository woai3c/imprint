import { describe, expect, it } from 'vitest'

import { NoUsableCapturesError } from '../../src/core/analyzer/errors.js'

describe('analyzer errors', () => {
  it('exposes a stable code for analyses without usable captures', () => {
    const extractionIssues = [{ stage: 'page-1:desktop:health:large-overlay', reason: 'error' }]
    const error = new NoUsableCapturesError(extractionIssues)

    expect(error).toMatchObject({
      name: 'NoUsableCapturesError',
      code: 'NO_USABLE_CAPTURES',
      extractionIssues,
    })
  })
})
