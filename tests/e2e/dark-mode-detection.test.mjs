import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright-core'

import { findHeadlessBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { extractDarkMode } from '../../dist/core/analyzer/dark-mode-detect.js'
import {
  detectBreakpoints,
  detectBreakpointsWithCoverage,
  selectRepresentativeBreakpointWidths,
} from '../../dist/core/analyzer/responsive-motion.js'
import { extractInteractionStyles, extractStyles } from '../../dist/core/analyzer/style-extractor.js'

let browser
let context
let page

before(async () => {
  const executablePath = findHeadlessBrowser()
  if (!executablePath) throw new Error('Chrome/Edge is required for dark-mode E2E coverage')
  if (process.platform === 'darwin' && executablePath.includes('.app/Contents/MacOS/')) {
    throw new Error('Run pnpm browser:install before this test so macOS does not launch the system Chrome app')
  }
  browser = await chromium.launch({ executablePath, headless: true })
  context = await browser.newContext({ viewport: { width: 1000, height: 700 }, colorScheme: 'light' })
  page = await context.newPage()
})

after(async () => {
  await browser?.close()
})

test('detects a nested media-query theme without relying on stylesheet preflight', async () => {
  await page.setContent(`<!doctype html>
    <style>
      @layer theme {
        html, body, main { margin: 0; min-height: 100vh; background: #ffffff; color: #191b1f; }
        @media (prefers-color-scheme: dark) {
          html, body, main { background: #16171d; color: #f5f5f5; }
        }
      }
    </style>
    <main><h1>Nested media theme</h1><p>Browser-observed dark surface.</p></main>`)

  const lightStyles = await extractStyles(page)
  const result = await extractDarkMode(page, lightStyles)

  assert.equal(result.hasDarkMode, true)
  assert.equal(result.method, 'media-query')
  assert.ok(result.darkStyles?.usageCount['bgArea:rgb(22, 23, 29)'] > 0)
})

test('preserves an attribute selector applied to body', async () => {
  await page.setContent(`<!doctype html>
    <style>
      @layer theme {
        html, body, main { margin: 0; min-height: 100vh; background: #ffffff; color: #191b1f; }
        body[data-theme="dark"], body[data-theme="dark"] main {
          background: #101820;
          color: #f4f7fa;
        }
      }
    </style>
    <main><h1>Attribute theme</h1><p>The selector belongs on body.</p></main>`)

  const lightStyles = await extractStyles(page)
  const result = await extractDarkMode(page, lightStyles)

  assert.equal(result.hasDarkMode, true)
  assert.equal(result.method, 'class-toggle')
  assert.equal(result.selector, '[data-theme="dark"]')
  assert.equal(await page.locator('body').getAttribute('data-theme'), null)
})

test('detects nested pixel, em, and range-syntax breakpoints', async () => {
  await page.setContent(`<!doctype html>
    <style>
      @layer responsive {
        @media (min-width: 40em) { main { display: grid; } }
        @supports (display: grid) {
          @media (width >= 80rem) { main { grid-template-columns: repeat(3, 1fr); } }
        }
      }
    </style>
    <main>Responsive fixture</main>`)

  assert.deepEqual(await detectBreakpoints(page), [
    { width: 640, label: 'tablet-sm', layoutChanges: [] },
    { width: 1280, label: 'desktop', layoutChanges: [] },
  ])
})

test('does not report ordinary element minimum widths as responsive breakpoints', async () => {
  await page.setContent(`<!doctype html>
    <style>
      main { min-width: 542px; }
      .grid-shell { min-width: 1012px; display: grid; }
    </style>
    <main><section class="grid-shell">Fixed component constraints</section></main>`)

  assert.deepEqual(await detectBreakpoints(page), [])
})

test('reports readable stylesheet coverage for breakpoint discovery', async () => {
  await page.setContent(`<!doctype html>
    <style>@media (min-width: 48rem) { main { display: grid; } }</style>
    <main>CSSOM coverage fixture</main>`)

  const detection = await detectBreakpointsWithCoverage(page)

  assert.deepEqual(detection.breakpoints, [{ width: 768, label: 'tablet-sm', layoutChanges: [] }])
  assert.equal(detection.readableStylesheetCount, 1)
  assert.equal(detection.unreadableStylesheetCount, 0)
})

test('keeps only interaction declarations applicable to the current DOM and media state', async () => {
  await page.setContent(`<!doctype html>
    <style>
      .present:hover, .missing:hover { color: rgb(0, 128, 0); }
      .missing-only:hover { background-color: rgb(255, 0, 0); }
      @media (min-width: 1200px) { .present:hover { background-color: rgb(255, 255, 0); } }
    </style>
    <button class="present">Applicable control</button>`)

  const interactions = await extractInteractionStyles(page)
  const declarations = interactions.hover.filter((observation) => observation.source === 'declared-applicable')

  assert.ok(declarations.some((observation) => observation.selector === '.present:hover'))
  assert.ok(declarations.every((observation) => !observation.selector?.includes('.missing')))
  assert.ok(declarations.every((observation) => observation.after['background-color'] !== 'rgb(255, 255, 0)'))
  assert.ok(interactions.hover.some((observation) => observation.source === 'computed-probed'))
})

test('does not claim container-query declarations are applicable without element-level condition evidence', async () => {
  await page.setContent(`<!doctype html>
    <style>
      .shell { container-type: inline-size; width: 200px; }
      @container (min-width: 400px) {
        :root { --brand-primary: rgb(255, 0, 0); }
        .present:hover { color: rgb(255, 0, 0); }
      }
      @container (max-width: 300px) { .present:hover { background-color: rgb(0, 128, 0); } }
    </style>
    <div class="shell"><button class="present">Container control</button></div>`)

  const interactions = await extractInteractionStyles(page)
  const styles = await extractStyles(page)
  const declarations = interactions.hover.filter((observation) => observation.source === 'declared-applicable')

  assert.equal(declarations.length, 0)
  assert.ok(interactions.hover.some((observation) => observation.source === 'computed-probed'))
  assert.equal(styles.cssVariables['--brand-primary'], undefined)
  assert.equal(styles.usageCount['declaredColor:rgb(255, 0, 0)'], undefined)
})

test('clusters adjacent media-query boundaries and caps each viewport category', () => {
  const selected = selectRepresentativeBreakpointWidths([
    { width: 542, count: 1 },
    { width: 543, count: 1 },
    { width: 544, count: 3 },
    { width: 600, count: 2 },
    { width: 640, count: 8 },
    { width: 767, count: 1 },
    { width: 768, count: 4 },
    { width: 769, count: 1 },
    { width: 840, count: 3 },
    { width: 980, count: 2 },
    { width: 1023, count: 1 },
    { width: 1024, count: 5 },
    { width: 1025, count: 1 },
    { width: 1080, count: 3 },
    { width: 1280, count: 7 },
    { width: 1350, count: 2 },
    { width: 1440, count: 6 },
  ])

  assert.deepEqual(selected, [640, 768, 840, 1024, 1080, 1280, 1350, 1440])
})
