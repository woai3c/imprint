import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { getManagedProfileDir, getManagedStorageStatePath } from '../../dist/core/analyzer/browser-session.js'
import { analyze } from '../../dist/core/analyzer/index.js'

const loginPage = Buffer.from(`<!doctype html>
<html lang="en">
  <head><title>Sign in</title></head>
  <body>
    <main>
      <h1>Sign in</h1>
      <form><label>Password <input type="password" /></label><button type="submit">Sign in</button></form>
    </main>
  </body>
</html>`)

const privatePage = Buffer.from(`<!doctype html>
<html lang="en">
  <head>
    <title>Private dashboard</title>
    <style>
      :root { --brand: #635bff; --surface: #ffffff; }
      body { margin: 0; color: #172b4d; background: var(--surface); font: 16px/1.5 system-ui; }
      main { max-width: 720px; margin: 48px auto; padding: 32px; border-radius: 16px; box-shadow: 0 16px 48px #172b4d1f; }
      button { color: white; background: var(--brand); border: 0; border-radius: 8px; padding: 12px 18px; }
    </style>
  </head>
  <body><main><h1>Private dashboard</h1><p>Authenticated design system fixture.</p><button>Continue</button></main></body>
</html>`)

test('hands a completed login from visible Chrome to silent analysis', { timeout: 120_000 }, async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-auth-session-'))
  const server = http.createServer((request, response) => {
    const authenticated = request.headers.cookie?.split(/;\s*/).includes('imprint_auth_e2e=1') ?? false
    const headedBrowser = !/HeadlessChrome/i.test(request.headers['user-agent'] || '')
    const body = authenticated ? privatePage : loginPage
    const headers = {
      'cache-control': 'no-store',
      'content-length': body.length,
      'content-type': 'text/html; charset=utf-8',
    }
    if (!authenticated && headedBrowser) {
      headers['set-cookie'] = 'imprint_auth_e2e=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600'
    }
    response.writeHead(200, headers)
    response.end(body)
  })

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const url = `http://127.0.0.1:${address.port}/private`

    let loginDecisions = 0
    const firstResult = await analyze(url, {
      authMode: 'managed',
      dataDir,
      extractDarkMode: false,
      maxPages: 1,
      onLoginRequired: async () => {
        loginDecisions += 1
        return 'continue'
      },
      viewports: ['desktop'],
    })

    assert.equal(firstResult.accessMode, 'managed')
    assert.equal(loginDecisions, 1)
    const storageStatePath = getManagedStorageStatePath(dataDir, url)
    await fs.access(storageStatePath)
    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(storageStatePath)).mode & 0o777, 0o600)
    }

    const profileDir = getManagedProfileDir(dataDir, url)
    const preservedFiles = new Set(['imprint-session.json', 'imprint-storage-state.json'])
    for (const entry of await fs.readdir(profileDir)) {
      if (!preservedFiles.has(entry)) await fs.rm(path.join(profileDir, entry), { force: true, recursive: true })
    }

    const secondResult = await analyze(url, {
      authMode: 'auto',
      dataDir,
      extractDarkMode: false,
      maxPages: 1,
      viewports: ['desktop'],
    })
    assert.equal(secondResult.accessMode, 'managed')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await fs.rm(dataDir, { force: true, recursive: true })
  }
})
