import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright-core'

import { detectAuthWall } from '../../dist/core/analyzer/auth-wall.js'
import { findHeadlessBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { clusterColors, normalizeColorValue } from '../../dist/core/analyzer/color-cluster.js'
import { inspectPageHealth } from '../../dist/core/analyzer/page-health.js'
import { freezePageAnimations, preparePageForExtraction } from '../../dist/core/analyzer/page-preparer.js'
import { selectFoundationSurfaceColors } from '../../dist/core/analyzer/semantic-owner.js'
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

test('reports a non-HTML document without a body as empty instead of crashing health inspection', async () => {
  const nonHtmlPage = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await nonHtmlPage.goto('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>')

  const health = await inspectPageHealth(nonHtmlPage, { expectedUrl: nonHtmlPage.url() })

  assert.equal(health.status, 'unusable')
  assert.ok(health.issues.some((issue) => issue.code === 'main-content-empty'))
  await nonHtmlPage.close()
})

test('assigns the final rendered page canvas without inventing a color for complex paint', async () => {
  const cases = [
    {
      name: 'transparent browser canvas',
      style: 'html, body { margin: 0; min-height: 100%; color: rgb(31, 41, 55); }',
      expectedOwner: 'browser-canvas',
      expectedColor: 'system',
    },
    {
      name: 'html canvas',
      style: 'html { background: rgb(241, 245, 249); } body { margin: 0; color: rgb(31, 41, 55); }',
      expectedOwner: 'html',
      expectedColor: 'rgb(241, 245, 249)',
    },
    {
      name: 'body canvas',
      style:
        'html { background: transparent; } body { margin: 0; background: rgb(243, 244, 246); color: rgb(31, 41, 55); }',
      expectedOwner: 'body',
      expectedColor: 'rgb(243, 244, 246)',
    },
    {
      name: 'covering application root',
      style:
        'html, body { margin: 0; min-height: 100%; } main { min-height: 100vh; background: rgb(254, 252, 232); color: rgb(31, 41, 55); }',
      expectedOwner: 'body > main:nth-of-type(1)',
      expectedColor: 'rgb(254, 252, 232)',
    },
  ]

  for (const fixture of cases) {
    await page.setContent(
      `<!doctype html><style>${fixture.style}</style><main><h1>${fixture.name}</h1><p>${'Visible foundation text. '.repeat(
        20,
      )}</p></main>`,
    )
    const systemCanvas = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.setProperty('background-color', 'Canvas', 'important')
      document.documentElement.append(probe)
      const value = getComputedStyle(probe).backgroundColor
      probe.remove()
      return value
    })
    const expectedColor = fixture.expectedColor === 'system' ? systemCanvas : fixture.expectedColor
    const styles = await extractStyles(page)
    const canvas = styles.semanticSurfaceObservations.find((observation) => observation.role === 'page-canvas')

    assert.equal(canvas?.ownerId, fixture.expectedOwner)
    assert.equal(canvas?.value, expectedColor)
    assert.equal(
      selectFoundationSurfaceColors([{ url: page.url(), viewport: 'desktop', styles }]).background,
      normalizeColorValue(expectedColor),
    )
    assert.ok(
      styles.textColorPairObservations.some((observation) => observation.background === expectedColor),
      `${fixture.name} must pair visible text with the final canvas`,
    )
  }

  await page.setContent(`<!doctype html><style>
    html, body { margin:0; min-height:100%; color:rgb(255, 255, 255); }
    body { background-image:linear-gradient(rgb(15, 23, 42), rgb(30, 41, 59)); }
  </style><main><h1>Complex canvas</h1><p>${'Visible gradient content. '.repeat(20)}</p></main>`)
  const complex = await extractStyles(page)
  assert.equal(
    complex.semanticSurfaceObservations.some((observation) => observation.role === 'page-canvas'),
    false,
  )
  assert.ok(complex.semanticSurfaceLimitations.includes('complex-page-canvas-paint'))
})

test('keeps page chrome surfaces out of the generic foundation surface role', async () => {
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin:0; min-height:100%; background:rgb(243, 244, 246); }
      header, footer { box-sizing:border-box; height:240px; padding:24px; color:white; background:rgb(0, 0, 0); }
      main { padding:24px; }
      article { box-sizing:border-box; min-height:80px; margin:12px 0; padding:16px; background:rgb(255, 255, 255); }
    </style>
    <header><nav>Global navigation</nav></header>
    <main><article>First content surface</article><article>Second content surface</article></main>
    <footer>Global footer</footer>`)

  const styles = await extractStyles(page)
  const chrome = styles.semanticSurfaceObservations.filter((observation) => observation.role === 'chrome-surface')

  assert.equal(chrome.length, 2)
  assert.ok(chrome.every((observation) => observation.domain === 'component'))
  assert.deepEqual(selectFoundationSurfaceColors([{ url: 'https://example.test/', viewport: 'desktop', styles }]), {
    background: '#f3f4f6',
    surface: '#ffffff',
  })
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
      <form onsubmit="event.preventDefault()"><button type="submit" class="animated cta">Primary action</button></form>
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
  assert.equal(preparation.hiddenObstructions, 0)
  assert.equal(preparation.dismissedObstructions, 1)
  assert.equal(await page.locator('#cookie-banner').evaluate((element) => getComputedStyle(element).display), 'block')
  assert.equal(await page.locator('#activity-modal').evaluate((element) => getComputedStyle(element).display), 'none')
  assert.equal(await page.locator('#lazy-card').evaluate((element) => getComputedStyle(element).display), 'block')

  assert.equal(await freezePageAnimations(page), null)
  const styles = await extractStyles(page)

  assert.equal(styles.cssVariables['--brand-primary'], 'oklch(62% 0.2 250)')
  assert.ok(Object.keys(styles.usageCount).some((key) => key.startsWith('brandTokenColor:rgb(')))
  assert.equal(Object.keys(styles.usageCount).filter((key) => key.startsWith('brandTokenColor:')).length, 1)
  assert.ok(Object.keys(styles.usageCount).some((key) => key.startsWith('primaryActionBackgroundColor:rgb(')))
  assert.equal(styles.usageCount['destructiveActionBackgroundColor:rgb(220, 38, 38)'], undefined)
  assert.ok(styles.usageCount['actionBackgroundColor:rgb(220, 38, 38)'] > 0)
  assert.ok(styles.colors.every((color) => !/okl(?:ab|ch)\(/i.test(color)))
  assert.ok(styles.textColorPairObservations.some((observation) => observation.ownerIds?.length > 0))
  assert.ok(
    styles.textColorPairObservations.every(
      (observation) => !observation.ownerIds || new Set(observation.ownerIds).size === observation.count,
    ),
  )

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
  assert.ok(styles.usageCount['bgColor:rgb(255, 0, 0)'] > 0)
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

test('distinguishes page chrome and partial banners from genuinely blocking overlays', async () => {
  const readableMain = `<main style="padding:96px 32px 32px"><h1>Product reference</h1><p>${'Observable design content. '.repeat(12)}</p></main>`

  await page.setContent(`<!doctype html><style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden}
    #application{position:fixed;inset:0;overflow:auto;background:white}
    #application main{padding:96px 32px 32px}
  </style><div id="application"><header><nav>Navigation</nav></header>${readableMain}
    <aside id="legitimate-panel"><button onclick="window.applicationCloseClicked = true; this.parentElement.remove()">×</button>
      Persistent application tools</aside></div><script>window.applicationCloseClicked = false</script>`)
  const fixedApplicationShell = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(fixedApplicationShell.status, 'healthy')
  assert.equal(fixedApplicationShell.evidenceEligible, true)
  assert.equal(fixedApplicationShell.overlayAreaRatio, 0)
  assert.equal(
    fixedApplicationShell.issues.some((issue) => issue.code.includes('overlay')),
    false,
  )
  const fixedApplicationPreparation = await preparePageForExtraction(page)
  assert.equal(fixedApplicationPreparation.dismissedObstructions, 0)
  assert.equal(await page.evaluate(() => window.applicationCloseClicked), false)
  assert.equal(await page.locator('#legitimate-panel').count(), 1)

  await page.setContent(`<!doctype html><style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden}
    #application{position:fixed;inset:0;overflow:auto;background:white}
    #application header,#application article{max-width:900px;margin:auto;padding:32px}
  </style><div id="application"><header><nav>Workspace navigation</nav></header><article>
    <h1>Persistent document workspace</h1><p>${'Standards-backed article content remains part of the application shell. '.repeat(8)}</p>
    <button onclick="window.shellCloseClicked = true; document.getElementById('application').remove()">×</button>
  </article></div><script>window.shellCloseClicked = false</script>`)
  const fixedArticleShell = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(fixedArticleShell.status, 'healthy')
  assert.equal(fixedArticleShell.overlayAreaRatio, 0)
  const fixedArticlePreparation = await preparePageForExtraction(page)
  assert.equal(fixedArticlePreparation.dismissedObstructions, 0)
  assert.equal(await page.evaluate(() => window.shellCloseClicked), false)
  assert.equal(await page.locator('#application').count(), 1)

  await page.setContent(`<!doctype html><style>
    html,body,main{margin:0;width:100%;height:100%;overflow:hidden}
    #nested-application{position:fixed;inset:0;overflow:auto;background:white}
    #nested-application header,#nested-application article{max-width:900px;margin:auto;padding:32px}
  </style><main><div id="nested-application"><header><nav>Nested workspace navigation</nav></header><article>
    <h1>Nested persistent workspace</h1><p>${'The semantic wrapper contains no independent content outside this fixed document shell. '.repeat(8)}</p>
    <button onclick="window.nestedShellCloseClicked = true; document.getElementById('nested-application').remove()">×</button>
  </article></div></main><script>window.nestedShellCloseClicked = false</script>`)
  const nestedFixedShell = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(nestedFixedShell.status, 'healthy')
  assert.equal(nestedFixedShell.overlayAreaRatio, 0)
  const nestedFixedPreparation = await preparePageForExtraction(page)
  assert.equal(nestedFixedPreparation.dismissedObstructions, 0)
  assert.equal(await page.evaluate(() => window.nestedShellCloseClicked), false)
  assert.equal(await page.locator('#nested-application').count(), 1)

  await page.setContent(`<!doctype html><style>
    html,body{margin:0}.blocker{position:fixed;inset:0;background:white;display:grid;place-items:center}
  </style><article><h1>Underlying reference</h1><p>${'Independently meaningful document content remains behind the temporary layer. '.repeat(8)}</p></article>
    <div class="blocker"><button onclick="this.parentElement.remove()">×</button></div>`)
  const genericFixedBlocker = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(genericFixedBlocker.status, 'unusable')
  assert.equal(
    genericFixedBlocker.issues.some((issue) => issue.code === 'large-overlay'),
    true,
  )
  const genericFixedPreparation = await preparePageForExtraction(page)
  assert.equal(genericFixedPreparation.dismissedObstructions, 1)
  assert.equal(await page.locator('.blocker').count(), 0)

  await page.setContent(`<!doctype html><style>
    html,body{margin:0}.nested-blocker{position:fixed;inset:0;z-index:10;background:white;display:grid;place-items:center}
  </style><header><nav>Persistent navigation</nav><div class="nested-blocker">
    <button onclick="this.parentElement.remove()">×</button></div></header>
    <article><h1>Underlying reference</h1><p>${'Independent article content remains behind the temporary layer. '.repeat(8)}</p></article>`)
  const chromeNestedBlocker = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(chromeNestedBlocker.status, 'unusable')
  assert.equal(
    chromeNestedBlocker.issues.some((issue) => issue.code === 'large-overlay'),
    true,
  )
  const chromeNestedPreparation = await preparePageForExtraction(page)
  assert.equal(chromeNestedPreparation.dismissedObstructions, 1)
  assert.equal(await page.locator('.nested-blocker').count(), 0)

  await page.setContent(`<!doctype html><style>
    html,body{margin:0}.panel{position:fixed;inset:80px;background:white;border:1px solid #ccc}
  </style>${readableMain}<aside class="panel" role="dialog"><button onclick="window.panelCloseClicked = true; this.parentElement.remove()">×</button>
    Persistent non-modal tools</aside><script>window.panelCloseClicked = false</script>`)
  const nonModalPreparation = await preparePageForExtraction(page)
  assert.equal(nonModalPreparation.dismissedObstructions, 0)
  assert.equal(await page.evaluate(() => window.panelCloseClicked), false)
  assert.equal(await page.locator('.panel').count(), 1)

  await page.setContent(`<!doctype html><style>html,body{margin:0}header{position:sticky;top:0;height:72px}</style>
    <header><nav aria-label="Primary">Navigation</nav></header>${readableMain}`)
  const stickyHeader = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(stickyHeader.status, 'healthy')
  assert.equal(stickyHeader.evidenceEligible, true)
  assert.equal(
    stickyHeader.issues.some((issue) => issue.code.includes('overlay')),
    false,
  )

  await page.setContent(`<!doctype html><style>html,body{margin:0}header{position:fixed;inset:0 0 auto;height:72px}</style>
    <header><nav aria-label="Primary">Navigation</nav></header>${readableMain}`)
  const fixedHeader = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(fixedHeader.status, 'healthy')
  assert.equal(fixedHeader.evidenceEligible, true)
  assert.equal(
    fixedHeader.issues.some((issue) => issue.code.includes('overlay')),
    false,
  )

  await page.setContent(`<!doctype html><style>
    html,body{margin:0}.notice{position:fixed;inset:auto 0 0;height:140px;background:white;border-top:1px solid #ccc}
  </style>${readableMain}<aside class="notice" role="dialog">Cookie choices remain available.</aside>`)
  const partialBanner = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(partialBanner.status, 'degraded')
  assert.equal(partialBanner.evidenceEligible, true)
  assert.equal(
    partialBanner.issues.some((issue) => issue.code === 'partial-overlay'),
    true,
  )
  assert.equal(
    partialBanner.issues.some((issue) => issue.code === 'large-overlay'),
    false,
  )

  await page.setContent(`<!doctype html><style>
    html,body{margin:0}.blocker{position:fixed;inset:0;background:#fff;display:grid;place-items:center}
  </style>${readableMain}<div class="blocker" role="dialog" aria-modal="true">Blocking choice</div>`)
  const blockingOverlay = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(blockingOverlay.status, 'unusable')
  assert.equal(blockingOverlay.evidenceEligible, false)
  assert.equal(
    blockingOverlay.issues.some((issue) => issue.code === 'large-overlay'),
    true,
  )

  await page.setContent(`<!doctype html><style>
    html,body{margin:0}.backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);pointer-events:none;display:grid;place-items:center}
    .blocking-panel{width:420px;min-height:240px;background:white;pointer-events:auto}
  </style>${readableMain}<div class="backdrop"><div class="blocking-panel" role="dialog">Blocking choice</div></div>`)
  const pointerTransparentBackdrop = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(pointerTransparentBackdrop.status, 'unusable')
  assert.equal(pointerTransparentBackdrop.evidenceEligible, false)
  assert.equal(
    pointerTransparentBackdrop.issues.some((issue) => issue.code === 'large-overlay'),
    true,
  )
})

test('keeps readable animated pages eligible while reporting ongoing DOM mutation', async () => {
  await page.setContent(`<!doctype html>
    <main><h1>Live product overview</h1><p>${'Stable readable design content. '.repeat(12)}</p></main>
    <div id="activity" aria-hidden="true"></div>
    <script>
      const activity = document.querySelector('#activity')
      setInterval(() => activity.setAttribute('data-tick', String(Date.now())), 4)
    </script>`)

  const report = await inspectPageHealth(page, { expectedUrl: page.url() })

  assert.equal(report.status, 'degraded')
  assert.equal(report.evidenceEligible, true)
  assert.ok(report.mutationCount >= 30)
  assert.equal(
    report.issues.some((issue) => issue.code === 'dom-still-mutating'),
    true,
  )
  assert.equal(report.issues.find((issue) => issue.code === 'dom-still-mutating')?.recoverable, false)
})

test('keeps submit colors primary while treating localized and implementation-named buttons as generic actions', async () => {
  await page.setContent(`<!doctype html>
    <style>
      button, input { display:block; width:120px; height:40px; margin:8px; border:0; color:white; }
      input[type="submit"], #confirm { background:rgb(21, 94, 239); }
      #delete-en, #delete-zh { background:rgb(180, 35, 24); }
    </style>
    <main>
      <form><input type="submit" value="Save"></form>
      <button id="confirm">确认</button>
      <button id="delete-en">Delete</button>
      <button id="delete-zh">删除</button>
    </main>`)

  const styles = await extractStyles(page)
  const roles = styles.colorRoleObservations.map((observation) => observation.role)
  const redActions = styles.colorRoleObservations.filter((observation) => observation.background === 'rgb(180, 35, 24)')

  assert.equal(roles.filter((role) => role === 'primary-action').length, 1)
  assert.equal(redActions.length, 2)
  assert.ok(redActions.every((observation) => observation.role === 'action'))
  assert.ok(styles.usageCount['actionBackgroundColor:rgb(180, 35, 24)'] > 0)
  assert.equal(styles.usageCount['destructiveActionBackgroundColor:rgb(180, 35, 24)'], undefined)
  assert.equal(styles.usageCount['statusBackgroundColor:rgb(180, 35, 24)'], undefined)
})

test('classifies oversized fully rounded values as control geometry instead of ordinary radius', async () => {
  await page.setContent(`<!doctype html>
    <style>
      button { display:block; width:40px; height:40px; border-radius:1000px; }
      section { width:300px; height:100px; border-radius:32px; }
    </style>
    <main>
      <button aria-label="Menu">M</button>
      <section>Content</section>
    </main>`)

  const styles = await extractStyles(page)

  assert.deepEqual(styles.valueSources['radius:1000px'], ['geometry:circle-or-pill', 'element:control-radius'])
  assert.deepEqual(styles.valueSources['radius:32px'], ['computed:ordinary-radius', 'element:structural-radius'])
})

test('records negative spacing as geometry instead of reusable structural rhythm', async () => {
  await page.setContent(`<!doctype html>
    <style>
      main { padding:24px; }
      section { margin-left:-16px; padding:16px; }
    </style>
    <main><section><h1>Offset content</h1><p>Observed layout content.</p></section></main>`)

  const styles = await extractStyles(page)

  assert.deepEqual(styles.valueSources['spacing:-16px'], ['geometry:negative-offset'])
  assert.ok(styles.valueSources['spacing:16px'].some((source) => source.startsWith('element:')))
})

test('excludes ancestor-hidden and near-total-clipped text from global typography and foreground usage', async () => {
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; font-family:Arial, sans-serif; color:rgb(20, 30, 40); }
      .visible { font:400 16px/24px Arial, sans-serif; }
      .hidden-owner { opacity:0; }
      .filtered-owner { filter:opacity(0); }
      .filtered-percent-owner { filter:blur(0) opacity(0%); }
      .svg-filter-owner { filter:url(#zero-alpha); }
      .color-filter-owner { filter:brightness(0); }
      .masked-owner { -webkit-mask-image:linear-gradient(transparent, transparent); mask-image:linear-gradient(transparent, transparent); }
      .blended-owner { mix-blend-mode:difference; }
      .clipped-owner { width:120px; height:48px; overflow:hidden; }
      .clipped-owner > span { display:block; width:120px; height:24px; }
      .glyph-window { width:50px; height:48px; overflow:hidden; }
      .glyph-window > span { display:block; box-sizing:content-box; width:220px; padding-left:100px; }
      .poison { font:913 42px/48px Georgia, serif; color:rgb(238, 17, 17); }
      .circle { clip-path:circle(1px); }
      .ellipse { clip-path:ellipse(1px 1px); }
      .polygon { clip-path:polygon(0 0, 1px 0, 1px 1px, 0 1px); }
      .rounded-inset { clip-path:inset(0 round 50%); }
      .ancestor-clip { position:relative; width:200px; height:100px; }
      .ancestor-clip > span { position:absolute; left:54px; top:8px; }
      .ancestor-circle { clip-path:circle(44px at 100px 50px); }
      .ancestor-ellipse { clip-path:ellipse(48px 38px at 100px 50px); }
      .ancestor-polygon { clip-path:polygon(50px 0, 150px 0, 100px 100px); }
    </style>
    <main>
      <svg width="0" height="0" aria-hidden="true"><filter id="zero-alpha"><feComponentTransfer><feFuncA type="table" tableValues="0 0"/></feComponentTransfer></filter></svg>
      <p class="visible">Visible foundation text one</p>
      <p class="visible">Visible foundation text two</p>
      <div class="hidden-owner"><span class="poison">Hidden by opacity</span></div>
      <div class="filtered-owner"><span class="poison">Hidden by filter one</span><span class="poison">Hidden by filter two</span></div>
      <p class="poison filtered-percent-owner">Hidden by percent filter</p>
      <p class="poison svg-filter-owner">Hidden by SVG alpha filter one</p>
      <p class="poison svg-filter-owner">Hidden by SVG alpha filter two</p>
      <p class="poison color-filter-owner">Color transformed by a non-preserving filter</p>
      <div class="masked-owner"><span class="poison">Hidden by mask one</span><span class="poison">Hidden by mask two</span></div>
      <div class="blended-owner"><span class="poison">Backdrop-dependent glyph one</span><span class="poison">Backdrop-dependent glyph two</span></div>
      <div class="clipped-owner" style="width:1px;height:1px"><span class="poison">Hidden by overflow</span></div>
      <div class="glyph-window"><span class="poison">Glyphs outside clip one</span></div>
      <div class="glyph-window"><span class="poison">Glyphs outside clip two</span></div>
      <span class="poison circle">Tiny circular text</span>
      <span class="poison ellipse">Tiny elliptical text</span>
      <span class="poison polygon">Tiny polygon text</span>
      <span class="poison rounded-inset">Unreconstructable rounded inset text</span>
      <div class="ancestor-clip ancestor-circle"><span class="poison">Outside circular paint one</span><span class="poison" style="top:48px">Outside circular paint two</span></div>
      <div class="ancestor-clip ancestor-ellipse"><span class="poison">Outside elliptical paint one</span><span class="poison" style="top:48px">Outside elliptical paint two</span></div>
      <div class="ancestor-clip ancestor-polygon"><span class="poison">Outside polygon paint one</span><span class="poison" style="top:48px">Outside polygon paint two</span></div>
    </main>`)

  const styles = await extractStyles(page)

  assert.equal(
    styles.fontFamilies.some((family) => family.includes('Georgia')),
    false,
  )
  assert.equal(styles.fontSizes.includes('42px'), false)
  assert.equal(styles.fontWeights.includes('913'), false)
  assert.equal(styles.textColors.includes('rgb(238, 17, 17)'), false)
  assert.equal(
    Object.keys(styles.usageCount).some((key) => key.includes('Georgia') || key.endsWith(':42px')),
    false,
  )
  assert.ok(styles.renderedTextStyleObservations.length >= 2)
  assert.ok(styles.renderedTextStyleObservations.every((observation) => observation.source.paintedAreaPx > 16))
  assert.ok(styles.renderedTextStyleObservations.every((observation) => observation.source.visibleGlyphAreaPx > 4))
  assert.ok(styles.renderedTextStyleObservations.every((observation) => observation.source.filterOpacity > 0.02))
  assert.ok(styles.renderedTextStyleObservations.every((observation) => Array.isArray(observation.source.filterChain)))
  assert.ok(
    styles.renderedTextStyleObservations.every(
      (observation) => Array.isArray(observation.source.maskChain) && observation.source.maskChain.length === 0,
    ),
  )
  assert.ok(
    styles.renderedTextStyleObservations.every(
      (observation) => Array.isArray(observation.source.blendChain) && observation.source.blendChain.length === 0,
    ),
  )
  assert.ok(
    styles.renderedTextStyleObservations.every((observation) => observation.source.visibleGlyphRects.length > 0),
  )
})

test('uses effective glyph paint for solid, transparent, and background-clipped text', async () => {
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; color:rgb(20, 30, 40); }
      .transparent { color:rgb(238, 17, 17); -webkit-text-fill-color:transparent; font:700 42px/48px Georgia, serif; }
      .solid { color:rgb(238, 17, 17); -webkit-text-fill-color:color(srgb 0 0.3 1); font:600 24px/32px "Courier New", monospace; }
      .gradient { color:rgb(238, 17, 17); -webkit-text-fill-color:transparent; -webkit-background-clip:text; background-clip:text; background-image:linear-gradient(90deg, rgb(0, 80, 220), rgb(120, 0, 180)); font:500 30px/38px "Times New Roman", serif; }
    </style>
    <main>
      <p class="transparent">Unpainted poison one</p><p class="transparent">Unpainted poison two</p>
      <p class="solid">Solid fill owner</p>
      <p class="gradient">Gradient typography owner</p>
    </main>`)

  const styles = await extractStyles(page)
  assert.equal(
    styles.fontFamilies.some((family) => family.includes('Georgia')),
    false,
  )
  assert.ok(styles.fontFamilies.some((family) => family.includes('Courier New')))
  assert.ok(styles.fontFamilies.some((family) => family.includes('Times New Roman')))
  assert.equal(styles.textColors.includes('rgb(238, 17, 17)'), false)
  assert.ok(styles.textColors.some((color) => color === 'rgb(0, 77, 255)'))
  const gradientOwner = styles.renderedTextStyleObservations.find((observation) =>
    observation.styles.fontFamily.includes('Times New Roman'),
  )
  assert.ok(gradientOwner)
  assert.equal(gradientOwner.source.glyphPaintKind, 'background-clip')
  assert.equal(gradientOwner.styles.color, undefined)
  const solidOwner = styles.renderedTextStyleObservations.find((observation) =>
    observation.styles.fontFamily.includes('Courier New'),
  )
  assert.ok(solidOwner)
  assert.equal(solidOwner.source.glyphPaintKind, 'solid-color')
  assert.equal(solidOwner.source.foreground, 'rgb(0, 77, 255)')
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

test('samples only the outermost standards-backed status root', async () => {
  await page.setContent(`<!doctype html>
    <style>
      .status { display:block; width:180px; height:40px; background:rgb(181, 71, 8); color:white; }
      .status-label { display:block; width:120px; height:24px; }
    </style>
    <main>
      <div role="status" class="status warning">
        <span role="status" class="status-label warning">Warning</span>
      </div>
    </main>`)

  const styles = await extractStyles(page)
  const statuses = styles.colorRoleObservations.filter((observation) => observation.role === 'status')

  assert.equal(statuses.length, 1)
  assert.equal(statuses[0].statusIntent, 'neutral')
  assert.match(statuses[0].elementRef, /div/)
})

test('samples a bounded nested status instead of its broad live-region wrapper', async () => {
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; }
      .live-wrapper { box-sizing:border-box; width:1000px; height:300px; padding:40px; }
      .status { box-sizing:border-box; width:220px; height:48px; padding:12px; background:rgb(6, 118, 71); color:white; }
    </style>
    <main><section class="live-wrapper" aria-live="polite"><div class="status" role="status">Saved</div></section></main>`)

  const styles = await extractStyles(page)
  const statuses = styles.colorRoleObservations.filter((observation) => observation.role === 'status')

  assert.equal(statuses.length, 1)
  assert.equal(statuses[0].background, 'rgb(6, 118, 71)')
  assert.match(statuses[0].elementRef, /div/)
})

test('keeps a visually bounded standards-backed status instead of splitting its icon and label', async () => {
  await page.setContent(`<!doctype html>
    <style>
      .status { display:flex; width:180px; min-height:40px; padding:8px 12px; background:rgb(181, 71, 8); color:white; }
      .status-icon, .status-label { display:inline-block; }
    </style>
    <main>
      <div role="status" class="status warning">
        <span class="status-icon warning">!</span>
        <span class="status-label warning">Warning</span>
      </div>
    </main>`)

  const styles = await extractStyles(page)
  const statuses = styles.colorRoleObservations.filter((observation) => observation.role === 'status')

  assert.equal(statuses.length, 1)
  assert.equal(statuses[0].background, 'rgb(181, 71, 8)')
  assert.equal(statuses[0].statusIntent, 'neutral')
  assert.match(statuses[0].elementRef, /div/)
})

test('preserves independently painted standards-backed statuses in a transparent list', async () => {
  await page.setContent(`<!doctype html>
    <style>
      .status-list { display:grid; gap:8px; width:220px; padding:8px; }
      .status { display:block; width:180px; height:40px; color:white; }
      .success { background:rgb(6, 118, 71); }
      .warning { background:rgb(181, 71, 8); }
    </style>
    <main>
      <div class="status-list">
        <div role="status" class="status success">Healthy</div>
        <div role="status" class="status warning">Warning</div>
      </div>
    </main>`)

  const styles = await extractStyles(page)
  const statuses = styles.colorRoleObservations.filter((observation) => observation.role === 'status')

  assert.equal(statuses.length, 2)
  assert.deepEqual(
    statuses.map((observation) => observation.statusIntent),
    ['neutral', 'neutral'],
  )
  assert.deepEqual(statuses.map((observation) => observation.background).sort(), ['rgb(181, 71, 8)', 'rgb(6, 118, 71)'])
})

test('preserves sibling ARIA statuses without inferring intent from class names', async () => {
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
  assert.deepEqual(
    statuses.map((observation) => observation.statusIntent),
    Array(4).fill('neutral'),
  )
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
      <form><input type="password" autocomplete="current-password"><button type="submit">Continue</button></form>
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

test('detects access walls from credential semantics rather than route, class, or test-id words', async () => {
  await page.route('https://example.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<main><h1>Public reference</h1><p>Visible content.</p></main>' }),
  )
  await page.goto('https://example.test/signin')
  assert.equal((await detectAuthWall(page)).detected, false, 'an English-looking route alone is not evidence')
  await page.unroute('https://example.test/**')

  await page.setContent(`<!doctype html><main><form id="login-form" data-testid="signin">
    <label>Email <input type="email" autocomplete="email"></label><button type="submit">Continue</button>
  </form><p>Public page content remains available.</p></main>`)
  assert.equal((await detectAuthWall(page)).detected, false, 'email-only forms and machine names are not credentials')

  await page.setContent(`<!doctype html><main><form>
    <label>Secret <input type="password"></label><button type="submit">Continue</button>
  </form></main>`)
  const passwordOnlyWall = await detectAuthWall(page)
  assert.equal(passwordOnlyWall.detected, true, 'a compact native password form is direct credential evidence')
  assert.ok(passwordOnlyWall.reasons.includes('password-form'))

  await page.setContent(`<!doctype html><main><form>
    <h1>Account access</h1><p>${'Detailed account access guidance remains part of this credential surface. '.repeat(100)}</p>
    <label>Secret <input type="password"></label><button type="submit">Continue</button>
  </form></main>`)
  const verbosePasswordWall = await detectAuthWall(page)
  assert.equal(verbosePasswordWall.detected, true, 'native password evidence is independent of page copy length')
  assert.ok(verbosePasswordWall.reasons.includes('password-form'))

  await page.setContent(`<!doctype html><main>
    <h1>Account access</h1><p>Use your account to continue.</p>
    <form><label>Secret <input type="password"></label><button type="submit">Continue</button></form>
  </main>`)
  assert.equal(
    (await detectAuthWall(page)).detected,
    true,
    'concise credential framing around a password form remains an access wall',
  )

  await page.setContent(`<!doctype html><main>
    <article>
      <h1>Public implementation reference</h1>
      <p>${'This article documents an observable interface pattern for readers. '.repeat(5)}</p>
      <p>${'Its examples, constraints, and usage guidance remain available without authentication. '.repeat(4)}</p>
    </article>
    <aside><form>
      <label>Email <input type="email" autocomplete="email"></label>
      <label>Secret <input type="password" autocomplete="current-password"></label>
      <button type="submit">Continue</button>
    </form></aside>
  </main>`)
  const publicPageWithSignIn = await detectAuthWall(page)
  assert.equal(publicPageWithSignIn.detected, false, 'a separate sign-in form does not hide public article content')
  const publicPageHealth = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(
    publicPageHealth.issues.some((issue) => issue.code === 'auth-wall'),
    false,
    'page health retains public content alongside an optional credential form',
  )

  await page.setContent(`<!doctype html><article><h1>Public release notes</h1></article><form>
    <label>Secret <input type="password" autocomplete="current-password"></label>
    <button type="submit">Continue</button>
  </form>`)
  assert.equal(
    (await detectAuthWall(page)).detected,
    false,
    'a concise independent semantic article remains public beside an optional credential form',
  )

  await page.setContent(`<!doctype html><canvas role="img" aria-label="Public chart" width="96" height="64"></canvas>
    <form><label>Secret <input type="password" autocomplete="current-password"></label>
      <button type="submit">Continue</button></form>`)
  assert.equal(
    (await detectAuthWall(page)).detected,
    false,
    'a small named canvas is public counter-evidence regardless of viewport area',
  )

  await page.setContent(`<!doctype html><svg role="img" aria-label="Public diagram" viewBox="0 0 96 64"
      style="width:96px;height:64px"><rect width="96" height="64"></rect></svg>
    <form><label>Secret <input type="password" autocomplete="current-password"></label>
      <button type="submit">Continue</button></form>`)
  assert.equal(
    (await detectAuthWall(page)).detected,
    false,
    'a small named SVG is public counter-evidence regardless of viewport area',
  )

  await page.setContent(`<!doctype html><figure>
    <svg role="img" aria-label="Public map" viewBox="0 0 640 320" style="width:640px;height:320px">
      <rect width="640" height="320" fill="#dbeafe"></rect>
    </svg><figcaption>Map</figcaption>
    </figure><aside><form>
      <label>Secret <input type="password" autocomplete="current-password"></label>
      <button type="submit">Continue</button>
    </form></aside>`)
  assert.equal(
    (await detectAuthWall(page)).detected,
    false,
    'an independent standards-backed visual figure remains public content beside an optional credential form',
  )

  await page.setContent(`<!doctype html><main>
    <article>
      <h1>Public standards reference</h1>
      <p>${'Readers can use this independent article without signing in. '.repeat(8)}</p>
    </article>
    <div>
      <label>Contact <input type="tel" autocomplete="tel"></label>
      <label>Code <input inputmode="numeric" autocomplete="one-time-code"></label>
      <button type="button">Continue</button>
    </div>
  </main>`)
  assert.equal(
    (await detectAuthWall(page)).detected,
    false,
    'an inline one-time-code widget does not consume a sibling public article inside the same main landmark',
  )

  await page.setContent(`<!doctype html><main>
    <h1>Public API note</h1>
    <p>This concise reference explains the stable request shape and the response fields available to every reader.</p>
    <div>
      <label>Secret <input type="password" autocomplete="current-password"></label>
      <button type="button">Continue</button>
    </div>
  </main>`)
  assert.equal(
    (await detectAuthWall(page)).detected,
    false,
    'concise structured public content remains analyzable beside an unwrapped credential widget',
  )

  await page.setContent(`<!doctype html><main><article><h1>Public reference</h1><p>Readable without an account.</p></article>
    <dialog style="width:320px">
      <label>Account <input autocomplete="username"></label>
      <label>Secret <input type="password" autocomplete="current-password"></label>
      <button type="button">Continue</button>
    </dialog>
  </main>`)
  await page.locator('dialog').evaluate((dialog) => dialog.showModal())
  const compactModalWall = await detectAuthWall(page)
  assert.equal(compactModalWall.detected, true, 'a standards-modal credential dialog blocks access regardless of area')
  assert.ok(compactModalWall.reasons.includes('blocking-login-dialog'))
  const compactModalHealth = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(
    compactModalHealth.issues.some((issue) => issue.code === 'auth-wall'),
    true,
    'page health consumes the standards-modal auth decision',
  )

  await page.setContent(`<!doctype html><main><article><h1>Public reference</h1><p>Readable without an account.</p></article>
    <dialog open style="width:320px">
      <label>Account <input autocomplete="username"></label>
      <label>Secret <input type="password" autocomplete="current-password"></label>
      <button type="button">Continue</button>
    </dialog>
  </main>`)
  assert.equal(
    (await detectAuthWall(page)).detected,
    false,
    'a compact non-modal dialog does not block otherwise available public content',
  )

  await page.setContent(`<!doctype html><main>
    <article><h1>Public implementation reference</h1>
      <p>${'This standards article remains readable without an account. '.repeat(8)}</p>
    </article>
    <dialog open style="width:70vw;height:50vh;position:fixed">
      <label>Account <input autocomplete="username"></label>
      <label>Secret <input type="password" autocomplete="current-password"></label>
      <button type="button">Continue</button>
    </dialog>
  </main>`)
  const largeNonModalWall = await detectAuthWall(page)
  assert.equal(
    largeNonModalWall.detected,
    false,
    'a large positioned non-modal credential dialog does not override independently available public content',
  )

  await page.setContent(`<!doctype html><main><article><h1>Public reference</h1></article>
    <div role="dialog" aria-modal="true" style="width:320px">
      <label>Account <input autocomplete="username"></label>
      <label>Secret <input type="password" autocomplete="current-password"></label>
      <button type="button">Continue</button>
    </div>
  </main>`)
  const ariaModalWall = await detectAuthWall(page)
  assert.equal(ariaModalWall.detected, true, 'an ARIA modal credential dialog blocks access regardless of area')
  assert.ok(ariaModalWall.reasons.includes('blocking-login-dialog'))

  await page.setContent(`<!doctype html><main inert><article><h1>Unavailable public reference</h1>
    <p>This otherwise meaningful content is explicitly non-interactive while the credential dialog is active.</p>
    </article></main><div role="dialog">
      <label>Secret <input type="password" autocomplete="current-password"></label>
      <button type="button">Continue</button>
    </div>`)
  const inertOutsideWall = await detectAuthWall(page)
  assert.equal(
    inertOutsideWall.detected,
    true,
    'a credential dialog blocks when all meaningful outside content is inert',
  )
  assert.ok(inertOutsideWall.reasons.includes('blocking-login-dialog'))

  await page.setContent(`<!doctype html><form aria-label="Account access">
    <input type="password" autocomplete="current-password" aria-label="Secret">
    <button type="submit" aria-label="Continue"></button>
  </form>`)
  const textlessPasswordWall = await detectAuthWall(page)
  assert.equal(textlessPasswordWall.detected, true, 'a native password form does not require visible copy')
  assert.ok(textlessPasswordWall.reasons.includes('password-form'))

  await page.setContent(`<!doctype html><form>
    <input type="password" autocomplete="current-password" aria-label="Secret">
    <input type="image" aria-label="Continue" alt="" style="width:32px;height:32px"
      src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='blue'/%3E%3C/svg%3E">
  </form>`)
  const imageSubmitterWall = await detectAuthWall(page)
  assert.equal(imageSubmitterWall.detected, true, 'a native image submitter completes a credential form action')
  assert.ok(imageSubmitterWall.reasons.includes('password-form'))

  await page.setContent(`<!doctype html><main>
    <label>Contact <input type="tel" autocomplete="tel"></label>
    <label>Code <input inputmode="numeric" autocomplete="one-time-code"></label>
    <button type="button">Continue</button>
  </main>`)
  const oneTimeCodeWall = await detectAuthWall(page)
  assert.equal(oneTimeCodeWall.detected, true, 'standard one-time-code flows need not use a native form element')
  assert.ok(oneTimeCodeWall.reasons.includes('login-only-page'))

  await page.setContent(`<!doctype html><main><section>
    <label>Account identifier <input autocomplete="username"></label>
    <button type="button">Save</button>
  </section></main>`)
  const compactProfileForm = await detectAuthWall(page)
  assert.equal(compactProfileForm.detected, false, 'a compact profile form is not an access wall')
  const compactProfileHealth = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(
    compactProfileHealth.issues.some((issue) => issue.code === 'auth-wall'),
    false,
    'page health uses the same composed authentication evidence',
  )

  await page.setContent(`<!doctype html><main><form>
    <label>Account identifier <input autocomplete="username"></label>
    <label>Current secret <input type="password" autocomplete="current-password"></label>
    <label>Replacement secret <input type="password" autocomplete="new-password"></label>
    <button type="submit">Save</button>
  </form></main>`)
  assert.equal((await detectAuthWall(page)).detected, false, 'a password-change composition is not a login-only page')

  await page.setContent(`<!doctype html><main><form class="x7q">
    <label>Identifier <input autocomplete="username"></label>
    <label>Secret <input type="password" autocomplete="current-password"></label>
    <button type="submit">Continue</button>
  </form></main>`)
  const credentialWall = await detectAuthWall(page)
  assert.equal(credentialWall.detected, true)
  assert.ok(credentialWall.reasons.includes('password-form'))
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
