import { isMacOS as checkIsMacOS } from '../../shared/platform'

const desktopPlatform = window.electronAPI.platform

export function isMacOS(): boolean {
  return checkIsMacOS(desktopPlatform)
}
