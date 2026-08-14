import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright-core'

import { findHeadlessBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { clusterColors, normalizeColorValue } from '../../dist/core/analyzer/color-cluster.js'
import { freezePageAnimations, preparePageForExtraction } from '../../dist/core/analyzer/page-preparer.js'
import { detectTechStack, extractInteractionStyles, extractStyles } from '../../dist/core/analyzer/style-extractor.js'

let browser
let page

before(async () => {
  const executablePath = findHeadlessBrowser()
  if (!executablePath) throw new Error('Chrome/Edge is required for style extraction E2E coverage')
  if (process.platform === 'darwin' && executablePath.includes('.app/Contents/MacOS/')) {
    throw new Error('Run pnpm browser:install before this test so macOS does not launch the system Chrome app')
  }
  browser = await chromium.launch({ executablePath, headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
})

after(async () => {
  await browser?.close()
})

test('prepares dynamic pages and extracts modern tokens plus computed interaction states', async () => {
  await page.setContent(`<!doctype html>
    <style>
      @layer theme {
        :root, :host {
          --brand-primary: oklch(62% 0.2 250);
          --brand-primary-hover: oklch(54% 0.22 250);
          --brand-danger-primary: rgb(220, 38, 38);
          --page-background: oklch(97% 0.01 250);
          --text-foreground: oklch(20% 0.02 250);
        }
        html, body { margin: 0; min-height: 100%; }
        body {
          min-height: 2400px;
          overflow: hidden;
          color: var(--text-foreground);
          background: var(--page-background);
        }
        button {
          margin: 24px;
          padding: 12px 20px;
          color: white;
          background: var(--brand-primary);
          border: 1px solid var(--brand-primary);
          transition: background-color 180ms ease, outline-color 180ms ease;
        }
        button:hover { background-color: oklch(54% 0.22 250); }
        button:focus { outline: 3px solid oklch(72% 0.18 250); }
        button:disabled { color: oklch(45% 0.01 250); background: oklch(88% 0.01 250); }
        button.danger { background: rgb(220, 38, 38); }
        #lazy-card { display: none; height: 120px; background: oklch(70% 0.18 150); }
        #cookie-banner {
          position: fixed;
          inset: auto 0 0;
          height: 180px;
          z-index: 9999;
          color: white;
          background: rgb(255, 0, 0);
        }
        #activity-modal {
          display: none;
          position: fixed;
          inset: 80px 120px;
          z-index: 9998;
          background: rgb(255, 0, 255);
        }
        @keyframes pulse { from { opacity: .4; } to { opacity: 1; } }
        .animated { animation: pulse 2s infinite; }
      }
    </style>
    <main>
      <button class="animated cta">Primary action</button>
      <button disabled>Unavailable</button>
      <button class="danger">Delete</button>
      <div style="height:900px"></div>
      <section id="lazy-card">Lazy content</section>
    </main>
    <aside id="cookie-banner" role="dialog">We use cookies. Manage preferences.</aside>
    <aside id="activity-modal" class="campaign-modal" role="dialog" aria-modal="true">
      <button aria-label="Close promotion" onclick="this.parentElement.style.display = 'none'">×</button>
      Limited-time campaign
    </aside>
    <script>
      addEventListener('scroll', () => {
        if (scrollY > 300) {
          document.querySelector('#lazy-card').style.display = 'block'
          document.querySelector('#activity-modal').style.display = 'block'
        }
      })
    </script>`)

  const preparation = await preparePageForExtraction(page)
  assert.equal(preparation.issues.length, 0)
  assert.equal(preparation.hiddenObstructions, 1)
  assert.equal(preparation.dismissedObstructions, 1)
  assert.equal(await page.locator('#cookie-banner').evaluate((element) => getComputedStyle(element).display), 'none')
  assert.equal(await page.locator('#activity-modal').evaluate((element) => getComputedStyle(element).display), 'none')
  assert.equal(await page.locator('#lazy-card').evaluate((element) => getComputedStyle(element).display), 'block')

  assert.equal(await freezePageAnimations(page), null)
  const styles = await extractStyles(page)

  assert.equal(styles.cssVariables['--brand-primary'], 'oklch(62% 0.2 250)')
  assert.ok(Object.keys(styles.usageCount).some((key) => key.startsWith('brandTokenColor:rgb(')))
  assert.equal(Object.keys(styles.usageCount).filter((key) => key.startsWith('brandTokenColor:')).length, 1)
  assert.ok(Object.keys(styles.usageCount).some((key) => key.startsWith('primaryActionBackgroundColor:rgb(')))
  assert.ok(styles.usageCount['destructiveActionBackgroundColor:rgb(220, 38, 38)'] > 0)
  assert.equal(styles.usageCount['actionBackgroundColor:rgb(220, 38, 38)'], undefined)
  assert.ok(styles.colors.every((color) => !/okl(?:ab|ch)\(/i.test(color)))

  const lazyBackground = await page.locator('#lazy-card').evaluate((element) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.fillStyle = getComputedStyle(element).backgroundColor
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
    return `rgb(${red}, ${green}, ${blue})`
  })
  assert.ok(styles.usageCount[`bgColor:${lazyBackground}`] > 0)
  assert.equal(styles.usageCount['bgColor:rgb(255, 0, 0)'], undefined)
  assert.equal(styles.usageCount['bgColor:rgb(255, 0, 255)'], undefined)

  const clustered = clusterColors(styles.colors, styles.usageCount, styles.usageCount)
  const brandColor = Object.keys(styles.usageCount)
    .find((key) => key.startsWith('brandTokenColor:'))
    ?.slice('brandTokenColor:'.length)
  assert.ok(brandColor)
  assert.equal(clustered.accents[0], normalizeColorValue(brandColor))

  const interactions = await extractInteractionStyles(page)
  assert.ok(interactions.hover.some((state) => state.after['background-color']?.startsWith('rgb(')))
  assert.ok(interactions.focus.some((state) => state.after['outline-color']?.startsWith('rgb(')))
  const computedFocus = interactions.focus.find((state) => state.changedProperties?.includes('outline-color'))
  assert.ok(computedFocus)
  assert.equal(computedFocus.after['outline-style'], 'solid')
  assert.equal(computedFocus.after['outline-width'], '3px')
  assert.equal(computedFocus.after['box-shadow'], 'none')
  assert.ok((interactions.disabled?.length || 0) > 0)
  assert.equal(await page.evaluate(() => window.scrollY), 0)
})

test('keeps submit and localized confirmation colors primary while excluding destructive action colors', async () => {
  await page.setContent(`<!doctype html>
    <style>
      button, input { display:block; width:120px; height:40px; margin:8px; border:0; color:white; }
      input[type="submit"], #confirm { background:rgb(21, 94, 239); }
      #delete-en, #delete-zh { background:rgb(180, 35, 24); }
    </style>
    <main>
      <input type="submit" value="Save">
      <button id="confirm">确认</button>
      <button id="delete-en">Delete</button>
      <button id="delete-zh">删除</button>
    </main>`)

  const styles = await extractStyles(page)
  const roles = styles.colorRoleObservations.map((observation) => observation.role)
  const destructive = styles.colorRoleObservations.filter(
    (observation) => observation.background === 'rgb(180, 35, 24)',
  )

  assert.equal(roles.filter((role) => role === 'primary-action').length, 2)
  assert.equal(destructive.length, 2)
  assert.ok(destructive.every((observation) => observation.role === 'destructive-action'))
  assert.equal(styles.usageCount['actionBackgroundColor:rgb(180, 35, 24)'], undefined)
  assert.equal(styles.usageCount['statusBackgroundColor:rgb(180, 35, 24)'], undefined)
})

test('keeps voting controls as actions instead of treating direction words as statuses', async () => {
  await page.setContent(`<!doctype html>
    <style>
      button { width:96px; height:36px; color:#175199; background:#e5f2ff; border:0; }
    </style>
    <main>
      <button class="VoteButton VoteButton--up">赞同</button>
      <button class="VoteButton VoteButton--down">反对</button>
    </main>`)

  const styles = await extractStyles(page)
  const voteObservations = styles.colorRoleObservations.filter((observation) =>
    observation.elementRef.includes('button'),
  )

  assert.equal(voteObservations.length, 2)
  assert.ok(voteObservations.every((observation) => observation.role === 'action'))
  assert.equal(styles.usageCount['statusBackgroundColor:rgb(229, 242, 255)'], undefined)
})

test('keeps aria-live controls as actions while preserving non-interactive live regions', async () => {
  await page.setContent(`<!doctype html>
    <style>
      button, [role="status"] { width:120px; height:36px; color:#175199; background:#e5f2ff; }
    </style>
    <main>
      <button aria-live="polite" class="VoteButton VoteButton--up">赞同</button>
      <div role="status" class="status success">已保存</div>
    </main>`)

  const styles = await extractStyles(page)

  assert.equal(styles.colorRoleObservations.filter((observation) => observation.role === 'action').length, 1)
  assert.equal(styles.colorRoleObservations.filter((observation) => observation.role === 'status').length, 1)
})

test('samples only the outermost heuristic status root', async () => {
  await page.setContent(`<!doctype html>
    <style>
      .status { display:block; width:180px; height:40px; background:rgb(181, 71, 8); color:white; }
      .status-label { display:block; width:120px; height:24px; }
    </style>
    <main>
      <div class="status warning">
        <span class="status-label warning">Warning</span>
      </div>
    </main>`)

  const styles = await extractStyles(page)
  const statuses = styles.colorRoleObservations.filter((observation) => observation.role === 'status')

  assert.equal(statuses.length, 1)
  assert.match(statuses[0].elementRef, /div/)
})

test('keeps a visually bounded heuristic status instead of splitting its icon and label', async () => {
  await page.setContent(`<!doctype html>
    <style>
      .status { display:flex; width:180px; min-height:40px; padding:8px 12px; background:rgb(181, 71, 8); color:white; }
      .status-icon, .status-label { display:inline-block; }
    </style>
    <main>
      <div class="status warning">
        <span class="status-icon warning">!</span>
        <span class="status-label warning">Warning</span>
      </div>
    </main>`)

  const styles = await extractStyles(page)
  const statuses = styles.colorRoleObservations.filter((observation) => observation.role === 'status')

  assert.equal(statuses.length, 1)
  assert.equal(statuses[0].background, 'rgb(181, 71, 8)')
  assert.equal(statuses[0].statusIntent, 'warning')
  assert.match(statuses[0].elementRef, /div/)
})

test('splits a padded transparent status-list into independently painted heuristic statuses', async () => {
  await page.setContent(`<!doctype html>
    <style>
      .status-list { display:grid; gap:8px; width:220px; padding:8px; }
      .status { display:block; width:180px; height:40px; color:white; }
      .success { background:rgb(6, 118, 71); }
      .warning { background:rgb(181, 71, 8); }
    </style>
    <main>
      <div class="status-list">
        <div class="status success">Healthy</div>
        <div class="status warning">Warning</div>
      </div>
    </main>`)

  const styles = await extractStyles(page)
  const statuses = styles.colorRoleObservations.filter((observation) => observation.role === 'status')

  assert.equal(statuses.length, 2)
  assert.deepEqual(statuses.map((observation) => observation.statusIntent).sort(), ['positive', 'warning'])
  assert.deepEqual(statuses.map((observation) => observation.background).sort(), ['rgb(181, 71, 8)', 'rgb(6, 118, 71)'])
})

test('preserves sibling ARIA statuses inside a heuristic status-list container', async () => {
  await page.setContent(`<!doctype html>
    <style>
      .status-list { display:grid; gap:8px; width:200px; }
      [role="status"], [role="alert"], [aria-live] { display:block; width:180px; height:40px; color:white; }
      .success { background:rgb(6, 118, 71); }
      .warning { background:rgb(181, 71, 8); }
      .danger { background:rgb(180, 35, 24); }
      .notice { background:rgb(124, 58, 237); }
    </style>
    <main>
      <div class="status-list">
        <div role="status" class="success">Healthy</div>
        <div role="status" class="warning">Warning</div>
        <div role="alert" class="danger">Error</div>
        <div aria-live="polite" class="notice">Update available</div>
      </div>
    </main>`)

  const styles = await extractStyles(page)
  const statuses = styles.colorRoleObservations.filter((observation) => observation.role === 'status')

  assert.equal(statuses.length, 4)
  assert.deepEqual(statuses.map((observation) => observation.statusIntent).sort(), [
    'negative',
    'neutral',
    'positive',
    'warning',
  ])
  assert.deepEqual(statuses.map((observation) => observation.background).sort(), [
    'rgb(124, 58, 237)',
    'rgb(180, 35, 24)',
    'rgb(181, 71, 8)',
    'rgb(6, 118, 71)',
  ])
})

test('dismisses transient dialogs inside iframe shadow roots without clicking page-content decoys', async () => {
  await page.setContent(`<!doctype html>
    <style>.campaign-card { width: 240px; height: 120px; }</style>
    <section class="campaign-card"><button class="close" onclick="window.decoyClicked = true">×</button></section>
    <aside class="login-modal" role="dialog" style="position:fixed;inset:80px">
      <button aria-label="Close" onclick="window.authClicked = true">×</button>
      Sign in
    </aside>
    <iframe title="promotion"></iframe>
    <script>window.decoyClicked = false; window.authClicked = false</script>`)
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame())
  assert.ok(frame)
  await frame.setContent(`<!doctype html><promo-dialog></promo-dialog><script>
    customElements.define('promo-dialog', class extends HTMLElement {
      connectedCallback() {
        const root = this.attachShadow({ mode: 'open' })
        root.innerHTML = '<div role="dialog" aria-modal="true" style="position:fixed;inset:40px;background:#f0f"><button aria-label="Close promotion">×</button></div>'
        root.querySelector('button').onclick = () => root.querySelector('[role=dialog]').remove()
      }
    })
  </script>`)

  const preparation = await preparePageForExtraction(page)

  assert.equal(preparation.issues.length, 0)
  assert.equal(preparation.dismissedObstructions, 1)
  assert.equal(await page.evaluate(() => window.decoyClicked), false)
  assert.equal(await page.evaluate(() => window.authClicked), false)
  assert.equal(
    await frame.locator('promo-dialog').evaluate((host) => host.shadowRoot.querySelector('[role=dialog]')),
    null,
  )
})

test('does not mistake generic Emotion classes for MUI', async () => {
  await page.setContent(`<!doctype html><main class="css-1abcde"><button class="css-button">Action</button></main>`)
  const genericCssInJs = await detectTechStack(page)
  assert.equal(genericCssInJs.uiLibraries.includes('MUI'), false)

  await page.locator('button').evaluate((element) => element.classList.add('MuiButton-root'))
  const mui = await detectTechStack(page)
  assert.equal(mui.uiLibraries.includes('MUI'), true)
})

test('reports generic css-* hashes without naming a specific styling library', async () => {
  const generated = Array.from({ length: 8 }, (_, index) => `<p class="css-hash${index}ab">Text ${index}</p>`).join('')
  await page.setContent(`<!doctype html><main>${generated}</main>`)
  const generic = await detectTechStack(page)
  assert.deepEqual(generic.cssApproach, ['CSS-in-JS or generated class names observed'])
  assert.equal(generic.uiLibraries.length, 0)

  await page.evaluate(() => {
    document.querySelectorAll('p').forEach((element, index) => {
      element.className = `sc-widget-${index}`
    })
  })
  const styledComponents = await detectTechStack(page)
  assert.ok(styledComponents.cssApproach.includes('styled-components'))
  assert.equal(styledComponents.cssApproach.includes('CSS-in-JS or generated class names observed'), false)
})

test('requires framework-specific evidence before naming Tailwind or Vite', async () => {
  const genericUtilities = Array.from(
    { length: 24 },
    (_, index) => `<div class="flex grid hidden border rounded shadow p-${index} text-${index}">Item</div>`,
  ).join('')
  await page.setContent(
    `<!doctype html><main>${genericUtilities}</main><script type="module" src="/assets/app.js"></script>`,
  )
  const generic = await detectTechStack(page)
  assert.equal(generic.cssApproach.includes('Tailwind CSS'), false)
  assert.equal(generic.bundler, undefined)

  await page.setContent(
    `<!doctype html><style>:root { --tw-ring-color: #000; }</style><main class="flex grid hidden block inline relative absolute fixed sticky overflow-hidden items-center justify-center gap-2 px-2 py-2 mt-2 mb-2 w-full h-full min-w-0 max-w-full text-sm font-bold bg-white border rounded shadow opacity-90 transition transform z-10 ring-1">Tailwind</main>`,
  )
  const tailwind = await detectTechStack(page)
  assert.ok(tailwind.cssApproach.includes('Tailwind CSS'))
})
