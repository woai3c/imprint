import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { isLinux, isMacOS, isWindows } from '../../shared/platform.js'
import { coreT } from '../i18n/index.js'

export type BrowserExecutableErrorCode = 'browser-not-found' | 'invalid-browser-path'

export class BrowserExecutableError extends Error {
  constructor(
    readonly code: BrowserExecutableErrorCode,
    readonly browserPath?: string,
  ) {
    super(
      coreT(
        'en',
        code === 'browser-not-found' ? 'analyzer.errors.browserNotFound' : 'analyzer.errors.invalidBrowserPath',
        {
          path: browserPath,
        },
      ),
    )
    this.name = 'BrowserExecutableError'
  }
}

export function validateBrowserExecutablePath(browserPath: string): string | undefined {
  const trimmedPath = browserPath.trim()
  if (!trimmedPath) return undefined

  const resolvedPath = path.resolve(trimmedPath)
  try {
    if (!fs.statSync(resolvedPath).isFile()) return undefined
    fs.accessSync(resolvedPath, isWindows(process.platform) ? fs.constants.F_OK : fs.constants.F_OK | fs.constants.X_OK)
    return resolvedPath
  } catch {
    return undefined
  }
}

export function findBrowser(): string | undefined {
  if (isWindows(process.platform)) {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    for (const browserPath of paths) {
      if (fs.existsSync(browserPath)) return browserPath
    }
  }

  if (isMacOS(process.platform)) {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]
    for (const browserPath of paths) {
      if (fs.existsSync(browserPath)) return browserPath
    }
  }

  if (isLinux(process.platform)) {
    const paths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ]
    for (const browserPath of paths) {
      if (fs.existsSync(browserPath)) return browserPath
    }
  }

  return undefined
}

function getPlaywrightCacheRoot(): string | undefined {
  const configuredRoot = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()
  if (configuredRoot && configuredRoot !== '0') return path.resolve(configuredRoot)

  if (isMacOS(process.platform)) return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
  if (isWindows(process.platform) && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'ms-playwright')
  }
  if (isLinux(process.platform)) return path.join(os.homedir(), '.cache', 'ms-playwright')
  return undefined
}

function findHeadlessShellInRoot(root: string): string | undefined {
  if (!fs.existsSync(root)) return undefined

  const platformDirectory = isMacOS(process.platform)
    ? `chrome-headless-shell-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}`
    : isWindows(process.platform)
      ? 'chrome-headless-shell-win64'
      : process.arch === 'arm64'
        ? 'chrome-linux'
        : 'chrome-headless-shell-linux64'
  const executableName = isWindows(process.platform)
    ? 'chrome-headless-shell.exe'
    : isLinux(process.platform) && process.arch === 'arm64'
      ? 'headless_shell'
      : 'chrome-headless-shell'

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return undefined
  }

  const revisions = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium_headless_shell-'))
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))

  for (const revision of revisions) {
    const executablePath = path.join(root, revision.name, platformDirectory, executableName)
    if (fs.existsSync(executablePath)) return executablePath
  }
  return undefined
}

export function findHeadlessBrowser(resourcesDir?: string): string | undefined {
  const override = process.env.IMPRINT_HEADLESS_BROWSER_PATH?.trim()
  if (override && fs.existsSync(override)) return path.resolve(override)

  for (const root of [resourcesDir, getPlaywrightCacheRoot()]) {
    if (!root) continue
    const executablePath = findHeadlessShellInRoot(root)
    if (executablePath) return executablePath
  }

  return findBrowser()
}

export function resolveBrowserExecutables(
  explicitPath?: string,
  resourcesDir?: string,
): { interactive: string; headless: string } {
  if (explicitPath !== undefined) {
    const executablePath = validateBrowserExecutablePath(explicitPath)
    if (!executablePath) throw new BrowserExecutableError('invalid-browser-path', explicitPath)
    return { interactive: executablePath, headless: executablePath }
  }

  const interactive = findBrowser()
  if (!interactive) throw new BrowserExecutableError('browser-not-found')
  return {
    interactive,
    headless: findHeadlessBrowser(resourcesDir) || interactive,
  }
}
