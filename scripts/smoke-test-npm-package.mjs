import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'packages', 'design-imprint', 'package.json'), 'utf8'),
)
const tarball = path.resolve(
  repoRoot,
  process.argv[2] || path.join('release-packages', `${packageJson.name}-${packageJson.version}.tgz`),
)

assert.ok(fs.existsSync(tarball), `npm package tarball is missing: ${tarball}`)

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-npm-smoke-'))
const installRoot = path.join(sandbox, 'install')
const cacheRoot = path.join(sandbox, 'npm-cache')
const homeRoot = path.join(sandbox, 'home')
const runtimeTemp = path.join(sandbox, 'runtime-temp')
for (const directory of [installRoot, cacheRoot, homeRoot, runtimeTemp]) fs.mkdirSync(directory, { recursive: true })
const sandboxTarball = path.join(sandbox, 'package.tgz')
fs.copyFileSync(tarball, sandboxTarball)

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const install = spawnSync(
  npmCommand,
  ['install', '--prefix', 'install', 'package.tgz', '--no-audit', '--no-fund', '--cache', 'npm-cache'],
  {
    cwd: sandbox,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
)

if (install.error) throw install.error
assert.equal(install.status, 0, install.stderr)

const bin = (name) =>
  path.join(installRoot, 'node_modules', '.bin', `${name}${process.platform === 'win32' ? '.cmd' : ''}`)
const binCommand = (name) => (process.platform === 'win32' ? path.relative(sandbox, bin(name)) : bin(name))
for (const name of ['design-imprint', 'imprint', 'imprint-mcp']) {
  assert.ok(fs.existsSync(bin(name)), `installed npm bin is missing: ${name}`)
}

const runtimeEnv = {
  ...process.env,
  HOME: homeRoot,
  USERPROFILE: homeRoot,
  APPDATA: path.join(homeRoot, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(homeRoot, 'AppData', 'Local'),
  TMPDIR: runtimeTemp,
  TMP: runtimeTemp,
  TEMP: runtimeTemp,
}
fs.mkdirSync(runtimeEnv.APPDATA, { recursive: true })
fs.mkdirSync(runtimeEnv.LOCALAPPDATA, { recursive: true })

const runBin = (name, args) =>
  spawnSync(binCommand(name), args, {
    cwd: sandbox,
    env: runtimeEnv,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

let fixture
let client
try {
  for (const name of ['design-imprint', 'imprint']) {
    const help = runBin(name, ['--help'])
    if (help.error) throw help.error
    assert.equal(help.status, 0, help.stderr)
    assert.match(help.stdout, /Usage:/)
  }

  const doctor = runBin('imprint', ['doctor', '--json'])
  if (doctor.error) throw doctor.error
  assert.equal(doctor.status, 0, doctor.stderr)
  const doctorResult = JSON.parse(doctor.stdout)
  assert.equal(doctorResult.schemaVersion, '1')
  assert.equal(doctorResult.ok, true)

  fixture = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html><head><title>Package smoke fixture</title><style>
      :root{--brand:#2563eb;--space:16px}body{margin:0;background:#f8fafc;color:#172033;font:16px/1.5 Arial,sans-serif}
      main{max-width:760px;margin:48px auto;padding:var(--space)}button{border:0;border-radius:8px;padding:8px 16px;background:var(--brand);color:white}
    </style></head><body><main><h1>Package smoke fixture</h1><p>Installed package extraction.</p><button>Continue</button></main></body></html>`)
  })
  await new Promise((resolve, reject) => {
    fixture.once('error', reject)
    fixture.listen(0, '127.0.0.1', resolve)
  })
  const address = fixture.address()
  assert.ok(address && typeof address === 'object')
  const url = `http://127.0.0.1:${address.port}`

  const cliResult = await collect(
    spawn(binCommand('imprint'), [url, '--pages', '1', '--format', 'json', '--quiet'], {
      cwd: sandbox,
      env: runtimeEnv,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }),
  )
  assert.equal(cliResult.code, 0, cliResult.stderr)
  assert.ok(JSON.parse(cliResult.stdout).color)

  const serverPath = path.join(installRoot, 'node_modules', packageJson.name, 'dist', 'mcp', 'server.js')
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: sandbox,
    env: runtimeEnv,
    stderr: 'pipe',
  })
  client = new Client({ name: 'imprint-npm-smoke', version: '1.0.0' })
  await client.connect(transport)
  assert.deepEqual(client.getServerVersion(), { name: 'imprint', version: packageJson.version })
  const tools = await client.listTools()
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ['imprint_compare', 'imprint_extract'])
  const extraction = await client.callTool(
    { name: 'imprint_extract', arguments: { url, maxPages: 1, format: 'json' } },
    undefined,
    { timeout: 90_000 },
  )
  assert.equal(extraction.isError, undefined, JSON.stringify(extraction))
  assert.ok(JSON.parse(extraction.content[0].text).color)
  await client.close()
  client = undefined

  assert.deepEqual(fs.readdirSync(runtimeTemp), [], 'installed package left temporary extraction data behind')
  assert.equal(
    fs.existsSync(path.join(homeRoot, '.imprint')),
    false,
    'installed package created persistent session data',
  )
  console.log(`Installed npm package smoke test passed for ${packageJson.name}@${packageJson.version}.`)
} finally {
  if (client) await client.close().catch(() => {})
  if (fixture) {
    fixture.closeAllConnections()
    await new Promise((resolve) => fixture.close(resolve))
  }
  fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}

function collect(child) {
  let stdout = ''
  let stderr = ''
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr?.on('data', (chunk) => {
    stderr += chunk
  })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}
