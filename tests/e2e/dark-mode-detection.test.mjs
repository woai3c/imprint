import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright-core'

import { findHeadlessBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { extractDarkMode } from '../../dist/core/analyzer/dark-mode-detect.js'
import { detectBreakpoints } from '../../dist/core/analyzer/responsive-motion.js'
import { extractStyles } from '../../dist/core/analyzer/style-extractor.js'

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
