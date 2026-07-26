import { isLinux as checkIsLinux, isMacOS as checkIsMacOS, isWindows as checkIsWindows } from '../../shared/platform'

export const desktopPlatform = window.electronAPI.platform

export function isMacOS(): boolean {
  return checkIsMacOS(desktopPlatform)
}

export function isWindows(): boolean {
  return checkIsWindows(desktopPlatform)
}

export function isLinux(): boolean {
  return checkIsLinux(desktopPlatform)
}
