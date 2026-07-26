export function isMacOS(platform: string): boolean {
  return platform === 'darwin'
}

export function isWindows(platform: string): boolean {
  return platform === 'win32'
}

export function isLinux(platform: string): boolean {
  return platform === 'linux'
}
