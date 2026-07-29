import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

import { findBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { detectComponents } from '../../dist/core/analyzer/component-detect.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const fixturePath = path.join(repoRoot, 'tests', 'e2e', 'fixtures', 'design-system.html')

let browser
let fixtureServer
let fixtureUrl

before(async () => {
  const fixture = await fs.readFile(fixturePath)
  fixtureServer = http.createServer((_request, response) => {
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': fixture.length,
      'content-type': 'text/html; charset=utf-8',
    })
    response.end(fixture)
  })

  await new Promise((resolve, reject) => {
    fixtureServer.once('error', reject)
    fixtureServer.listen(0, '127.0.0.1', resolve)
  })

  const address = fixtureServer.address()
  if (!address || typeof address === 'string') throw new Error('Fixture server did not expose a TCP port')
  fixtureUrl = `http://127.0.0.1:${address.port}/`

  const executablePath = findBrowser()
  assert.ok(executablePath, 'Chrome or Edge is required for the component detection E2E test')
  browser = await chromium.launch({ executablePath, headless: true })
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => fixtureServer?.close(resolve))
})

test('detects visible semantic components and a visually bounded card', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    const hiddenModal = document.createElement('div')
    hiddenModal.className = 'modal'
    hiddenModal.setAttribute('role', 'dialog')
    hiddenModal.style.cssText = 'display:none;position:fixed;z-index:50'
    document.body.append(hiddenModal)

    const decorativeButtonClass = document.createElement('div')
    decorativeButtonClass.className = 'button'
    decorativeButtonClass.textContent = 'Not interactive'
    document.body.append(decorativeButtonClass)
  })

  const components = await detectComponents(page)
  const byType = new Map(components.map((component) => [component.type, component]))

  assert.equal(byType.get('button')?.count, 1)
  assert.ok((byType.get('button')?.confidence || 0) >= 0.95)
  assert.deepEqual(byType.get('button')?.evidence, ['native-element'])

  assert.equal(byType.get('navigation')?.count, 1)
  assert.ok((byType.get('navigation')?.confidence || 0) >= 0.95)

  assert.equal(byType.get('card')?.count, 1)
  assert.ok((byType.get('card')?.confidence || 0) >= 0.75)
  assert.ok(byType.get('card')?.evidence.includes('border-boundary'))

  assert.equal(byType.has('modal'), false, 'Hidden dialogs must not be reported')
  await page.close()
})
