import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright-core'

import { findHeadlessBrowser } from '../../dist/core/analyzer/browser-finder.js'
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
