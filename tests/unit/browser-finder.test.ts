import { afterEach, describe, expect, it } from 'vitest'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  BrowserExecutableError,
  resolveBrowserExecutables,
  validateBrowserExecutablePath,
} from '../../src/core/analyzer/browser-finder.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) fs.rmSync(directory, { force: true, recursive: true })
  }
})

function createExecutable(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-browser-finder-'))
  temporaryDirectories.push(directory)
  const executablePath = path.join(directory, process.platform === 'win32' ? 'browser.exe' : 'browser')
  fs.writeFileSync(executablePath, '')
  if (process.platform !== 'win32') fs.chmodSync(executablePath, 0o755)
  return executablePath
}

describe('browser executable resolution', () => {
  it('uses one validated explicit executable for interactive and headless runtimes', () => {
    const executablePath = createExecutable()

    expect(validateBrowserExecutablePath(executablePath)).toBe(executablePath)
    expect(resolveBrowserExecutables(executablePath)).toEqual({
      interactive: executablePath,
      headless: executablePath,
    })
  })

  it('fails closed instead of falling back when an explicit path is invalid', () => {
    const invalidPath = path.join(os.tmpdir(), 'imprint-browser-does-not-exist')

    expect(() => resolveBrowserExecutables(invalidPath)).toThrowError(
      expect.objectContaining<Partial<BrowserExecutableError>>({
        code: 'invalid-browser-path',
        browserPath: invalidPath,
      }),
    )
    expect(() => resolveBrowserExecutables(invalidPath)).toThrowError(/not an accessible executable file/)
  })
})
