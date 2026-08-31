import { describe, expect, it } from 'vitest'

import { NoUsableCapturesError } from '../../src/core/analyzer/errors.js'

describe('analyzer errors', () => {
  it('exposes a stable code for analyses without usable captures', () => {
    const error = new NoUsableCapturesError()

    expect(error).toMatchObject({
      name: 'NoUsableCapturesError',
      code: 'NO_USABLE_CAPTURES',
    })
  })
})
