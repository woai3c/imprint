import { describe, expect, it } from 'vitest'

import { getDesktopPlatformFamily, isLinux, isMacOS, isWindows } from '../../src/shared/platform'

describe('desktop platform helpers', () => {
  it.each([
    ['darwin', 'macos'],
    ['win32', 'windows'],
    ['linux', 'linux'],
    ['freebsd', 'other'],
  ] as const)('maps %s to the renderer platform family %s', (platform, family) => {
    expect(getDesktopPlatformFamily(platform)).toBe(family)
  })

  it('keeps exact process.platform predicates', () => {
    expect(isMacOS('darwin')).toBe(true)
    expect(isWindows('win32')).toBe(true)
    expect(isLinux('linux')).toBe(true)
    expect(isWindows('darwin')).toBe(false)
  })
})
