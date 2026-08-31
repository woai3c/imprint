import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright-core'

import { findHeadlessBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { NoUsableCapturesError, analyze } from '../../dist/core/analyzer/index.js'
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
    if (request.url === '/people/sample') {
      response.end(`<!doctype html>
        <header><nav><a href="/pricing">Pricing</a><a href="/features">Features</a></nav></header>
        <main><h1>Public portfolio</h1><a href="/people/sample/portfolio-one">Portfolio one</a>
        <a href="/people/sample/portfolio-two">Portfolio two</a></main>
        <footer><a href="/contact">Contact</a></footer>`)
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
    if (request.url === '/fallback-entry') {
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui;color:#172033}header,main,footer{max-width:960px;margin:auto;padding:32px}
        section{padding:24px;background:#f3f6fa}
      </style><header><nav><a href="/fallback-entry">Guide</a></nav></header><main><h1>Reference guide</h1>
      <section><p>A stable entry page with several ranked descendant routes.</p>
      <a href="/fallback-entry/fail">First chapter</a><a href="/fallback-entry/success-one">Second chapter</a>
      <a href="/fallback-entry/success-two">Third chapter</a></section></main><footer>Guide collection</footer>`)
      return
    }
    if (request.url === '/fallback-entry/fail') {
      response.statusCode = 503
      response.end('<!doctype html><main><h1>Temporarily unavailable</h1></main>')
      return
    }
    if (request.url === '/unavailable') {
      response.statusCode = 503
      response.end(`<!doctype html><main><h1>Service unavailable</h1>
        <p>This page intentionally contains enough text to complete navigation while its HTTP status excludes it from evidence.</p></main>`)
      return
    }
    if (request.url === '/fallback-entry/success-one' || request.url === '/fallback-entry/success-two') {
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui;color:#172033}header,main,footer{max-width:960px;margin:auto;padding:32px}
        section{padding:24px;background:#f3f6fa}
      </style><header><nav><a href="/fallback-entry">Guide</a></nav></header><main><h1>Reference chapter</h1>
      <section><p>A stable descendant page using the same design language.</p></section></main><footer>Guide collection</footer>`)
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
    if (request.url === '/geometry-interaction') {
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui}main{padding:32px}.payload{height:1400px;background:#eef2ff}
      </style><main><button aria-expanded="false" aria-controls="details">Details</button>
      <section id="details" hidden>Expanded details</section><div class="payload">Long page evidence</div></main>
      <script>
        const button=document.querySelector('button'); const details=document.querySelector('#details')
        button.addEventListener('click',()=>{const expanded=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!expanded));details.hidden=expanded;document.querySelector('.payload')?.remove()})
      </script>`)
      return
    }
    if (
      request.url === '/automatic-entry' ||
      /^\/automatic-entry\/(?:one|two|three|four|five|six)$/.test(request.url || '')
    ) {
      const links =
        request.url === '/automatic-entry'
          ? ['one', 'two', 'three', 'four', 'five', 'six']
              .map((name) => `<a href="/automatic-entry/${name}">Product surface ${name}</a>`)
              .join('')
          : '<a href="/automatic-entry">Automatic entry</a>'
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui;color:#172033}header,main,footer{max-width:960px;margin:auto;padding:24px}
        section{padding:24px;background:#f3f6fa;border-radius:16px}nav{display:flex;gap:16px;flex-wrap:wrap}
      </style><header><nav>${links}</nav></header><main><h1>Automatic analysis fixture</h1>
      <section><p>Stable design evidence for ${request.url}.</p></section></main><footer>Fixture footer</footer>`)
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

test('keeps the automatic discovery prefix diverse when every candidate is returned', async () => {
  const result = await discoverPages(page, origin)

  assert.ok(result.pages.length > 3)
  assert.deepEqual(
    result.pages.slice(0, 3).map(({ url, kind }) => ({ path: new URL(url).pathname, kind })),
    [
      { path: '/pricing', kind: 'pricing' },
      { path: '/features', kind: 'product' },
      { path: '/about', kind: 'about' },
    ],
  )
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

test('keeps non-root discovery in context when primary content exposes descendant routes', async () => {
  const scopedPage = await browser.newPage()
  await scopedPage.goto(`${origin}/people/sample`)

  const result = await discoverPages(scopedPage, `${origin}/people/sample`, 2, 'links')

  assert.deepEqual(
    result.pages.map(({ url }) => new URL(url).pathname),
    ['/people/sample/portfolio-one', '/people/sample/portfolio-two'],
  )
  await scopedPage.close()
})

test('the default analysis bound can complete more than the former five-page limit', { timeout: 180_000 }, async () => {
  const result = await analyze(`${origin}/automatic-entry`, {
    viewports: ['desktop'],
    useSession: false,
    pageDiscovery: 'links',
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-automatic-pages-e2e-')),
  })

  assert.equal(result.captureManifest.request.pageMode, 'bounded')
  assert.equal(result.captureManifest.request.maxPages, 8)
  assert.equal(result.pageCoverage.analyzed, 7)
  assert.equal(result.completion.reason, 'complete')
})

test('rejects an analysis that produced no usable page captures', { timeout: 60_000 }, async () => {
  await assert.rejects(
    analyze(`${origin}/unavailable`, {
      viewports: ['desktop'],
      maxPages: 1,
      useSession: false,
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-empty-page-e2e-')),
    }),
    (error) => error instanceof NoUsableCapturesError && error.code === 'NO_USABLE_CAPTURES',
  )
})

test('finishing early keeps every page that was already completed', { timeout: 120_000 }, async () => {
  const finishController = new AbortController()
  const result = await analyze(
    `${origin}/automatic-entry`,
    {
      viewports: ['desktop'],
      useSession: false,
      pageDiscovery: 'links',
      finishSignal: finishController.signal,
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-finish-current-e2e-')),
    },
    (progress) => {
      if (progress.analyzedPages >= 2) finishController.abort('test-finish')
    },
  )

  assert.equal(result.completion.reason, 'user-finished')
  assert.equal(result.pageCoverage.analyzed, 2)
  assert.ok(result.designEvidence.pages.length >= 2)
})

test(
  'does not relabel a completed capture when Finish is requested during result generation',
  { timeout: 120_000 },
  async () => {
    const finishController = new AbortController()
    const result = await analyze(
      origin,
      {
        viewports: ['desktop'],
        maxPages: 1,
        useSession: false,
        pageDiscovery: 'links',
        finishSignal: finishController.signal,
        dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-finish-after-capture-e2e-')),
      },
      (progress) => {
        if (progress.step === 'progress.analyzingPatterns') finishController.abort('too-late-to-finish')
      },
    )

    assert.equal(result.completion.reason, 'complete')
  },
)

test('tries a bounded ranked fallback when the selected sub-page is unavailable', { timeout: 120_000 }, async () => {
  const result = await analyze(`${origin}/fallback-entry`, {
    viewports: ['desktop'],
    maxPages: 2,
    useSession: false,
    pageDiscovery: 'links',
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-page-fallback-e2e-')),
  })
  const pageCoverage = result.captureManifest.capture.pages
  const analyzedPaths = [...new Set(result.designEvidence.pages.map(({ url }) => new URL(url).pathname))]

  assert.equal(pageCoverage.requested, 2)
  assert.equal(pageCoverage.selected, 1)
  assert.equal(pageCoverage.analyzed, 2)
  assert.ok(analyzedPaths.includes('/fallback-entry/success-one'))
  assert.equal(analyzedPaths.includes('/fallback-entry/fail'), false)
})

test('records the runtime browser separately from a mobile-only emulation', { timeout: 120_000 }, async () => {
  const result = await analyze(`${origin}/similar-entry`, {
    viewports: ['mobile'],
    maxPages: 1,
    useSession: false,
    pageDiscovery: 'links',
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-mobile-manifest-e2e-')),
  })
  const runtimeUserAgent = result.captureManifest.environment.browser.userAgent
  const mobileEnvironment = result.captureManifest.environment.viewports[0]

  assert.equal(runtimeUserAgent.includes('Pixel 7'), false)
  assert.equal(mobileEnvironment.userAgent.includes('Pixel 7'), true)
  assert.notEqual(mobileEnvironment.userAgent, runtimeUserAgent)
  assert.equal(mobileEnvironment.source, 'requested')
  assert.equal(mobileEnvironment.emulationProfile, 'pixel-7-android-13')
  assert.equal(result.captureManifest.stabilization.animationFreeze.coverage, 'complete')
})

test(
  'captures base screenshots before probing interactions that cannot be fully restored',
  { timeout: 120_000 },
  async () => {
    const result = await analyze(`${origin}/geometry-interaction`, {
      viewports: ['desktop'],
      maxPages: 1,
      useSession: false,
      pageDiscovery: 'links',
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-interaction-geometry-e2e-')),
    })
    const pageEvidence = result.designEvidence.pages[0]
    const overview = pageEvidence.images.find((image) => image.kind === 'overview')

    assert.ok((overview?.height || 0) >= 1400)
    assert.equal(
      result.extractionIssues.some((issue) => issue.stage.endsWith(':screenshot:overview')),
      false,
    )
    assert.equal(
      result.designEvidence.interactionObservations.filter((observation) => observation.safety === 'safe-active')
        .length,
      0,
    )
  },
)

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
  assert.equal(
    result.captureManifest.environment.viewports.find((viewport) => viewport.name === 'mobile')?.source,
    'adaptive',
  )
  assert.equal(result.captureManifest.stabilization.animationFreeze.coverage, 'partial')
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
