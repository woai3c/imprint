import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright-core'

import { detectAuthWall } from '../../dist/core/analyzer/auth-wall.js'
import { findHeadlessBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { navigateWithRecovery } from '../../dist/core/analyzer/navigation.js'
import { ensurePageHealth } from '../../dist/core/analyzer/page-health.js'

let browser
let server
let baseUrl
const requestCounts = new Map()

before(async () => {
  server = http.createServer((request, response) => {
    requestCounts.set(request.url, (requestCounts.get(request.url) || 0) + 1)
    if (request.url === '/empty' || request.url === '/plain') {
      const body = request.url === '/empty' ? '' : 'Upstream unavailable'
      response.writeHead(502, { 'content-type': 'text/plain', 'content-length': Buffer.byteLength(body) })
      response.end(body)
      return
    }
    response.writeHead(request.url === '/auth' ? 401 : 200, { 'content-type': 'text/html' })
    response.flushHeaders()
    setTimeout(
      () => response.end('<!doctype html><main><h1>Delayed HTML document</h1><p>Readable content.</p></main>'),
      100,
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
  const executablePath = findHeadlessBrowser()
  if (!executablePath) throw new Error('Chrome/Edge is required for navigation E2E coverage')
  browser = await chromium.launch({ executablePath, headless: true })
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => server?.close(resolve))
})

test('preserves empty and non-HTML HTTP errors without treating them as recoverable empty shells', async () => {
  const page = await browser.newPage()
  try {
    for (const route of ['/empty', '/plain']) {
      const url = `${baseUrl}${route}`
      const navigation = await navigateWithRecovery(page, url, { timeoutMs: 2_000, retry: false })
      assert.equal(navigation.status, 502)
      const health = await ensurePageHealth(page, { expectedUrl: url, responseStatus: navigation.status })
      assert.equal(health.status, 'unusable')
      assert.equal(health.evidenceEligible, false)
      assert.equal(health.recovered, false)
      assert.ok(health.issues.some((issue) => issue.code === 'error-page' && issue.detail === '502'))
      assert.equal(requestCounts.get(route), 1)
    }
  } finally {
    await page.close()
  }
})

test('still waits for delayed HTML and preserves HTTP authentication evidence', async () => {
  const page = await browser.newPage()
  try {
    for (const [route, status] of [
      ['/healthy', 200],
      ['/auth', 401],
    ]) {
      const navigation = await navigateWithRecovery(page, `${baseUrl}${route}`, { timeoutMs: 2_000, retry: false })
      assert.equal(navigation.status, status)
      assert.equal(await page.locator('main h1').textContent(), 'Delayed HTML document')
      assert.equal((await detectAuthWall(page, navigation.status)).detected, status === 401)
    }
  } finally {
    await page.close()
  }
})
