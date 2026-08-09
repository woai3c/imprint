export function isMacOS(platform: string): boolean {
  return platform === 'darwin'
}

export function isWindows(platform: string): boolean {
  return platform === 'win32'
}

export function isLinux(platform: string): boolean {
  return platform === 'linux'
}

export type DesktopPlatformFamily = 'macos' | 'windows' | 'linux' | 'other'

export function getDesktopPlatformFamily(platform: string): DesktopPlatformFamily {
  if (isMacOS(platform)) return 'macos'
  if (isWindows(platform)) return 'windows'
  if (isLinux(platform)) return 'linux'
  return 'other'
}
