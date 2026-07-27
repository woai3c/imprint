import { isMacOS as checkIsMacOS } from '../../shared/platform'

export const desktopPlatform = window.electronAPI.platform

export function isMacOS(): boolean {
  return checkIsMacOS(desktopPlatform)
}
