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
    <script>
      addEventListener('scroll', () => {
        if (scrollY > 300) document.querySelector('#lazy-card').style.display = 'block'
      })
    </script>`)

  const preparation = await preparePageForExtraction(page)
  assert.equal(preparation.issues.length, 0)
  assert.equal(preparation.hiddenObstructions, 1)
  assert.equal(await page.locator('#cookie-banner').evaluate((element) => getComputedStyle(element).display), 'none')
  assert.equal(await page.locator('#lazy-card').evaluate((element) => getComputedStyle(element).display), 'block')

  assert.equal(await freezePageAnimations(page), null)
  const styles = await extractStyles(page)

  assert.equal(styles.cssVariables['--brand-primary'], 'oklch(62% 0.2 250)')
  assert.ok(Object.keys(styles.usageCount).some((key) => key.startsWith('brandTokenColor:rgb(')))
  assert.equal(Object.keys(styles.usageCount).filter((key) => key.startsWith('brandTokenColor:')).length, 1)
  assert.ok(Object.keys(styles.usageCount).some((key) => key.startsWith('primaryActionColor:rgb(')))
  assert.ok(styles.usageCount['statusColor:rgb(220, 38, 38)'] > 0)
  assert.equal(styles.usageCount['actionColor:rgb(220, 38, 38)'], undefined)
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

  const clustered = clusterColors(styles.colors, styles.usageCount, styles.usageCount)
  const brandColor = Object.keys(styles.usageCount)
    .find((key) => key.startsWith('brandTokenColor:'))
    ?.slice('brandTokenColor:'.length)
  assert.ok(brandColor)
  assert.equal(clustered.accents[0], normalizeColorValue(brandColor))

  const interactions = await extractInteractionStyles(page)
  assert.ok(interactions.hover.some((state) => state['background-color']?.startsWith('rgb(')))
  assert.ok(interactions.focus.some((state) => state['outline-color']?.startsWith('rgb(')))
  assert.ok((interactions.disabled?.length || 0) > 0)
  assert.equal(await page.evaluate(() => window.scrollY), 0)
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
