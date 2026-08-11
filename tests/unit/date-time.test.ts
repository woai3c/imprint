import { describe, expect, test } from 'vitest'

import { formatLocalDateTime } from '../../src/renderer/lib/date-time.js'

describe('formatLocalDateTime', () => {
  test('includes the local time in Chinese and English history timestamps', () => {
    const value = '2026-08-11T18:20:35'

    expect(formatLocalDateTime(value, 'zh-CN')).toBe('2026-08-11 18:20:35')
    expect(formatLocalDateTime(value, 'en-US')).toMatch(/Aug 11, 2026, 6:20:35\s*PM/i)
  })

  test('preserves an invalid stored timestamp', () => {
    expect(formatLocalDateTime('legacy timestamp', 'zh-CN')).toBe('legacy timestamp')
  })
})
