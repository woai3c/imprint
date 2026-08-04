import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { isLinux, isMacOS, isWindows } from '../../shared/platform.js'

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
