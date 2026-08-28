import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readOption(name) {
  const prefix = `--${name}=`
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length)
}

function normalizePlatform(value) {
  if (value === 'macos') return 'darwin'
  if (value === 'windows') return 'win32'
  return value
}

function getExecutablePath(platform, arch) {
  const packageRoot = path.join(repoRoot, 'out', `Imprint-${platform}-${arch}`)
  if (platform === 'darwin') return path.join(packageRoot, 'Imprint.app', 'Contents', 'MacOS', 'imprint')
  if (platform === 'win32') return path.join(packageRoot, 'imprint.exe')
  return path.join(packageRoot, 'imprint')
}

async function readLogTail(userDataDir) {
  try {
    const log = await fs.readFile(path.join(userDataDir, 'logs', 'imprint.log'), 'utf8')
    return log.trim().split('\n').slice(-80).join('\n')
  } catch {
    return ''
  }
}

const platform = normalizePlatform(readOption('platform') || process.platform)
const arch = readOption('arch') || process.arch

if (platform !== process.platform) {
  throw new Error(`Cannot launch a ${platform} package on the ${process.platform} build host.`)
}

const executablePath = getExecutablePath(platform, arch)
await fs.access(executablePath)

const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'))
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-packaged-smoke-'))
let electronApp

try {
  electronApp = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      IMPRINT_E2E: '1',
      IMPRINT_E2E_USER_DATA_DIR: userDataDir,
    },
    timeout: 60_000,
  })

  const window = await electronApp.firstWindow({ timeout: 30_000 })
  await window.waitForSelector('.app-shell', { state: 'visible', timeout: 30_000 })

  const runtime = await electronApp.evaluate(({ app }) => ({
    arch: process.arch,
    isPackaged: app.isPackaged,
    platform: process.platform,
    version: app.getVersion(),
  }))

  assert.equal(runtime.isPackaged, true)
  assert.equal(runtime.platform, platform)
  assert.equal(runtime.arch, arch)
  assert.equal(runtime.version, packageJson.version)

  console.log(`Packaged app smoke test passed: ${runtime.platform}-${runtime.arch} v${runtime.version}`)
} catch (error) {
  const logTail = await readLogTail(userDataDir)
  if (logTail) console.error(`Packaged app startup log:\n${logTail}`)
  throw error
} finally {
  await electronApp?.close().catch(() => undefined)
  await fs.rm(userDataDir, { force: true, recursive: true })
}
