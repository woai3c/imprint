import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright-core'

import { findHeadlessBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { analyze } from '../../dist/core/analyzer/index.js'
import { discoverPages } from '../../dist/core/analyzer/page-discovery.js'

let browser
let page
let server
let origin

before(async () => {
  server = http.createServer((request, response) => {
    response.setHeader('content-type', request.url?.endsWith('.xml') ? 'application/xml' : 'text/html')
    if (request.url === '/robots.txt') {
      response.end(`User-agent: *\nSitemap: ${origin}/sitemap.xml`)
      return
    }
    if (request.url === '/sitemap.xml') {
      response.end(`<sitemapindex><sitemap><loc>${origin}/product-sitemap.xml</loc></sitemap></sitemapindex>`)
      return
    }
    if (request.url === '/product-sitemap.xml') {
      response.end(`<urlset>
        <url><loc>${origin}/features</loc></url>
        <url><loc>${origin}/about</loc></url>
        <url><loc>${origin}/privacy</loc></url>
      </urlset>`)
      return
    }
    if (request.url === '/pricing') {
      const requestProfile = /Mobile/i.test(String(request.headers['user-agent'])) ? 'mobile' : 'desktop'
      response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        :root{--imprint-test-request-profile:${requestProfile}}
        body{margin:0;font-family:system-ui;color:#172033} header,main,footer{padding:32px}
        .plans{display:grid;grid-template-columns:repeat(3,minmax(240px,1fr));gap:20px;min-width:820px}
        article{padding:24px;border:1px solid #ccd4e0;border-radius:16px}
        @media(max-width:640px){header{padding:20px}.plans{grid-template-columns:repeat(3,260px)}}
      </style><header><nav><a href="/">Home</a></nav></header><main><h1>Pricing plans</h1><p>Choose a plan for a growing team.</p><section class="plans"><article>Starter</article><article>Team</article><article>Scale</article></section></main><footer>Pricing help</footer>`)
      return
    }
    if (request.url === '/similar-entry' || request.url === '/similar-child') {
      const childLink = request.url === '/similar-entry' ? '<a href="/similar-child">Read the second article</a>' : ''
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui;color:#172033} header,main,footer{max-width:960px;margin:auto;padding:32px}
        article{display:grid;grid-template-columns:1fr 1fr;gap:24px} section{padding:24px;background:#f3f6fa}
        @media(max-width:640px){article{grid-template-columns:1fr}header,main,footer{padding:20px}}
      </style><header><nav><a href="/similar-entry">Articles</a></nav></header><main><h1>Design systems article</h1>
      <article><section><h2>Foundations</h2><p>Build reusable foundations for a consistent product.</p></section>
      <section><h2>Components</h2><p>Compose predictable components from shared decisions.</p></section></article>${childLink}</main>
      <footer>Article collection</footer>`)
      return
    }
    if (request.url === '/campaign' || request.url === '/campaign-stuck') {
      const closeButton =
        request.url === '/campaign'
          ? '<button aria-label="إغلاق العرض" onclick="document.getElementById(\'campaign\').remove()">إغلاق</button>'
          : ''
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui;background:#f8fafc;color:#172033}main{max-width:900px;margin:auto;padding:64px}
        .card{padding:32px;border-radius:16px;background:#dbeafe}.campaign{position:fixed;inset:0;z-index:99;background:#ff00ff;color:#050505;display:grid;place-items:center}
      </style><main><h1>Underlying product page</h1><section class="card"><h2>Stable design system</h2>
      <p>The analysis should use this content after closing the temporary promotion.</p></section></main>
      <div id="campaign" class="campaign" role="dialog" aria-modal="true"><div><h2>Limited promotion</h2>${closeButton}</div></div>`)
      return
    }
    if (request.url === '/campaign-delayed') {
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui;background:#f8fafc;color:#172033}main{max-width:900px;margin:auto;padding:64px}
        .card{padding:32px;border-radius:16px;background:#dbeafe}.campaign{position:fixed;inset:0;z-index:99;background:#ff00ff;color:#050505;display:grid;place-items:center}
      </style><main><h1>Underlying delayed campaign page</h1><section class="card"><h2>Stable design system</h2>
      <p>The late campaign should be removed before evidence and screenshots are captured.</p></section></main>
      <script>
        const observer = new MutationObserver((records) => {
          const animationFreezeAdded = records.some((record) => [...record.addedNodes].some((node) =>
            node instanceof HTMLStyleElement && node.textContent.includes('animation-duration: 1ms')))
          if (!animationFreezeAdded) return
          observer.disconnect()
          document.body.insertAdjacentHTML('beforeend', '<div id="campaign" class="campaign" role="dialog" aria-modal="true"><button aria-label="プロモーションを閉じる" onclick="this.parentElement.remove()">閉じる</button></div>')
        })
        observer.observe(document.head, { childList:true })
      </script>`)
      return
    }
    response.end(`<!doctype html><nav><a href="/pricing">Pricing</a></nav>
      <main><a href="/question/123/answer/456">Representative content</a></main>
      <a href="/blog/post-one">Post one</a>
      <a href="/blog/post-two">Post two</a>
      <footer><a href="/contact">Contact</a></footer>
      <a href="/signin">Sign in</a>`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`

  const executablePath = findHeadlessBrowser()
  if (!executablePath) throw new Error('Chrome/Edge is required for page discovery E2E coverage')
  if (process.platform === 'darwin' && executablePath.includes('.app/Contents/MacOS/')) {
    throw new Error('Run pnpm browser:install before this test so macOS does not launch the system Chrome app')
  }
  browser = await chromium.launch({ executablePath, headless: true })
  page = await browser.newPage()
  await page.goto(origin)
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => server?.close(resolve))
})

test('combines DOM and sitemap discovery while preserving route diversity', async () => {
  const result = await discoverPages(page, origin, 3, 'auto')

  assert.deepEqual(
    result.pages.map(({ url, source, kind }) => ({ path: new URL(url).pathname, source, kind })),
    [
      { path: '/pricing', source: 'dom', kind: 'pricing' },
      { path: '/features', source: 'sitemap', kind: 'product' },
      { path: '/about', source: 'sitemap', kind: 'about' },
    ],
  )
  assert.equal(result.candidateCount, 7)
  assert.equal(result.issues.length, 0)
})

test('prefers representative content over footer-only utility routes', async () => {
  const result = await discoverPages(page, origin, 5, 'auto')
  const paths = result.pages.map(({ url }) => new URL(url).pathname)

  assert.ok(paths.includes('/question/123/answer/456'))
  assert.equal(paths.includes('/contact'), false)
})

test('supports link-only discovery without reading sitemap routes', async () => {
  const result = await discoverPages(page, origin, 3, 'links')
  assert.equal(
    result.pages.some(({ url }) => new URL(url).pathname === '/features'),
    false,
  )
  assert.equal(
    result.pages.some(({ url }) => new URL(url).pathname === '/pricing'),
    true,
  )
})

test('adaptively captures one mobile view for a structurally distinct sub-page', { timeout: 120_000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-adaptive-e2e-'))
  const result = await analyze(origin, {
    viewports: ['desktop'],
    maxPages: 2,
    useSession: false,
    pageDiscovery: 'links',
    dataDir,
  })
  const pricingCaptures = result.designEvidence.pages.filter((item) => new URL(item.url).pathname === '/pricing')
  assert.deepEqual(new Set(pricingCaptures.map((item) => item.viewport)), new Set(['desktop', 'mobile']))
  assert.equal(
    pricingCaptures.some((item) => item.horizontalOverflow),
    true,
  )
  assert.equal(result.rawStyles.cssVariables['--imprint-test-request-profile'], 'mobile')
  const captures = result.designEvidence.pages.flatMap((item) => item.images)
  assert.ok(captures.length > 0)
  assert.ok(captures.every((capture) => capture.width > 0 && capture.height > 0))
  assert.ok(captures.every((capture) => fs.statSync(capture.path).size > 0))
})

test(
  'does not add a mobile capture for a structurally similar sub-page with the same breakpoints',
  { timeout: 120_000 },
  async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-adaptive-similar-e2e-'))
    const result = await analyze(`${origin}/similar-entry`, {
      viewports: ['desktop'],
      maxPages: 2,
      useSession: false,
      pageDiscovery: 'links',
      dataDir,
    })
    const childCaptures = result.designEvidence.pages.filter((item) => new URL(item.url).pathname === '/similar-child')

    assert.deepEqual(new Set(childCaptures.map((item) => item.viewport)), new Set(['desktop']))
  },
)

test(
  'dismisses a temporary campaign before extraction and isolates a campaign that cannot be closed',
  { timeout: 120_000 },
  async () => {
    const dismissed = await analyze(`${origin}/campaign`, {
      viewports: ['desktop'],
      maxPages: 1,
      useSession: false,
      pageDiscovery: 'links',
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-campaign-e2e-')),
    })
    assert.ok(dismissed.designEvidence.pages.length > 0)
    assert.equal(JSON.stringify(dismissed.tokens.colors).includes('255, 0, 255'), false)
    assert.equal(JSON.stringify(dismissed.designEvidence.tokens.colors).includes('255, 0, 255'), false)

    const isolated = await analyze(`${origin}/campaign-stuck`, {
      viewports: ['desktop'],
      maxPages: 1,
      useSession: false,
      pageDiscovery: 'links',
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-campaign-stuck-e2e-')),
    })
    assert.equal(isolated.designEvidence.pages.length, 0)
    assert.deepEqual(isolated.designEvidence.tokens.colors, {})
    assert.ok(isolated.extractionIssues.some((issue) => issue.stage.includes('health:large-overlay')))
  },
)

test(
  'rechecks and refreshes evidence when an obstruction appears after the initial health gate',
  { timeout: 120_000 },
  async () => {
    const result = await analyze(`${origin}/campaign-delayed`, {
      viewports: ['desktop'],
      maxPages: 1,
      useSession: false,
      pageDiscovery: 'links',
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-campaign-delayed-e2e-')),
    })

    assert.equal(result.designEvidence.pages.length, 1)
    assert.equal(result.designEvidence.pages[0].health?.recovered, true)
    assert.equal(JSON.stringify(result.tokens.colors).includes('255, 0, 255'), false)
    assert.equal(JSON.stringify(result.designEvidence.tokens.colors).includes('255, 0, 255'), false)
    assert.equal(
      result.designEvidence.components.some((component) => component.type === 'modal'),
      false,
    )
  },
)
