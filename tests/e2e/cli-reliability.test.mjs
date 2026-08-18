import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import test from 'node:test'

import { findBrowser } from '../../dist/core/analyzer/browser-finder.js'

const cliPath = path.resolve('dist/cli/index.js')
const browserPath = findBrowser()

function collectChild(child) {
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

test('CLI doctor launches the configured browser and returns structured diagnostics', { skip: !browserPath }, () => {
  const result = spawnSync(process.execPath, [cliPath, 'doctor', '--browser-path', browserPath, '--json'], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
  const report = JSON.parse(result.stdout)
  assert.equal(report.schemaVersion, '1')
  assert.equal(report.ok, true)
  assert.equal(report.browserPath, browserPath)
  assert.equal(report.checks.find((check) => check.id === 'browser-launch')?.ok, true)
})

test('CLI doctor returns the environment exit code for an invalid browser path', () => {
  const result = spawnSync(
    process.execPath,
    [cliPath, 'doctor', '--browser-path', '/imprint/missing/browser', '--json'],
    {
      encoding: 'utf8',
    },
  )

  assert.equal(result.status, 3, result.stderr)
  assert.equal(result.stderr, '')
  const report = JSON.parse(result.stdout)
  assert.equal(report.ok, false)
  assert.equal(report.checks.find((check) => check.id === 'browser-path')?.ok, false)
})

test('CLI rejects malformed integer options with the usage exit code', () => {
  const result = spawnSync(process.execPath, [cliPath, 'extract', 'https://example.test', '--pages', '2x'], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 2)
  assert.match(result.stderr, /--pages must be an integer from 1 to 5/)
})

test('CLI keeps JSON stdout parseable during a real extraction', { skip: !browserPath, timeout: 90_000 }, async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html>
      <html><head><style>
        :root { --brand: #2563eb; --space: 16px; }
        body { color: #111827; background: #f9fafb; font: 16px/1.5 Arial, sans-serif; }
        main { max-width: 720px; margin: 48px auto; padding: var(--space); }
        button { color: white; background: var(--brand); border: 0; border-radius: 8px; padding: 8px 16px; }
      </style></head><body><main><h1>CLI fixture</h1><p>Deterministic local content.</p><button>Continue</button></main></body></html>`)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const result = await collectChild(
    spawn(
      process.execPath,
      [
        cliPath,
        'extract',
        `http://127.0.0.1:${address.port}`,
        '--no-session',
        '--browser-path',
        browserPath,
        '--pages',
        '1',
        '--json-stdout',
        '--quiet',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  )

  assert.equal(result.code, 0, result.stderr)
  const tokens = JSON.parse(result.stdout)
  assert.ok(tokens.colors)
  assert.doesNotMatch(result.stdout, /\[imprint\]/)
  assert.match(result.stderr, /\[imprint\] headless browser resolved:/)
})

test('CLI maps SIGINT to cancellation exit code 130', { skip: !browserPath, timeout: 20_000 }, async () => {
  const child = spawn(
    process.execPath,
    [cliPath, 'extract', 'http://127.0.0.1:9', '--no-session', '--browser-path', browserPath, '--pages', '1'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  let stderr = ''
  let signalled = false
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    stderr += chunk
    if (!signalled && stderr.includes('[7%]')) {
      signalled = true
      child.kill('SIGINT')
    }
  })

  const exit = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })

  assert.equal(signalled, true, stderr)
  assert.deepEqual(exit, { code: 130, signal: null })
  assert.match(stderr, /Analysis cancelled/)
})
