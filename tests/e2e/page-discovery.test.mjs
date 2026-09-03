import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright-core'

import { buildAnalysisArtifacts } from '../../dist/core/analysis-artifacts.js'
import { findHeadlessBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { NoUsableCapturesError, analyze } from '../../dist/core/analyzer/index.js'
import { discoverPages } from '../../dist/core/analyzer/page-discovery.js'
import { sanitizeDesignEvidenceForPersistence } from '../../dist/core/analyzer/url-privacy.js'
import { auditArtifactBundle } from '../../scripts/audit-design-doc.mjs'

let browser
let page
let server
let origin
let retryCanonicalRequestCount = 0
let transactionChildRequestCount = 0
let statusCanonicalRequestCount = 0
let statusAliasDocuments = []

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
    if (request.url?.startsWith('/query-router?')) {
      const routeValue = new URL(request.url, origin).searchParams.get('doc') || 'route_home_secret'
      const document =
        routeValue === 'route_pricing_secret' ? 'pricing' : routeValue === 'route_docs_secret' ? 'docs' : 'home'
      const links =
        document === 'home'
          ? '<a href="/query-router?doc=route_pricing_secret#top">Pricing document</a><a href="/query-router?doc=route_docs_secret">Documentation document</a>'
          : '<a href="/query-router?doc=route_home_secret">Home document</a>'
      const accent = document === 'pricing' ? '#7c3aed' : document === 'docs' ? '#0f766e' : '#1d4ed8'
      response.end(`<!doctype html><title>Query document ${document}</title><style>
        body{margin:0;font-family:system-ui;color:#172033;background:#f8fafc}header,main,footer{max-width:960px;margin:auto;padding:32px}
        nav{display:flex;gap:20px}section{padding:28px;border:2px solid ${accent};border-radius:16px;background:white}
      </style><header><nav>${links}</nav></header><main><h1>Query document ${document}</h1>
      <section><h2>Distinct routed content</h2><p>This rendered document is selected by standard URL query semantics.</p></section>
      </main><footer>Query route fixture</footer>`)
      return
    }
    if (request.url === '/redirect-query-entry') {
      response.end(`<!doctype html><title>Redirect entry</title><style>
        body{margin:0;font-family:system-ui;color:#172033;background:#f8fafc}header,main,footer{max-width:960px;margin:auto;padding:32px}
        nav{display:flex;gap:20px}section{padding:28px;border:2px solid #1d4ed8;border-radius:16px;background:white}
      </style><header><nav><a href="/redirect-query?doc=alpha">Alpha alias</a><a href="/redirect-query?doc=beta">Beta alias</a></nav></header>
      <main><h1>Redirect entry</h1><section><h2>Canonical documents</h2><p>Both aliases resolve to one document.</p></section></main>
      <footer>Redirect fixture</footer>`)
      return
    }
    if (request.url?.startsWith('/redirect-query?')) {
      response.statusCode = 302
      response.setHeader('location', '/redirect-canonical')
      response.end()
      return
    }
    if (request.url === '/redirect-canonical') {
      response.end(`<!doctype html><title>Redirect canonical</title><style>
        body{margin:0;font-family:system-ui;color:#172033;background:#f8fafc}header,main,footer{max-width:960px;margin:auto;padding:32px}
        nav{display:flex;gap:20px}section{padding:28px;border:2px solid #1d4ed8;border-radius:16px;background:white}
      </style><header><nav><a href="/redirect-query-entry">Redirect entry</a></nav></header>
      <main><h1>Redirect canonical</h1><section><h2>One resolved document</h2><p>Only this resolved identity should contribute evidence.</p></section></main>
      <footer>Redirect fixture</footer>`)
      return
    }
    if (request.url === '/retry-redirect-entry' || request.url === '/all-fail-redirect-entry') {
      const prefix = request.url === '/retry-redirect-entry' ? '/retry-redirect' : '/all-fail-redirect'
      response.end(`<!doctype html><title>Transactional redirect entry</title><style>
        body{margin:0;font-family:system-ui;color:#172033;background:#f8fafc}header,main,footer{max-width:960px;margin:auto;padding:32px}
        nav{display:flex;gap:20px}section{padding:28px;border:2px solid #1d4ed8;border-radius:16px;background:white}
      </style><header><nav><a href="${prefix}?doc=alpha">Alpha alias</a><a href="${prefix}?doc=beta">Beta alias</a>
      <a href="${prefix}?doc=gamma">Gamma alias</a></nav></header>
      <main><h1>Transactional redirect entry</h1><section><p>Failed captures must not prevent a converging alias retry.</p></section></main>
      <footer>Transactional redirect fixture</footer>`)
      return
    }
    if (request.url?.startsWith('/retry-redirect?')) {
      response.statusCode = 302
      response.setHeader('location', '/retry-canonical')
      response.end()
      return
    }
    if (request.url?.startsWith('/all-fail-redirect?')) {
      response.statusCode = 302
      response.setHeader('location', '/all-fail-canonical')
      response.end()
      return
    }
    if (request.url === '/retry-canonical' || request.url === '/all-fail-canonical') {
      const shouldFail = request.url === '/all-fail-canonical' || retryCanonicalRequestCount++ === 0
      const sabotage = shouldFail
        ? `<script>
          const querySelectorAll = Document.prototype.querySelectorAll
          Document.prototype.querySelectorAll = function(selector) {
            if (String(selector) === 'main *, [role="main"] *') throw new Error('intentional one-shot Evidence failure')
            return querySelectorAll.call(this, selector)
          }
        </script>`
        : ''
      const accent = shouldFail ? '#ff00ff' : '#1d4ed8'
      response.end(`<!doctype html><title>Transactional canonical</title><style>
        body{margin:0;font-family:system-ui;color:#172033;background:${accent}}header,main,footer{max-width:960px;margin:auto;padding:32px}
        section{padding:28px;border:2px solid ${accent};border-radius:${shouldFail ? '97px' : '16px'};background:white}
      </style>${sabotage}<header><nav><span>Entry</span></nav></header>
      <main><h1>Transactional canonical</h1><section><p>Only a completed capture may contribute design evidence.</p>
      <a href="/transaction-child">Nested evidence</a></section></main>
      <footer>Transactional redirect fixture</footer>`)
      return
    }
    if (request.url === '/transaction-child') {
      transactionChildRequestCount += 1
      response.end(`<!doctype html><title>Committed nested child</title><style>
        body{margin:0;font-family:system-ui;color:#172033;background:#00ffaa}header,main,footer{max-width:960px;margin:auto;padding:32px}
        section{padding:28px;border:2px solid #006644;border-radius:24px;background:white}
      </style><header><nav><a href="/retry-redirect-entry">Entry</a></nav></header>
      <main><h1>Committed nested child</h1><section><p>This child is eligible only when its parent capture commits.</p></section></main>
      <footer>Transactional child fixture</footer>`)
      return
    }
    if (request.url === '/status-redirect-entry') {
      response.end(`<!doctype html><title>Status redirect entry</title><style>
        body{margin:0;font-family:system-ui;color:#172033;background:#f8fafc}header,main,footer{max-width:960px;margin:auto;padding:32px}
      </style><header><nav><a href="/status-redirect?doc=alpha">Alpha alias</a>
      <a href="/status-redirect?doc=beta">Beta alias</a></nav></header>
      <main><h1>Status redirect entry</h1><p>A failed resolved alias must remain retryable.</p></main>
      <footer>Status redirect fixture</footer>`)
      return
    }
    if (request.url?.startsWith('/status-redirect?')) {
      statusAliasDocuments.push(new URL(request.url, origin).searchParams.get('doc'))
      response.statusCode = 302
      response.setHeader('location', '/status-canonical')
      response.end()
      return
    }
    if (request.url === '/status-canonical') {
      statusCanonicalRequestCount += 1
      if (statusCanonicalRequestCount === 1) {
        response.statusCode = 503
        response.end('<!doctype html><title>Unavailable canonical</title><main>Temporarily unavailable.</main>')
        return
      }
      response.end(`<!doctype html><title>Recovered canonical</title><style>
        body{margin:0;font-family:system-ui;color:#172033;background:#f8fafc}header,main,footer{max-width:960px;margin:auto;padding:32px}
        section{padding:28px;border:2px solid #1d4ed8;border-radius:16px;background:white}
      </style><header><nav><a href="/status-redirect-entry">Entry</a></nav></header>
      <main><h1>Recovered canonical</h1><section><p>The second alias completes the unique document.</p></section></main>
      <footer>Status canonical fixture</footer>`)
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
    if (request.url === '/mutation-entry' || request.url === '/mutation-child') {
      const child = request.url === '/mutation-child'
      const requestProfile = /Mobile/i.test(String(request.headers['user-agent'])) ? 'mobile' : 'desktop'
      response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        :root{--imprint-test-request-profile:${requestProfile}}
        body{margin:0;font-family:system-ui;color:#172033;background:#f8fafc}header,main,footer{max-width:960px;margin:auto;padding:32px}
        .content{display:grid;grid-template-columns:${child ? 'repeat(3,minmax(260px,1fr))' : '1fr'};gap:20px;${child ? 'min-width:860px' : ''}}
        article{padding:24px;border:1px solid #ccd4e0;border-radius:16px;background:white}
        ${child ? '@media(max-width:640px){header,main,footer{padding:20px}.content{grid-template-columns:repeat(3,260px)}}' : ''}
      </style><header><nav><a href="/mutation-entry">Telemetry fixture</a></nav></header><main>
      <h1>${child ? 'Continuously updating comparison' : 'Continuously updating foundation'}</h1>
      <section class="content"><article><h2>Stable visual content</h2><p>Background telemetry changes must remain diagnostic.</p></article>
      ${child ? '<article><h2>Second panel</h2><p>Distinct structure triggers adaptive mobile evidence.</p></article><article><h2>Third panel</h2><p>The rendered design itself remains stable.</p></article>' : ''}</section>
      ${child ? '' : '<a href="/mutation-child">Open comparison page</a>'}</main><footer>Stable visual footer</footer>
      <span id="telemetry" aria-hidden="true" hidden></span><script>
        const telemetry=document.getElementById('telemetry');setInterval(()=>telemetry.toggleAttribute('data-pulse'),4)
      </script>`)
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
    if (request.url === '/fixed-application-shell') {
      response.end(`<!doctype html><style>
        html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:system-ui;color:#172033}
        #application{position:fixed;inset:0;overflow:auto;background:#c7d2fe}
        header,main{max-width:900px;margin:auto;padding:32px}.workspace{padding:32px;background:#f8fafc;border-radius:18px}
      </style><div id="application"><header><nav>Application navigation</nav></header><main>
      <h1>Persistent application workspace</h1><section class="workspace"><h2>Legitimate fixed-shell content</h2>
      <p>This complete application document must remain available for extraction and design evidence.</p>
      <button onclick="document.getElementById('application').remove()">×</button></section></main></div>`)
      return
    }
    if (request.url === '/fixed-application-shell-no-main') {
      response.end(`<!doctype html><style>
        html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:system-ui;color:#172033}
        #application{position:fixed;inset:0;overflow:auto;background:#c7d2fe}
        header,article{max-width:900px;margin:auto;padding:32px}.workspace{padding:32px;background:#f8fafc;border-radius:18px}
      </style><div id="application"><header><nav>Application navigation</nav></header><article>
      <h1>Persistent article workspace</h1><section class="workspace"><h2>Legitimate fixed-shell content</h2>
      <p>This standards-backed article is the complete application document and must remain available for extraction.</p>
      <button onclick="document.getElementById('application').remove()">×</button></section></article></div>`)
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
    if (request.url === '/subpage-final-health-entry') {
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui;background:#f8fafc;color:#172033}main{max-width:900px;margin:auto;padding:64px}
        a{color:#1d4ed8}.card{padding:32px;border-radius:16px;background:#dbeafe}
      </style><main><h1>Stable entry transaction</h1><section class="card"><h2>Captured foundation</h2>
      <p>This entry remains usable when a later sub-page becomes obstructed during its final health check.</p>
      <a href="/campaign-final-health-fast">Open delayed child</a></section></main>`)
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
    if (request.url === '/campaign-final-health' || request.url === '/campaign-final-health-fast') {
      const overlayDelay = request.url === '/campaign-final-health-fast' ? 0 : 750
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui;background:#f8fafc;color:#172033}main{max-width:900px;margin:auto;padding:64px}
        .card{min-height:900px;padding:32px;border-radius:16px;background:#dbeafe}.campaign{position:fixed;inset:0;z-index:99;background:#ff00ff;color:#050505;display:grid;place-items:center}
      </style><main><h1>Late obstruction transaction</h1><section class="card"><h2>Stable design system</h2>
      <p>The saved capture must be rejected when an obstruction appears after the early health samples.</p></section></main>
      <script>
        const observer = new MutationObserver((records) => {
          const animationFreezeAdded = records.some((record) => [...record.addedNodes].some((node) =>
            node instanceof HTMLStyleElement && node.textContent.includes('animation-duration: 1ms')))
          if (!animationFreezeAdded) return
          observer.disconnect()
          setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<div id="campaign" class="campaign" role="dialog" aria-modal="true"><h2>Late blocking consent</h2></div>'), ${overlayDelay})
        })
        observer.observe(document.head, { childList:true })
      </script>`)
      return
    }
    if (request.url === '/final-health-navigation') {
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui;background:#f8fafc;color:#172033}main{min-height:1200px;max-width:900px;margin:auto;padding:64px}
      </style><main><h1>Late navigation transaction</h1><p>A navigation during final health must discard this capture without crashing analysis.</p>
      <script>
        const observer = new MutationObserver((records) => {
          const animationFreezeAdded = records.some((record) => [...record.addedNodes].some((node) =>
            node instanceof HTMLStyleElement && node.textContent.includes('animation-duration: 1ms')))
          if (!animationFreezeAdded) return
          observer.disconnect()
          setTimeout(() => location.href = '/final-health-navigation-destination', 750)
        })
        observer.observe(document.head, { childList:true })
      </script></main>`)
      return
    }
    if (request.url === '/final-health-navigation-destination') {
      response.end(
        '<!doctype html><main><h1>Different late document</h1><p>This page was not part of the completed capture.</p></main>',
      )
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
    if (request.url === '/history-identity-entry') {
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui;color:#172033;background:#f8fafc}header,main,footer{max-width:960px;margin:auto;padding:32px}
        section{padding:24px;background:#fff;border:1px solid #cbd5e1;border-radius:16px}
      </style><header><nav><a href="/history-identity-child">History child</a></nav></header>
      <main><h1>Capture identity entry</h1><section><p>Every committed artifact must share one route identity.</p></section></main>
      <footer>Capture identity fixture</footer>`)
      return
    }
    if (request.url === '/history-identity-child') {
      response.end(`<!doctype html><style>
        body{margin:0;font-family:system-ui;color:#172033;background:#f8fafc}header,main,footer{max-width:960px;margin:auto;padding:32px}
        section{padding:24px;background:#fff;border:1px solid #94a3b8;border-radius:16px}
      </style><header><nav><a href="/history-identity-entry">History entry</a></nav></header>
      <main><h1>Capture identity child</h1><button aria-expanded="false" aria-controls="details"
        onclick="history.replaceState({}, '', '/history-mutated')">Details</button>
        <section id="details" hidden><p>Interaction details.</p></section></main>
      <footer>Capture identity fixture</footer>`)
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

test('combines DOM and sitemap discovery using structural, language-neutral ranking', async () => {
  const result = await discoverPages(page, origin, 3, 'auto')

  assert.deepEqual(
    result.pages.map(({ url, source, kind }) => ({ path: new URL(url).pathname, source, kind })),
    [
      { path: '/pricing', source: 'dom', kind: 'generic' },
      { path: '/about', source: 'sitemap', kind: 'generic' },
      { path: '/features', source: 'sitemap', kind: 'generic' },
    ],
  )
  assert.equal(result.candidateCount, 9)
  assert.equal(result.issues.length, 0)
})

test('keeps the automatic discovery prefix diverse when every candidate is returned', async () => {
  const result = await discoverPages(page, origin)

  assert.ok(result.pages.length > 3)
  assert.deepEqual(
    result.pages.slice(0, 3).map(({ url, kind }) => ({ path: new URL(url).pathname, kind })),
    [
      { path: '/pricing', kind: 'generic' },
      { path: '/about', kind: 'generic' },
      { path: '/features', kind: 'generic' },
    ],
  )
})

test('demotes footer-only routes without interpreting their words', async () => {
  const result = await discoverPages(page, origin, 5, 'auto')
  const paths = result.pages.map(({ url }) => new URL(url).pathname)

  assert.ok(paths.includes('/signin'))
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

test(
  'captures distinct query-only documents while persisted evidence redacts query text',
  { timeout: 180_000 },
  async () => {
    const entryUrl = `${origin}/query-router?doc=route_home_secret`
    const scopedPage = await browser.newPage()
    await scopedPage.goto(entryUrl)
    const discovery = await discoverPages(scopedPage, entryUrl, 4, 'links')

    assert.deepEqual(discovery.pages.map(({ url }) => new URL(url).searchParams.get('doc')).sort(), [
      'route_docs_secret',
      'route_pricing_secret',
    ])
    assert.equal(discovery.candidateCount, 2)
    await scopedPage.close()

    const result = await analyze(entryUrl, {
      viewports: ['desktop'],
      maxPages: 3,
      pageDiscovery: 'links',
      useSession: false,
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-query-routes-e2e-')),
    })

    assert.equal(result.pageCoverage.discovered, 2)
    assert.equal(result.pageCoverage.selected, 2)
    assert.equal(result.pageCoverage.analyzed, 3)
    assert.deepEqual([...new Set(result.designEvidence.pages.map((captured) => captured.title))].sort(), [
      'Query document docs',
      'Query document home',
      'Query document pricing',
    ])
    assert.equal(new Set(result.designEvidence.pages.map((captured) => captured.routeId)).size, 3)
    assert.equal(new Set(result.pageScreenshots.map((screenshot) => screenshot.routeId)).size, 3)

    const persisted = sanitizeDesignEvidenceForPersistence(result.designEvidence)
    const serialized = JSON.stringify(persisted)
    assert.equal(serialized.includes('doc='), false)
    assert.equal(serialized.includes('route_home_secret'), false)
    assert.equal(serialized.includes('route_pricing_secret'), false)
    assert.equal(serialized.includes('route_docs_secret'), false)
    assert.equal(new Set(persisted.pages.map((captured) => captured.url)).size, 1)
    assert.equal(new Set(persisted.pages.map((captured) => captured.routeId)).size, 3)
    assert.ok(persisted.limitations.includes('query-route-redacted'))

    const renderedEvidence = Object.values(persisted.tokens.evidence || {}).filter(
      (item) => item.renderedTextOwners?.length,
    )
    assert.ok(renderedEvidence.length > 0)
    for (const item of renderedEvidence) {
      assert.deepEqual(new Set(item.renderedTextOwners.map((owner) => owner.routeId)), new Set(item.pageRefs))
      if (item.pairedSurface) {
        assert.deepEqual(
          new Set(item.pairedSurface.routeSupport.filter((route) => route.supported).map((route) => route.routeId)),
          new Set(item.pageRefs),
        )
      }
    }

    const artifacts = buildAnalysisArtifacts(result, { sourceUrl: entryUrl })
    const artifactDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-query-route-artifacts-'))
    const files = {
      'DESIGN.md': artifacts.designDoc,
      'design-evidence.json': artifacts.evidenceJson,
      'design-tokens.json': artifacts.dtcgJson,
      'design-profile.json': artifacts.profileJson,
      'component-specs.json': artifacts.componentSpecsJson,
      'visual-qa.json': artifacts.visualQaJson,
      'variables.css': artifacts.cssVariables,
      'variables.scss': artifacts.scssVariables,
      'theme.css': artifacts.tailwindTheme,
      'style-guide.html': artifacts.pdfHtml,
    }
    await Promise.all(
      Object.entries(files).map(([filename, source]) =>
        fs.promises.writeFile(path.join(artifactDirectory, filename), source),
      ),
    )
    assert.deepEqual((await auditArtifactBundle(artifactDirectory)).hardFailures, [])
  },
)

test('deduplicates query aliases that redirect to one resolved document', { timeout: 180_000 }, async () => {
  const entryUrl = `${origin}/redirect-query-entry`
  const result = await analyze(entryUrl, {
    viewports: ['desktop'],
    maxPages: 3,
    pageDiscovery: 'links',
    useSession: false,
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-redirect-aliases-e2e-')),
  })

  assert.equal(result.pageCoverage.discovered, 2)
  assert.equal(result.pageCoverage.selected, 1)
  assert.equal(result.pageCoverage.analyzed, 2)
  assert.equal(result.designEvidence.pages.length, 2)
  assert.equal(new Set(result.designEvidence.pages.map((captured) => captured.id)).size, 2)
  assert.equal(result.designEvidence.pages.filter((captured) => captured.title === 'Redirect canonical').length, 1)

  const artifacts = buildAnalysisArtifacts(result, { sourceUrl: entryUrl })
  const artifactDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-redirect-alias-artifacts-'))
  const files = {
    'DESIGN.md': artifacts.designDoc,
    'design-evidence.json': artifacts.evidenceJson,
    'design-tokens.json': artifacts.dtcgJson,
    'design-profile.json': artifacts.profileJson,
    'component-specs.json': artifacts.componentSpecsJson,
    'visual-qa.json': artifacts.visualQaJson,
    'variables.css': artifacts.cssVariables,
    'variables.scss': artifacts.scssVariables,
    'theme.css': artifacts.tailwindTheme,
    'style-guide.html': artifacts.pdfHtml,
  }
  await Promise.all(
    Object.entries(files).map(([filename, source]) =>
      fs.promises.writeFile(path.join(artifactDirectory, filename), source),
    ),
  )
  const audit = await auditArtifactBundle(artifactDirectory)
  assert.deepEqual(audit.hardFailures, [])
})

test('retries a failed resolved capture without committing its extracted styles', { timeout: 180_000 }, async () => {
  retryCanonicalRequestCount = 0
  transactionChildRequestCount = 0
  const result = await analyze(`${origin}/retry-redirect-entry`, {
    viewports: ['desktop'],
    maxPages: 3,
    pageDiscovery: 'links',
    useSession: false,
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-redirect-retry-e2e-')),
  })

  assert.equal(retryCanonicalRequestCount, 3)
  assert.equal(transactionChildRequestCount, 1)
  assert.equal(result.pageCoverage.discovered, 4)
  assert.equal(result.pageCoverage.selected, 2)
  assert.equal(result.pageCoverage.analyzed, 3)
  assert.equal(result.designEvidence.pages.length, 3)
  assert.equal(new Set(result.designEvidence.pages.map((captured) => captured.id)).size, 3)
  assert.equal(result.designEvidence.pages.filter((captured) => captured.title === 'Transactional canonical').length, 1)
  assert.equal(result.designEvidence.pages.filter((captured) => captured.title === 'Committed nested child').length, 1)
  assert.ok(result.extractionIssues.some((issue) => issue.reason.includes('intentional one-shot Evidence failure')))
  const committedDesignData = JSON.stringify({
    tokens: result.tokens,
    components: result.components,
    evidenceTokens: result.designEvidence.tokens,
  })
  assert.equal(committedDesignData.includes('#ff00ff'), false)
  assert.equal(committedDesignData.includes('rgb(255, 0, 255)'), false)
  assert.equal(committedDesignData.includes('97px'), false)
})

test('does not commit aggregate data when every alias capture fails', { timeout: 180_000 }, async () => {
  transactionChildRequestCount = 0
  const result = await analyze(`${origin}/all-fail-redirect-entry`, {
    viewports: ['desktop'],
    maxPages: 4,
    pageDiscovery: 'links',
    useSession: false,
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-redirect-all-fail-e2e-')),
  })

  assert.equal(transactionChildRequestCount, 0)
  assert.equal(result.pageCoverage.discovered, 3)
  assert.equal(result.pageCoverage.selected, 1)
  assert.equal(result.pageCoverage.analyzed, 1)
  assert.equal(result.designEvidence.pages.length, 1)
  assert.equal(
    result.designEvidence.pages.some((captured) => captured.title === 'Committed nested child'),
    false,
  )
  const committedDesignData = JSON.stringify({
    tokens: result.tokens,
    components: result.components,
    evidenceTokens: result.designEvidence.tokens,
  })
  assert.equal(committedDesignData.includes('#ff00ff'), false)
  assert.equal(committedDesignData.includes('rgb(255, 0, 255)'), false)
  assert.equal(committedDesignData.includes('97px'), false)
  assert.equal(committedDesignData.includes('#00ffaa'), false)
  assert.equal(committedDesignData.includes('rgb(0, 255, 170)'), false)
})

test('counts one selected document when a failed resolved alias later succeeds', { timeout: 180_000 }, async () => {
  statusCanonicalRequestCount = 0
  statusAliasDocuments = []
  const result = await analyze(`${origin}/status-redirect-entry`, {
    viewports: ['desktop'],
    maxPages: 3,
    pageDiscovery: 'links',
    useSession: false,
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-status-redirect-retry-e2e-')),
  })

  assert.ok(statusCanonicalRequestCount >= 2)
  assert.deepEqual([...new Set(statusAliasDocuments)], ['alpha', 'beta'])
  assert.equal(result.pageCoverage.discovered, 2)
  assert.equal(result.pageCoverage.selected, 1)
  assert.equal(result.pageCoverage.analyzed, 2)
  const recoveredCaptures = result.designEvidence.pages.filter((captured) => captured.title === 'Recovered canonical')
  assert.ok(recoveredCaptures.length >= 1)
  assert.equal(new Set(recoveredCaptures.map((captured) => captured.routeId)).size, 1)
  assert.equal(result.designEvidence.coverage.pageCoverage, 'complete')
  assert.equal(result.designEvidence.coverage.captureCoverage.expected, 2)
  assert.equal(result.designEvidence.coverage.captureCoverage.captured, 2)
  assert.equal(result.designEvidence.coverage.captureCoverage.status, 'complete')
  assert.deepEqual(result.designEvidence.coverage.captureCoverage.requestedViewports, ['desktop'])
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
      `${origin}/automatic-entry`,
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
    assert.equal(result.pageCoverage.analyzed, 1)
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

test(
  'keeps token, screenshot, coverage, and Evidence route identities aligned after unsafe probing',
  { timeout: 120_000 },
  async () => {
    const result = await analyze(`${origin}/history-identity-entry`, {
      viewports: ['desktop'],
      maxPages: 2,
      useSession: false,
      pageDiscovery: 'links',
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-capture-identity-e2e-')),
    })
    const serialized = JSON.stringify({
      tokens: result.tokens,
      pages: result.designEvidence.pages,
      screenshots: result.pageScreenshots,
      coverage: result.pageCoverage,
    })
    const routeIds = new Set(result.designEvidence.pages.map((captured) => captured.routeId))
    const tokenPageRefs = []
    const collectPageRefs = (value) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        value.forEach(collectPageRefs)
        return
      }
      if (Array.isArray(value.pageRefs)) tokenPageRefs.push(...value.pageRefs)
      Object.values(value).forEach(collectPageRefs)
    }
    collectPageRefs(result.tokens)

    assert.equal(result.pageCoverage.analyzed, 2)
    assert.deepEqual(
      [...new Set(result.designEvidence.pages.map((captured) => new URL(captured.url).pathname))].sort(),
      ['/history-identity-child', '/history-identity-entry'],
    )
    assert.equal(serialized.includes('about:blank'), false)
    assert.equal(serialized.includes('/history-mutated'), false)
    assert.ok(tokenPageRefs.length > 0)
    assert.equal(
      tokenPageRefs.every((routeId) => routeIds.has(routeId)),
      true,
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
  'keeps stable entry, sub-page, and adaptive captures when only diagnostic telemetry keeps mutating',
  { timeout: 120_000 },
  async () => {
    const result = await analyze(`${origin}/mutation-entry`, {
      viewports: ['desktop'],
      maxPages: 2,
      useSession: false,
      pageDiscovery: 'links',
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-continuous-mutation-e2e-')),
    })
    const entryCaptures = result.designEvidence.pages.filter(
      (captured) => new URL(captured.url).pathname === '/mutation-entry',
    )
    const childCaptures = result.designEvidence.pages.filter(
      (captured) => new URL(captured.url).pathname === '/mutation-child',
    )

    assert.equal(result.pageCoverage.analyzed, 2)
    assert.deepEqual(new Set(entryCaptures.map((captured) => captured.viewport)), new Set(['desktop']))
    assert.deepEqual(new Set(childCaptures.map((captured) => captured.viewport)), new Set(['desktop', 'mobile']))
    assert.ok(result.designEvidence.pages.every((captured) => captured.health?.recovered === false))
    assert.ok(
      result.designEvidence.pages.every((captured) =>
        captured.health?.issues.some((issue) => issue.code === 'dom-still-mutating'),
      ),
    )
    assert.equal(
      result.designEvidence.limitations.some((limitation) => limitation.includes('capture-excluded-page-health')),
      false,
    )
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

    await assert.rejects(
      analyze(`${origin}/campaign-stuck`, {
        viewports: ['desktop'],
        maxPages: 1,
        useSession: false,
        pageDiscovery: 'links',
        dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-campaign-stuck-e2e-')),
      }),
      (error) =>
        error instanceof NoUsableCapturesError &&
        error.code === 'NO_USABLE_CAPTURES' &&
        error.extractionIssues.some((issue) => issue.stage.includes('health:large-overlay')),
    )
  },
)

test(
  'preserves a fixed application shell through the complete analysis transaction',
  { timeout: 120_000 },
  async () => {
    const result = await analyze(`${origin}/fixed-application-shell`, {
      viewports: ['desktop'],
      maxPages: 1,
      useSession: false,
      pageDiscovery: 'links',
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-fixed-application-shell-e2e-')),
    })

    assert.equal(result.pageCoverage.analyzed, 1)
    assert.equal(result.designEvidence.pages.length, 1)
    assert.ok(result.designEvidence.sections.length > 0)
    assert.ok(result.designEvidence.components.some((component) => component.type === 'button'))
    assert.equal(
      result.designEvidence.pages[0].health?.issues.some((issue) => issue.code === 'large-overlay'),
      false,
    )
  },
)

test('preserves a fixed standards-backed application shell without a main landmark', { timeout: 120_000 }, async () => {
  const result = await analyze(`${origin}/fixed-application-shell-no-main`, {
    viewports: ['desktop'],
    maxPages: 1,
    useSession: false,
    pageDiscovery: 'links',
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-fixed-article-shell-e2e-')),
  })

  assert.equal(result.pageCoverage.analyzed, 1)
  assert.equal(result.designEvidence.pages.length, 1)
  assert.ok(result.designEvidence.sections.length > 0)
  assert.ok(result.designEvidence.components.some((component) => component.type === 'button'))
  assert.equal(
    result.designEvidence.pages[0].health?.issues.some((issue) => issue.code === 'large-overlay'),
    false,
  )
})

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
    for (const page of result.designEvidence.pages) {
      assert.ok(page.health?.checkedAt)
      assert.ok(page.images.length > 0)
      assert.ok(page.images.every((image) => image.capturedAt))
      assert.ok(
        page.images.every((image) => Date.parse(image.capturedAt) <= Date.parse(page.health.checkedAt)),
        'final health must be newer than every committed screenshot',
      )
    }
  },
)

test('rejects a capture when a blocking overlay appears after screenshots begin', { timeout: 120_000 }, async () => {
  await assert.rejects(
    analyze(`${origin}/campaign-final-health`, {
      viewports: ['desktop'],
      maxPages: 1,
      useSession: false,
      pageDiscovery: 'links',
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-campaign-final-health-e2e-')),
    }),
    (error) =>
      error instanceof NoUsableCapturesError &&
      error.code === 'NO_USABLE_CAPTURES' &&
      error.extractionIssues.some(
        (issue) => issue.stage.includes('final-health:large-overlay') || issue.stage.includes('final-health'),
      ),
  )
})

test(
  'discards a recovered sub-page transaction without contaminating the committed entry capture',
  { timeout: 120_000 },
  async () => {
    const result = await analyze(`${origin}/subpage-final-health-entry`, {
      viewports: ['desktop'],
      maxPages: 2,
      useSession: false,
      pageDiscovery: 'links',
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-subpage-final-health-e2e-')),
    })

    assert.equal(result.pageCoverage.analyzed, 1)
    assert.deepEqual(
      result.designEvidence.pages.map((captured) => new URL(captured.url).pathname),
      ['/subpage-final-health-entry'],
    )
    assert.equal(JSON.stringify(result.tokens.colors).includes('255, 0, 255'), false)
    assert.equal(JSON.stringify(result.designEvidence).includes('/campaign-final-health-fast'), false)
    assert.ok(
      result.designEvidence.limitations.some((limitation) => limitation.includes('capture-excluded-page-health')),
    )
  },
)

test(
  'turns navigation during final health into a discarded capture instead of an analyzer crash',
  { timeout: 120_000 },
  async () => {
    await assert.rejects(
      analyze(`${origin}/final-health-navigation`, {
        viewports: ['desktop'],
        maxPages: 1,
        useSession: false,
        pageDiscovery: 'links',
        dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'imprint-final-health-navigation-e2e-')),
      }),
      (error) =>
        error instanceof NoUsableCapturesError &&
        error.code === 'NO_USABLE_CAPTURES' &&
        error.extractionIssues.some(
          (issue) =>
            issue.stage.includes('final-health:inspection-failed') ||
            issue.stage.includes('final-health:unexpected-navigation'),
        ),
    )
  },
)
