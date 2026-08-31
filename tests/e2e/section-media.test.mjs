import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright-core'

import { findHeadlessBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { inspectPageHealth } from '../../dist/core/analyzer/page-health.js'
import { extractPageEvidence } from '../../dist/core/design-evidence/page-extractor.js'

let browser
let page

before(async () => {
  const executablePath = findHeadlessBrowser()
  if (!executablePath) throw new Error('Chrome/Edge is required for section and media E2E coverage')
  if (process.platform === 'darwin' && executablePath.includes('.app/Contents/MacOS/')) {
    throw new Error('Run pnpm browser:install before this test so macOS does not launch the system Chrome app')
  }
  browser = await chromium.launch({ executablePath, headless: true })
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
})

after(async () => {
  await browser?.close()
})

test('recovers real content sections from layered app shells', async () => {
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; }
      .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 12px; background: #fff; }
    </style>
    <body>
      <div id="root">
        <div class="app-shell">
          <div class="app-frame">
            <header style="height:56px">App header</header>
            <div class="layout" style="display:flex">
              <main style="flex:1">
                <div class="content-wrapper">
                  <div class="feed">
                    <article class="card">First story with enough text to read and a title</article>
                    <article class="card">Second story with enough text to read and a title</article>
                    <article class="card">Third story with enough text to read and a title</article>
                    <article class="card">Fourth story with enough text to read and a title</article>
                  </div>
                </div>
              </main>
              <aside style="width:280px">
                <div class="card">Promotion</div>
                <div class="card">Trending topics</div>
              </aside>
            </div>
            <footer style="height:120px">Footer links</footer>
          </div>
        </div>
      </div>
    </body>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const roles = evidence.sections.map((section) => section.role)

  assert.ok(roles.includes('header'), `expected a header section, got: ${roles.join(', ')}`)
  assert.ok(roles.includes('footer'), `expected a footer section, got: ${roles.join(', ')}`)
  assert.ok(roles.includes('aside'), `expected an aside section, got: ${roles.join(', ')}`)
  assert.ok(
    roles.includes('feature-group') || roles.includes('content'),
    `expected the main feed to become a section, got: ${roles.join(', ')}`,
  )

  const keys = evidence.sections.map((section) => section.key)
  assert.ok(
    !keys.some((key) => key.includes('app-shell') || key.includes('app-frame')),
    'anonymous wrapper chains must not become sections',
  )

  // The same visual region must not produce nested duplicate sections.
  for (const section of evidence.sections) {
    let nested = 0
    for (const other of evidence.sections) {
      if (other === section) continue
      const inside =
        other.rect.x >= section.rect.x - 0.001 &&
        other.rect.y >= section.rect.y - 0.001 &&
        other.rect.x + other.rect.width <= section.rect.x + section.rect.width + 0.001 &&
        other.rect.y + other.rect.height <= section.rect.y + section.rect.height + 0.001
      if (inside && other.rect.width * other.rect.height >= section.rect.width * section.rect.height * 0.85) {
        nested += 1
      }
    }
    assert.equal(nested, 0, `section ${section.key} has a near-identical nested duplicate`)
  }
})

test('keeps nested landmark headers and navigation scoped to their owner', async () => {
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; }
      body > header { height: 64px; background: #fff; }
      main { min-height: 900px; display: grid; grid-template-columns: 1fr 280px; }
      article { padding: 32px; }
      aside { padding: 24px; background: #f5f5f5; }
      aside header { height: 48px; }
      nav { min-height: 48px; }
    </style>
    <body>
      <header>Global header</header>
      <nav><div role="navigation"><a href="#one">One</a><a href="#two">Two</a></div></nav>
      <main>
        <article><h1>Article heading</h1><p>Article content with enough text to form the main region.</p></article>
        <aside><header>Sidebar heading</header><p>Related content</p></aside>
      </main>
    </body>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const roles = evidence.sections.map((section) => section.role)

  assert.equal(roles.filter((role) => role === 'header').length, 1)
  assert.equal(roles.filter((role) => role === 'navigation').length, 1)
  assert.ok(roles.includes('aside'))
})

test('a feed that fills the whole main landmark keeps its feature-group role', async () => {
  await page.setContent(`<!doctype html>
    <body>
      <main>
        <div class="wrapper-one">
          <div class="wrapper-two">
            <div class="feed">
              <article>Story one with readable content</article>
              <article>Story two with readable content</article>
              <article>Story three with readable content</article>
              <article>Story four with readable content</article>
            </div>
          </div>
        </div>
      </main>
    </body>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  assert.equal(evidence.sections.length, 1, 'wrapper chains must collapse into a single section')
  assert.equal(evidence.sections[0].role, 'feature-group')
})

test('keeps evidence keys unique for repeated subtrees deeper than eight levels', async () => {
  const repeatedBranch = (label) => `
    <section>
      <div><div><div><div><div><div><div><div><div>
        <button type="button">${label}</button>
      </div></div></div></div></div></div></div></div></div>
    </section>`

  await page.setContent(`<!doctype html>
    <style>
      button { display: block; width: 120px; height: 40px; }
    </style>
    <body><main>${repeatedBranch('First')}${repeatedBranch('Second')}</main></body>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const buttons = evidence.components.filter((component) => component.type === 'button')
  const actions = evidence.layoutNodes.filter((node) => node.role === 'action')

  assert.equal(buttons.length, 2)
  assert.equal(new Set(buttons.map((button) => button.key)).size, 2)
  assert.equal(actions.length, 2)
  assert.equal(new Set(actions.map((action) => action.key)).size, 2)
})

test('distinguishes contained horizontal scrollers from page-level overflow', async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; }
      .scroller { width: 100%; overflow-x: auto; }
      .track { width: 1200px; display: flex; }
      .card { flex: 0 0 300px; height: 120px; }
    </style>
    <body>
      <main>
        <h1>Scrollable recommendations</h1>
        <div class="scroller"><div class="track">
          <article class="card">First recommendation</article>
          <article class="card">Second recommendation</article>
          <article class="card">Third recommendation</article>
          <article class="card">Fourth recommendation</article>
        </div></div>
      </main>
    </body>`)

  const contained = await extractPageEvidence(page, 'mobile')
  const containedHealth = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(contained.horizontalOverflow, false)
  assert.equal(contained.contentWidth, 375)
  assert.equal(contained.width, 375)
  assert.deepEqual(contained.horizontalOverflowSources, [])
  assert.equal(
    containedHealth.issues.some((issue) => issue.code === 'horizontal-overflow'),
    false,
  )

  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; }
      .offscreen-fixed { position: fixed; left: 2500px; top: 20px; width: 180px; height: 100px; }
    </style>
    <body>
      <main><h1>Normal page content</h1><p>The fixed helper is outside the viewport but not document flow.</p></main>
      <aside class="offscreen-fixed"><div>Fixed helper panel</div></aside>
    </body>`)

  const fixedOutsideViewport = await extractPageEvidence(page, 'mobile')
  const fixedHealth = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(fixedOutsideViewport.horizontalOverflow, false)
  assert.equal(fixedOutsideViewport.contentWidth, 375)
  assert.equal(fixedOutsideViewport.width, 375)
  assert.equal(
    fixedHealth.issues.some((issue) => issue.code === 'horizontal-overflow'),
    false,
  )

  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; }
      main { min-width: 820px; }
    </style>
    <body><main><h1>Wide page shell</h1><p>This content genuinely exceeds the mobile viewport.</p></main></body>`)

  const overflowing = await extractPageEvidence(page, 'mobile')
  const overflowingHealth = await inspectPageHealth(page, { expectedUrl: page.url() })
  assert.equal(overflowing.horizontalOverflow, true)
  assert.ok(overflowing.contentWidth >= 820)
  assert.ok(overflowing.width >= 820)
  const overflowSource = overflowing.horizontalOverflowSources.find((source) => source.locator.includes('main'))
  assert.ok(overflowSource)
  assert.ok(overflowSource.sectionKey)
  assert.ok(
    overflowing.sections.some(
      (section) => section.key === overflowSource.sectionKey && section.role === overflowSource.sectionRole,
    ),
  )
  assert.equal(
    overflowingHealth.issues.some((issue) => issue.code === 'horizontal-overflow'),
    true,
  )

  await page.setViewportSize({ width: 1280, height: 800 })
})

test('ignores tiny screen-reader helpers positioned outside the viewport', async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; }
      .screen-reader-helper {
        position: absolute;
        left: -10000px;
        width: 1px;
        height: 1px;
        overflow: hidden;
      }
    </style>
    <body>
      <div class="screen-reader-helper">Route change announcement</div>
      <main><h1>Article</h1><p>Visible content fits within the viewport.</p></main>
    </body>`)

  const nativeWidth = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  )
  const evidence = await extractPageEvidence(page, 'mobile')
  const health = await inspectPageHealth(page, { expectedUrl: page.url() })

  assert.equal(nativeWidth, 375)
  assert.equal(evidence.horizontalOverflow, false)
  assert.equal(evidence.contentWidth, 375)
  assert.equal(evidence.width, 375)
  assert.deepEqual(evidence.horizontalOverflowSources, [])
  assert.equal(health.content.width, 375)
  assert.equal(
    health.issues.some((issue) => issue.code === 'horizontal-overflow'),
    false,
  )

  await page.setViewportSize({ width: 1280, height: 800 })
})

test('keeps tiny unclipped elements as real page-level overflow', async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; }
      .overflowing-link {
        position: absolute;
        left: 500px;
        width: 2px;
        height: 2px;
        overflow: visible;
        white-space: nowrap;
      }
    </style>
    <body>
      <main><h1>Article</h1><p>Visible content fits within the viewport.</p></main>
      <a class="overflowing-link" href="#details">Visible overflowing link</a>
    </body>`)

  const nativeWidth = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  )
  const evidence = await extractPageEvidence(page, 'mobile')
  const health = await inspectPageHealth(page, { expectedUrl: page.url() })

  assert.ok(nativeWidth > 500)
  assert.equal(evidence.horizontalOverflow, true)
  assert.ok(evidence.contentWidth >= 502)
  assert.ok(evidence.horizontalOverflowSources.some((source) => source.locator.includes('a:nth-of-type(1)')))
  assert.ok(health.content.width >= 502)
  assert.equal(
    health.issues.some((issue) => issue.code === 'horizontal-overflow'),
    true,
  )

  await page.setViewportSize({ width: 1280, height: 800 })
})

test('keeps tiny clipped elements on the LTR scrollable side as real overflow', async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; }
      .overflowing-helper {
        position: absolute;
        left: 500px;
        width: 2px;
        height: 2px;
        overflow: hidden;
      }
    </style>
    <body>
      <main><h1>Article</h1><p>Visible content fits within the viewport.</p></main>
      <div class="overflowing-helper">Clipped content</div>
    </body>`)

  const nativeWidth = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  )
  const evidence = await extractPageEvidence(page, 'mobile')
  const health = await inspectPageHealth(page, { expectedUrl: page.url() })

  assert.equal(nativeWidth, 502)
  assert.equal(evidence.horizontalOverflow, true)
  assert.equal(evidence.contentWidth, 502)
  assert.equal(health.content.width, 502)
  assert.equal(
    health.issues.some((issue) => issue.code === 'horizontal-overflow'),
    true,
  )

  await page.setViewportSize({ width: 1280, height: 800 })
})

test('keeps tiny clipped elements on the RTL scrollable side as real overflow', async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.setContent(`<!doctype html>
    <html dir="rtl">
      <head>
        <style>
          html, body { margin: 0; }
          .overflowing-helper {
            position: absolute;
            left: -10000px;
            width: 1px;
            height: 1px;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        <main><h1>Article</h1><p>Visible content fits within the viewport.</p></main>
        <div class="overflowing-helper">Clipped content</div>
      </body>
    </html>`)

  const nativeWidth = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  )
  const evidence = await extractPageEvidence(page, 'mobile')
  const health = await inspectPageHealth(page, { expectedUrl: page.url() })

  assert.equal(nativeWidth, 10_375)
  assert.equal(evidence.horizontalOverflow, true)
  assert.equal(evidence.contentWidth, 10_375)
  assert.equal(health.content.width, 10_375)
  assert.equal(
    health.issues.some((issue) => issue.code === 'horizontal-overflow'),
    true,
  )

  await page.setViewportSize({ width: 1280, height: 800 })
})

test('uses the body direction to identify the RTL scrollable side', async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.setContent(`<!doctype html>
    <html>
      <head>
        <style>
          html, body { margin: 0; }
          .overflowing-helper {
            position: absolute;
            left: -10000px;
            width: 1px;
            height: 1px;
            overflow: hidden;
          }
        </style>
      </head>
      <body dir="rtl">
        <main><h1>Article</h1><p>Visible content fits within the viewport.</p></main>
        <div class="overflowing-helper">Clipped content</div>
      </body>
    </html>`)

  const directions = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).direction,
    body: getComputedStyle(document.body).direction,
  }))
  const nativeWidth = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  )
  const evidence = await extractPageEvidence(page, 'mobile')
  const health = await inspectPageHealth(page, { expectedUrl: page.url() })

  assert.deepEqual(directions, { html: 'ltr', body: 'rtl' })
  assert.equal(nativeWidth, 10_375)
  assert.equal(evidence.horizontalOverflow, true)
  assert.equal(evidence.contentWidth, 10_375)
  assert.equal(health.content.width, 10_375)
  assert.equal(
    health.issues.some((issue) => issue.code === 'horizontal-overflow'),
    true,
  )

  await page.setViewportSize({ width: 1280, height: 800 })
})

test('uses vertical-rl writing mode to identify the left scrollable side', async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; }
      body { writing-mode: vertical-rl; direction: ltr; }
      .overflowing-helper {
        position: absolute;
        left: -10000px;
        width: 1px;
        height: 1px;
        overflow: hidden;
      }
    </style>
    <body>
      <main><h1>Article</h1><p>Visible content fits within the viewport.</p></main>
      <div class="overflowing-helper">Clipped content</div>
    </body>`)

  const nativeWidth = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  )
  const evidence = await extractPageEvidence(page, 'mobile')
  const health = await inspectPageHealth(page, { expectedUrl: page.url() })

  assert.equal(nativeWidth, 10_375)
  assert.equal(evidence.horizontalOverflow, true)
  assert.equal(evidence.contentWidth, 10_375)
  assert.equal(health.content.width, 10_375)
  assert.equal(
    health.issues.some((issue) => issue.code === 'horizontal-overflow'),
    true,
  )

  await page.setViewportSize({ width: 1280, height: 800 })
})

test('uses vertical-lr writing mode to identify the right scrollable side', async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; }
      body { writing-mode: vertical-lr; direction: rtl; }
      .overflowing-helper {
        position: absolute;
        left: 500px;
        width: 2px;
        height: 2px;
        overflow: hidden;
      }
    </style>
    <body>
      <main><h1>Article</h1><p>Visible content fits within the viewport.</p></main>
      <div class="overflowing-helper">Clipped content</div>
    </body>`)

  const nativeWidth = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  )
  const evidence = await extractPageEvidence(page, 'mobile')
  const health = await inspectPageHealth(page, { expectedUrl: page.url() })

  assert.equal(nativeWidth, 502)
  assert.equal(evidence.horizontalOverflow, true)
  assert.equal(evidence.contentWidth, 502)
  assert.equal(health.content.width, 502)
  assert.equal(
    health.issues.some((issue) => issue.code === 'horizontal-overflow'),
    true,
  )

  await page.setViewportSize({ width: 1280, height: 800 })
})

test('resets scroll before measuring fixed sections and page-level overflow', async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; }
      header { position: fixed; inset: 0 0 auto 0; height: 56px; background: white; z-index: 2; }
      main { width: 1000px; min-height: 1800px; padding-top: 72px; }
    </style>
    <body>
      <header>Fixed navigation</header>
      <main><h1>Wide document</h1><p>The page is both scrollable and wider than its mobile viewport.</p></main>
    </body>`)

  await page.evaluate(() => window.scrollTo(420, 640))
  const scrollBeforeExtraction = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
  assert.ok(scrollBeforeExtraction.x > 0)
  assert.ok(scrollBeforeExtraction.y > 0)

  const evidence = await extractPageEvidence(page, 'mobile')
  const scrollAfterExtraction = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
  const header = evidence.sections.find((section) => section.role === 'header')

  assert.deepEqual(scrollAfterExtraction, { x: 0, y: 0 })
  assert.ok(header)
  assert.equal(header.order, 0)
  assert.equal(header.rect.x, 0)
  assert.equal(header.rect.y, 0)
  assert.equal(evidence.horizontalOverflow, true)
  assert.ok(evidence.horizontalOverflowSources[0]?.locator.includes('main'))

  await page.evaluate(() => window.scrollTo(420, 640))
  const health = await inspectPageHealth(page, { expectedUrl: page.url() })
  const scrollAfterHealth = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
  assert.deepEqual(scrollAfterHealth, { x: 0, y: 0 })
  assert.equal(
    health.issues.some((issue) => issue.code === 'horizontal-overflow'),
    true,
  )

  await page.setViewportSize({ width: 1280, height: 800 })
})

test('separates major media from icons and dedupes repeated shapes', async () => {
  const iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>'
  await page.setContent(`<!doctype html>
    <style>
      .hero-img { width: 900px; height: 360px; background: #369; display: block; }
      .cover { width: 320px; height: 180px; display: block; }
      .avatar { width: 40px; height: 40px; border-radius: 50%; display: inline-block; }
      .bg-hero { width: 1000px; height: 420px; background-image: linear-gradient(#123, #456); }
    </style>
    <body>
      <header>
        <nav>
          ${Array.from({ length: 6 }, () => `<a href="#">${iconSvg}</a>`).join('')}
        </nav>
      </header>
      <main>
        <img class="hero-img" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='360'/%3E" alt="hero">
        <picture>
          <source srcset="cover.webp" type="image/webp">
          <img class="cover" src="cover.png" alt="cover">
        </picture>
        <div class="bg-hero"></div>
        <ul>
          ${Array.from({ length: 16 }, (_, index) => `<li><img class="avatar" src="avatar-${index}.png" alt="avatar"></li>`).join('')}
        </ul>
      </main>
    </body>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const major = evidence.mediaLayers.filter((media) => media.importance === 'major')
  const icons = evidence.mediaLayers.filter((media) => media.importance === 'icon')

  assert.ok(major.length >= 2 && major.length <= 4, `expected a handful of major media, got ${major.length}`)
  assert.ok(
    major.some((media) => media.kind === 'image' && media.rect.width > 0.5),
    'the hero image must be a major media region',
  )
  assert.ok(
    major.some((media) => media.kind === 'css-background'),
    'the CSS background hero must be a major media region',
  )

  const pictureCovers = evidence.mediaLayers.filter((media) => media.key.includes('PICTURE'))
  assert.equal(pictureCovers.length, 0, 'picture wrappers must be represented by their inner img')

  const navIcons = icons.filter((media) => media.kind === 'svg')
  assert.equal(navIcons.length, 1, `identical SVG shapes must dedupe to one instance, got ${navIcons.length}`)
  assert.ok(icons.length <= 13, `icon instances must be capped per section, got ${icons.length}`)
})
