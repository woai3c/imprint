import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright-core'

import { findHeadlessBrowser } from '../../dist/core/analyzer/browser-finder.js'
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
