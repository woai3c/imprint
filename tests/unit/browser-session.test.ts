import { afterEach, describe, expect, it } from 'vitest'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { findHeadlessBrowser } from '../../src/core/analyzer/browser-finder.js'
import {
  getManagedStorageStatePath,
  hasManagedProfile,
  hasManagedStorageState,
  listManagedSessions,
  markManagedSession,
  removeManagedSession,
} from '../../src/core/analyzer/browser-session.js'

const temporaryDirectories: string[] = []
const originalHeadlessBrowserPath = process.env.IMPRINT_HEADLESS_BROWSER_PATH

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-browser-session-'))
  temporaryDirectories.push(directory)
  return directory
}

function getHeadlessExecutableParts(): string[] {
  if (process.platform === 'darwin') {
    return [`chrome-headless-shell-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}`, 'chrome-headless-shell']
  }
  if (process.platform === 'win32') return ['chrome-headless-shell-win64', 'chrome-headless-shell.exe']
  if (process.arch === 'arm64') return ['chrome-linux', 'headless_shell']
  return ['chrome-headless-shell-linux64', 'chrome-headless-shell']
}

afterEach(() => {
  if (originalHeadlessBrowserPath === undefined) delete process.env.IMPRINT_HEADLESS_BROWSER_PATH
  else process.env.IMPRINT_HEADLESS_BROWSER_PATH = originalHeadlessBrowserPath

  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) fs.rmSync(directory, { force: true, recursive: true })
  }
})

describe.sequential('browser session storage', () => {
  it('tracks exported authentication state alongside the isolated profile', () => {
    const dataDir = createTemporaryDirectory()
    const url = 'https://private.example.com/dashboard'

    expect(hasManagedProfile(dataDir, url)).toBe(false)
    expect(hasManagedStorageState(dataDir, url)).toBe(false)

    markManagedSession(dataDir, url)
    expect(hasManagedProfile(dataDir, url)).toBe(true)

    const storageStatePath = getManagedStorageStatePath(dataDir, url)
    fs.writeFileSync(storageStatePath, JSON.stringify({ cookies: [], origins: [] }))
    expect(hasManagedStorageState(dataDir, url)).toBe(true)

    const [session] = listManagedSessions(dataDir)
    expect(session.hostname).toBe('private.example.com')
    expect(removeManagedSession(dataDir, session.id)).toBe(true)
    expect(hasManagedStorageState(dataDir, url)).toBe(false)
  })

  it('prefers an explicitly configured headless executable', () => {
    const directory = createTemporaryDirectory()
    const executablePath = path.join(directory, process.platform === 'win32' ? 'headless.exe' : 'headless')
    fs.writeFileSync(executablePath, '')
    process.env.IMPRINT_HEADLESS_BROWSER_PATH = executablePath

    expect(findHeadlessBrowser()).toBe(executablePath)
  })

  it('finds a packaged Playwright Headless Shell resource', () => {
    delete process.env.IMPRINT_HEADLESS_BROWSER_PATH
    const resourcesDir = createTemporaryDirectory()
    const executablePath = path.join(resourcesDir, 'chromium_headless_shell-1234', ...getHeadlessExecutableParts())
    fs.mkdirSync(path.dirname(executablePath), { recursive: true })
    fs.writeFileSync(executablePath, '')

    expect(findHeadlessBrowser(resourcesDir)).toBe(executablePath)
  })
})
