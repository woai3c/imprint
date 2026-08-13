import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

import { findBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { detectComponents } from '../../dist/core/analyzer/component-detect.js'
import { observeSafeInteractions } from '../../dist/core/design-evidence/interaction-observer.js'
import { extractPageEvidence } from '../../dist/core/design-evidence/page-extractor.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const fixturePath = path.join(repoRoot, 'tests', 'e2e', 'fixtures', 'design-system.html')

let browser
let fixtureServer
let fixtureUrl
let unsafeWriteRequests = 0

before(async () => {
  const fixture = await fs.readFile(fixturePath)
  fixtureServer = http.createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/unsafe-write') unsafeWriteRequests += 1
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

  assert.equal(byType.get('button')?.count, 4)
  assert.ok((byType.get('button')?.confidence || 0) >= 0.95)
  assert.deepEqual(byType.get('button')?.evidence, ['native-element'])

  assert.equal(byType.get('navigation')?.count, 1)
  assert.ok((byType.get('navigation')?.confidence || 0) >= 0.95)

  assert.equal(byType.get('card')?.count, 1)
  assert.ok((byType.get('card')?.confidence || 0) >= 0.75)
  assert.ok(byType.get('card')?.evidence.includes('border-boundary'))

  assert.equal(byType.has('modal'), false, 'Hidden dialogs must not be reported')

  const evidence = await extractPageEvidence(page, 'desktop')
  assert.equal(evidence.interactionCandidates.length, 2)
  assert.equal(evidence.interactionCandidates[0].kind, 'disclosure')
  for (const candidate of evidence.interactionCandidates) {
    assert.equal(
      await page.locator(candidate.locator).evaluate((element) => Boolean(element.closest('form'))),
      false,
      'Form controls must never enter the safe active-interaction allowlist',
    )
  }
  const observations = await observeSafeInteractions(page, evidence, 10)
  assert.equal(observations.length, 1, 'Only the restorable local disclosure should produce active evidence')
  assert.equal(unsafeWriteRequests, 0, 'Non-GET side effects must be blocked before reaching the fixture server')
  await page.close()
})

test('shares submit, localized confirmation, and destructive roles with style extraction', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { display:block; min-height:400px; }
      button, input { display:block; width:120px; height:40px; margin:8px; border:0; color:white; }
      input[type="submit"], #confirm { background:rgb(21, 94, 239); }
      #delete-en, #delete-zh { background:rgb(180, 35, 24); }
    </style>
    <main>
      <section>
        <input type="submit" value="Save">
        <button id="confirm">确认</button>
        <button id="delete-en">Delete</button>
        <button id="delete-zh">删除</button>
      </section>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const primaryActions = evidence.components.filter((component) => component.role === 'primary-action')
  const destructiveActions = evidence.components.filter((component) => component.role === 'destructive-action')
  const statuses = evidence.components.filter((component) => component.type === 'status')

  assert.equal(primaryActions.length, 2)
  assert.equal(destructiveActions.length, 2)
  assert.ok(destructiveActions.every((component) => component.type === 'button'))
  assert.equal(statuses.length, 0)
  await page.close()
})

test('keeps voting controls as action components instead of statuses', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      button { width:96px; height:36px; color:#175199; background:#e5f2ff; border:0; }
    </style>
    <main>
      <button class="VoteButton VoteButton--up">赞同</button>
      <button class="VoteButton VoteButton--down">反对</button>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const votes = evidence.components.filter((component) => component.type === 'button')

  assert.equal(votes.length, 2)
  assert.ok(votes.every((component) => component.role === 'action'))
  assert.equal(evidence.components.filter((component) => component.type === 'status').length, 0)
  await page.close()
})

test('keeps aria-live controls as actions while preserving non-interactive live regions', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      button, [role="status"] { width:120px; height:36px; color:#175199; background:#e5f2ff; }
    </style>
    <main>
      <button aria-live="polite" class="VoteButton VoteButton--up">赞同</button>
      <div role="status" class="status success">已保存</div>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')

  assert.equal(evidence.components.filter((component) => component.type === 'button').length, 1)
  assert.equal(evidence.components.filter((component) => component.type === 'status').length, 1)
  await page.close()
})

test('records only the outermost heuristic status component', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .status { display:block; width:180px; height:40px; background:#b54708; color:white; }
      .status-label { display:block; width:120px; height:24px; }
    </style>
    <main>
      <section>
        <div class="status warning">
          <span class="status-label warning">Warning</span>
        </div>
      </section>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const statuses = evidence.components.filter((component) => component.type === 'status')

  assert.equal(statuses.length, 1)
  assert.match(statuses[0].key, /div/)
  await page.close()
})

test('keeps a visually bounded heuristic status component instead of splitting its icon and label', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .status { display:flex; width:180px; min-height:40px; padding:8px 12px; background:rgb(181, 71, 8); color:white; }
      .status-icon, .status-label { display:inline-block; }
    </style>
    <main>
      <section>
        <div class="status warning">
          <span class="status-icon warning">!</span>
          <span class="status-label warning">Warning</span>
        </div>
      </section>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const statuses = evidence.components.filter((component) => component.type === 'status')

  assert.equal(statuses.length, 1)
  assert.equal(statuses[0].styles.backgroundColor, 'rgb(181, 71, 8)')
  assert.match(statuses[0].key, /div/)
  await page.close()
})

test('splits a padded transparent status-list into independently painted heuristic components', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:240px; }
      .status-list { display:grid; gap:8px; width:220px; padding:8px; }
      .status { display:block; width:180px; height:40px; color:white; }
      .success { background:rgb(6, 118, 71); }
      .warning { background:rgb(181, 71, 8); }
    </style>
    <main>
      <section>
        <div class="status-list">
          <div class="status success">Healthy</div>
          <div class="status warning">Warning</div>
        </div>
      </section>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const statuses = evidence.components.filter((component) => component.type === 'status')

  assert.equal(statuses.length, 2)
  assert.deepEqual(statuses.map((component) => component.styles.backgroundColor).sort(), [
    'rgb(181, 71, 8)',
    'rgb(6, 118, 71)',
  ])
  await page.close()
})

test('preserves sibling ARIA status components inside a heuristic status-list container', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:240px; }
      .status-list { display:grid; gap:8px; width:200px; }
      [role="status"], [role="alert"], [aria-live] { display:block; width:180px; height:40px; color:white; }
      .success { background:rgb(6, 118, 71); }
      .warning { background:rgb(181, 71, 8); }
      .danger { background:rgb(180, 35, 24); }
      .notice { background:rgb(124, 58, 237); }
    </style>
    <main>
      <section>
        <div class="status-list">
          <div role="status" class="success">Healthy</div>
          <div role="status" class="warning">Warning</div>
          <div role="alert" class="danger">Error</div>
          <div aria-live="polite" class="notice">Update available</div>
        </div>
      </section>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const statuses = evidence.components.filter((component) => component.type === 'status')

  assert.equal(statuses.length, 4)
  assert.deepEqual(statuses.map((component) => component.styles.backgroundColor).sort(), [
    'rgb(124, 58, 237)',
    'rgb(180, 35, 24)',
    'rgb(181, 71, 8)',
    'rgb(6, 118, 71)',
  ])
  assert.deepEqual(statuses.map((component) => component.role).sort(), [
    'status-negative',
    'status-neutral',
    'status-positive',
    'status-warning',
  ])
  await page.close()
})

test('drops blank pseudo geometry while retaining blank pseudo elements with a visible border', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .geometry-only::before {
        content:' ';
        display:block;
        width:120px;
        height:32px;
        border-radius:4px;
      }
      .bordered::before {
        content:' ';
        display:block;
        width:120px;
        height:32px;
        border-top:3px solid rgb(153, 27, 27);
      }
    </style>
    <main>
      <div class="geometry-only">Geometry only</div>
      <div class="bordered">Bordered decoration</div>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')

  assert.equal(evidence.pseudoElements.filter((pseudo) => pseudo.kind === 'before').length, 1)
  assert.equal(evidence.pseudoElements[0].styles.borderTop, '3px solid rgb(153, 27, 27)')
  await page.close()
})

test('applies the deep card limit after cheap candidate qualification', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { display:block; }
      .card { width:160px; height:72px; padding:8px; border:1px solid #ddd; border-radius:8px; }
    </style>
    <main id="content"></main>`)
  await page.evaluate(() => {
    const root = document.querySelector('#content')
    for (let index = 0; index < 1201; index += 1) {
      const span = document.createElement('span')
      span.textContent = String(index)
      root.append(span)
    }
    for (let index = 0; index < 2; index += 1) {
      const card = document.createElement('div')
      card.className = 'card'
      card.textContent = `Card ${index + 1}`
      root.append(card)
    }
  })

  const evidence = await extractPageEvidence(page, 'desktop')

  assert.equal(evidence.components.filter((component) => component.type === 'card').length, 2)
  await page.close()
})

test('bounds deep card geometry work instead of rescanning every sibling for every element', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { display:grid; grid-template-columns:repeat(4, 160px); gap:8px; }
      .card { width:160px; height:72px; padding:8px; border:1px solid #ddd; border-radius:8px; }
    </style>
    <main id="cards"></main>
    <script>
      const root = document.querySelector('#cards')
      for (let index = 0; index < 1600; index += 1) {
        const card = document.createElement('div')
        card.className = 'card'
        card.textContent = String(index)
        root.append(card)
      }
    </script>`)
  await page.evaluate(() => {
    const nativeRect = Element.prototype.getBoundingClientRect
    window.__imprintRectCalls = 0
    Element.prototype.getBoundingClientRect = function (...args) {
      window.__imprintRectCalls += 1
      return nativeRect.apply(this, args)
    }
  })

  const evidence = await extractPageEvidence(page, 'desktop')
  const rectCalls = await page.evaluate(() => window.__imprintRectCalls)

  assert.ok(rectCalls < 100_000, `expected bounded geometry work, observed ${rectCalls} rect reads`)
  assert.ok(evidence.components.filter((component) => component.type === 'card').length <= 250)
  await page.close()
})
