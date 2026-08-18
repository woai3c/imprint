import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

import { findBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { detectComponents } from '../../dist/core/analyzer/component-detect.js'
import { extractStyles } from '../../dist/core/analyzer/style-extractor.js'
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
  assert.equal(observations[0].after.ariaExpanded, 'true')
  assert.equal(observations[0].after.controlledHidden, 'false')
  assert.equal(unsafeWriteRequests, 0, 'Non-GET side effects must be blocked before reaching the fixture server')
  await page.close()
})

test('discards an interaction observation when restoring the control leaves page geometry changed', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <main>
      <button aria-expanded="false" aria-controls="panel" onclick="
        this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
        document.getElementById('panel').toggleAttribute('hidden');
        document.querySelector('.payload')?.remove();
      ">Details</button>
      <section id="panel" hidden>Panel</section>
      <div class="payload" style="height:1400px">Long content</div>
    </main>`)
  const evidence = await extractPageEvidence(page, 'desktop')

  const observations = await observeSafeInteractions(page, evidence, 1, 3_000)

  assert.equal(observations.length, 0)
  await page.close()
})

test('extracts the painted input wrapper and does not assume every root route is a landing page', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; color:#172033; }
      main { min-height:500px; padding:32px; }
      .search-shell { display:flex; width:360px; height:40px; padding:0 16px; border-radius:20px; background:rgb(243, 246, 250); }
      input { width:100%; border:0; border-radius:0; padding:0; background:transparent; }
    </style>
    <main>
      <div class="search-shell"><input role="combobox" aria-label="Search"></div>
      <div class="feed"><h2>Recommended</h2><p>A signed-in feed can live at the root URL without being a landing page.</p></div>
    </main>`)

  const detected = await detectComponents(page)
  const detectedInput = detected.find((component) => component.type === 'input')
  const evidence = await extractPageEvidence(page, 'desktop')
  const evidenceInput = evidence.components.find((component) => component.type === 'input')

  assert.equal(detectedInput?.styles.borderRadius, '20px')
  assert.equal(detectedInput?.styles.backgroundColor, 'rgb(243, 246, 250)')
  assert.equal(evidenceInput?.styles.borderRadius, '20px')
  assert.equal(evidenceInput?.styles.backgroundColor, 'rgb(243, 246, 250)')
  assert.equal(Math.round((evidenceInput?.rect.height || 0) * evidence.height), 40)
  assert.equal(evidence.role, 'unknown')
  await page.close()
})

test('classifies a long repeated feed as a content page while preserving its feature-group section', async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  const items = Array.from(
    { length: 4 },
    (_, index) =>
      `<article><h2>Feed item ${index + 1}</h2><p>${'A repeated feed remains page-level content. '.repeat(8)}</p></article>`,
  ).join('')
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; }
      main { padding:16px; }
      article { min-height:160px; padding:16px; border-bottom:1px solid #ddd; }
    </style>
    <main>${items}</main>`)

  const evidence = await extractPageEvidence(page, 'mobile')

  assert.equal(evidence.role, 'content')
  assert.ok(evidence.sections.some((section) => section.role === 'feature-group'))
  await page.close()
})

test('recognizes workspace and content routes by general URL semantics', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(new URL('/editor', fixtureUrl).href, { waitUntil: 'domcontentloaded' })
  const workspace = await extractPageEvidence(page, 'desktop')

  await page.goto(new URL('/article', fixtureUrl).href, { waitUntil: 'domcontentloaded' })
  const content = await extractPageEvidence(page, 'desktop')

  assert.equal(workspace.role, 'workspace')
  assert.equal(content.role, 'content')
  await page.close()
})

test('classifies a public profile before generic table and navigation heuristics', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <main>
      <header><nav><a href="/profile">Overview</a></nav></header>
      <section itemscope itemtype="https://schema.org/Person">
        <h1 itemprop="name">Sample creator</h1><span itemprop="additionalName">sample-creator</span>
      </section>
      <div role="tablist"><button role="tab">Contributions</button></div>
      <table><tbody><tr><td>Recent activity</td></tr></tbody></table>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')

  assert.equal(evidence.role, 'profile')
  await page.close()
})

test('uses machine semantics for action intent across localized labels', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { display:block; min-height:400px; }
      button, input { display:block; width:120px; height:40px; margin:8px; border:0; color:white; }
      input[type="submit"], [data-intent="primary"] { background:rgb(21, 94, 239); }
      [data-intent="destructive"] { background:rgb(180, 35, 24); }
    </style>
    <main>
      <section>
        <input type="submit" value="Save">
        <button data-intent="primary">متابعة</button>
        <button data-intent="destructive">Eliminar</button>
        <button data-intent="destructive">削除</button>
        <button>删除</button>
      </section>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const primaryActions = evidence.components.filter((component) => component.role === 'primary-action')
  const destructiveActions = evidence.components.filter((component) => component.role === 'destructive-action')
  const genericActions = evidence.components.filter((component) => component.role === 'action')
  const statuses = evidence.components.filter((component) => component.type === 'status')

  assert.equal(primaryActions.length, 2)
  assert.equal(destructiveActions.length, 2)
  assert.equal(genericActions.length, 1)
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

test('excludes one-pixel live regions from visual status evidence and style roles', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .sr-status { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0, 0, 0, 0); background:#b42318; color:white; }
    </style>
    <main><div role="status" class="sr-status">Saved</div><p>Visible content</p></main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const styles = await extractStyles(page)

  assert.equal(
    evidence.components.some((component) => component.type === 'status'),
    false,
  )
  assert.equal(
    Object.keys(styles.usageCount).some((key) => key.startsWith('status')),
    false,
  )
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

test('excludes pseudo elements hidden by display, visibility, or opacity', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .display-hidden::after, .visibility-hidden::after, .opacity-hidden::after, .visible::after {
        content:'Tooltip';
        background:rgb(37, 41, 46);
        color:white;
      }
      .display-hidden::after { display:none; }
      .visibility-hidden::after { visibility:hidden; }
      .opacity-hidden::after { opacity:0; }
      .visible::after { display:inline; visibility:visible; opacity:1; }
    </style>
    <main>
      <button class="display-hidden">Display</button>
      <button class="visibility-hidden">Visibility</button>
      <button class="opacity-hidden">Opacity</button>
      <button class="visible">Visible</button>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const tooltips = evidence.pseudoElements.filter((pseudo) => pseudo.styles.content === '"Tooltip"')

  assert.equal(tooltips.length, 1)
  assert.match(tooltips[0].target, /button:nth-of-type\(4\)/)
  await page.close()
})

test('requires a material first-letter difference before recording pseudo evidence', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .ordinary { line-height:normal; }
      .drop-cap::first-letter { float:left; font-size:48px; color:rgb(153, 27, 27); }
    </style>
    <main><p class="ordinary">Ordinary paragraph</p><p class="drop-cap">Editorial paragraph</p></main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const firstLetters = evidence.pseudoElements.filter((pseudo) => pseudo.kind === 'first-letter')

  assert.equal(firstLetters.length, 1)
  assert.match(firstLetters[0].target, /p:nth-of-type\(2\)/)
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

test('keeps a strongly bounded one-off dashboard panel as card evidence', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; background:#f3f4f6; }
      main { padding:32px; }
      .dashboard-panel { width:520px; min-height:180px; padding:24px; border:1px solid #d1d5db; border-radius:16px; background:white; }
    </style>
    <main><section class="dashboard-panel"><h2>Creator overview</h2><p>This panel is unique but has a clear visual surface.</p><button>Open report</button></section></main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const panels = evidence.components.filter((component) => component.type === 'card')

  assert.equal(panels.length, 1)
  assert.ok(panels[0].confidence >= 0.62)
  await page.close()
})

test('does not classify a full-width page section as a card component', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; }
      .action-section { width:100%; padding:64px 24px; border-radius:48px 48px 0 0; background:#431407; color:white; text-align:center; }
    </style>
    <main><section class="action-section"><h2>Choose a path</h2><p>This is a page region, not a reusable card.</p><button>Continue</button></section></main>`)

  const patterns = await detectComponents(page)
  const evidence = await extractPageEvidence(page, 'desktop')

  assert.equal(
    patterns.some((component) => component.type === 'card'),
    false,
  )
  assert.equal(
    evidence.components.some((component) => component.type === 'card'),
    false,
  )
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
