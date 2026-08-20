import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const fixturePath = path.join(repoRoot, 'tests', 'e2e', 'fixtures', 'design-system.html')
const resultDir = path.join(repoRoot, 'test-results')
const failureScreenshotPath = path.join(resultDir, 'core-flow-failure.png')

let fixtureServer
let fixtureUrl
let electronApp
let page
let userDataDir
let comparisonFixtureChanged = false

function launchApp(locale = 'en-US') {
  return electron.launch({
    args: ['.'],
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      IMPRINT_E2E: '1',
      IMPRINT_E2E_USER_DATA_DIR: userDataDir,
    },
    locale,
    timeout: 60_000,
  })
}

const authFixture = Buffer.from(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Workspace access</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
      main { width: 360px; margin: 15vh auto; padding: 32px; border-radius: 16px; background: white; box-shadow: 0 20px 45px rgb(15 23 42 / 12%); }
      label, input, button { display: block; width: 100%; }
      input { box-sizing: border-box; margin: 8px 0 16px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; }
      button { padding: 12px; border: 0; border-radius: 8px; background: #2563eb; color: white; }
    </style>
  </head>
  <body>
    <main>
      <div>验证码登录</div>
      <p>使用手机号访问私有工作区。</p>
      <label>手机号<input type="tel" autocomplete="tel" /></label>
      <label>短信验证码<input inputmode="numeric" autocomplete="one-time-code" /></label>
      <button type="button">登录/注册</button>
    </main>
  </body>
</html>`)

before(async () => {
  await fs.rm(failureScreenshotPath, { force: true })

  const fixture = await fs.readFile(fixturePath)
  fixtureServer = http.createServer((request, response) => {
    if (request.url?.startsWith('/failure')) {
      request.socket.destroy()
      return
    }

    const requiresAuthentication = request.url?.startsWith('/private')
    const authenticated = request.headers.cookie?.split(/;\s*/).includes('imprint_e2e_auth=1') ?? false
    const authenticationRequired = requiresAuthentication && !authenticated
    const comparisonBody = comparisonFixtureChanged
      ? Buffer.from(
          fixture
            .toString('utf8')
            .replace('--fixture-brand: #2563eb', '--fixture-brand: #dc2626')
            .replace('max-width: 960px', 'max-width: 840px')
            .replace('grid-template-columns: repeat(2, minmax(0, 1fr))', 'grid-template-columns: repeat(3, 1fr)')
            .replace('background: #1d4ed8', 'background: #b91c1c')
            .replace('<section class="hero">', '<div class="layout-wrapper"><section class="hero">')
            .replace('</section>\n      <form', '</section></div>\n      <form'),
        )
      : fixture
    const body = authenticationRequired
      ? authFixture
      : request.url?.startsWith('/comparison')
        ? comparisonBody
        : fixture
    const responseHeaders = {
      'cache-control': 'no-store',
      'content-length': body.length,
      'content-type': 'text/html; charset=utf-8',
    }
    if (authenticationRequired && !/HeadlessChrome/i.test(request.headers['user-agent'] || '')) {
      responseHeaders['set-cookie'] = 'imprint_e2e_auth=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600'
    }
    response.writeHead(200, responseHeaders)
    response.end(body)
  })

  await new Promise((resolve, reject) => {
    fixtureServer.once('error', reject)
    fixtureServer.listen(0, '127.0.0.1', resolve)
  })

  const address = fixtureServer.address()
  if (!address || typeof address === 'string') throw new Error('The E2E fixture server did not expose a TCP port')
  fixtureUrl = `http://127.0.0.1:${address.port}/`

  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-e2e-'))
  electronApp = await launchApp()
  page = await electronApp.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded')
})

after(async () => {
  await electronApp?.close()
  await new Promise((resolve) => fixtureServer?.close(resolve))
  if (process.env.IMPRINT_E2E_KEEP_USER_DATA === '1') {
    console.log('kept userDataDir:', userDataDir)
    return
  }
  if (userDataDir) await fs.rm(userDataDir, { force: true, recursive: true })
})

test('switches themes in the current validation scenario', async () => {
  await page.locator('a[href="#/templates"]').click()
  await page.getByTestId('validation-scenario-grid').waitFor({ state: 'visible' })
  const themeGroups = page.getByTestId('validation-theme-groups').locator(':scope > section')
  assert.equal(await themeGroups.count(), 2)
  await page.getByRole('heading', { name: 'Imprint themes', exact: true }).waitFor()
  await page.getByRole('heading', { name: 'Website themes', exact: true }).waitFor()

  await page.getByTestId('validation-theme-cyberpunk').click()
  assert.equal(await page.getByTestId('validation-theme-cyberpunk').getAttribute('aria-pressed'), 'true')
  await page.getByTestId('validation-theme-default').click()
  assert.equal(await page.getByTestId('validation-theme-default').getAttribute('aria-pressed'), 'true')
  await page.locator('a[href="#/"]').click()
})

test('extracts and persists a deterministic local design system', { timeout: 300_000 }, async (t) => {
  try {
    const submittedFixtureUrl = `${fixtureUrl}?access_token=private-value#private-panel`
    assert.equal(await page.getByTestId('analysis-page-count').inputValue(), '3')
    assert.match((await page.getByTestId('analysis-page-scope').textContent()) || '', /choose 1–5.*if fewer exist/i)

    await page.locator('a[href="#/settings"]').click()
    await page.getByTestId('proxy-server').waitFor({ state: 'visible' })

    await page.locator('a[href="#/"]').click()
    await page.getByTestId('analyze-url').fill(submittedFixtureUrl)
    await page.getByTestId('analyze-submit').click()

    await page.getByTestId('analysis-result').waitFor({ state: 'visible', timeout: 90_000 })
    assert.equal(await page.getByTestId('analysis-source').textContent(), '127.0.0.1')
    assert.equal(await page.getByTestId('analysis-page-screenshot').count(), 5)
    assert.equal(await page.getByTestId('analysis-page-screenshot').filter({ hasText: 'Mobile' }).count(), 2)
    await page.getByTestId('design-dna-overview').waitFor({ state: 'visible' })
    assert.match(
      (await page.getByTestId('analysis-evidence-coverage').textContent()) || '',
      /sections.*components.*screen sizes/i,
    )
    await page.getByTestId('analysis-page-screenshot').first().locator('img').click()
    await page.getByTestId('analysis-screenshot-lightbox').waitFor({ state: 'visible' })
    await page.getByTestId('analysis-screenshot-zoom-in').click()
    await page.getByTestId('analysis-screenshot-zoom-in').click()
    const lightboxImage = page.getByTestId('analysis-screenshot-lightbox-image')
    const lightboxImageBox = await lightboxImage.boundingBox()
    assert.ok(lightboxImageBox, 'Expected the screenshot lightbox image to have a bounding box')
    const initialTransform = await lightboxImage.evaluate((element) => element.parentElement?.style.transform || '')
    await page.mouse.move(
      lightboxImageBox.x + lightboxImageBox.width / 2,
      lightboxImageBox.y + lightboxImageBox.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      lightboxImageBox.x + lightboxImageBox.width / 2 + 80,
      lightboxImageBox.y + lightboxImageBox.height / 2 + 50,
      { steps: 5 },
    )
    await page.mouse.up()
    const draggedTransform = await lightboxImage.evaluate((element) => element.parentElement?.style.transform || '')
    assert.notEqual(draggedTransform, initialTransform)
    assert.match(draggedTransform, /translate3d\((?!0px, 0px)/)
    await page.getByTestId('analysis-screenshot-lightbox').getByRole('button', { name: 'Close' }).click()
    await page.getByTestId('analysis-screenshot-lightbox').waitFor({ state: 'detached' })
    await page.getByTestId('agent-export-info').hover()
    await page.getByRole('tooltip').waitFor({ state: 'visible' })
    await page.getByTestId('analysis-page-count').selectOption('1')
    assert.equal(await page.getByTestId('analysis-page-count').inputValue(), '1')

    await page.getByTestId('artifact-tab-overview').click()
    await page.getByTestId('design-dna-overview').waitFor({ state: 'visible' })

    assert.equal(await page.getByTestId('artifact-tab-css').count(), 0)
    await page.getByTestId('artifact-tab-markdown').click()
    const markdown = await page.getByTestId('artifact-content-markdown').textContent()
    assert.match(markdown || '', /Design System/)
    await page.getByRole('button', { name: 'Copy DESIGN.md', exact: true }).click()
    await page.getByText('Copied to clipboard', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Export DESIGN.md', exact: true }).count(), 1)

    const previousManagedScreenshotSrc = await page
      .getByTestId('analysis-page-screenshot')
      .first()
      .locator('img')
      .getAttribute('src')
    await page.getByTestId('analyze-submit').click()
    await page.waitForFunction(
      (previousSrc) => {
        const submit = document.querySelector('[data-testid="analyze-submit"]')
        const screenshot = document.querySelector('[data-testid="analysis-page-screenshot"] img')
        return (
          submit instanceof HTMLButtonElement &&
          !submit.disabled &&
          screenshot instanceof HTMLImageElement &&
          screenshot.src !== previousSrc
        )
      },
      previousManagedScreenshotSrc,
      { timeout: 90_000 },
    )
    await page.getByTestId('artifact-tab-overview').click()
    await page.getByTestId('design-dna-overview').waitFor({ state: 'visible' })
    await page.getByTestId('design-evidence-link').first().click()
    await page.getByTestId('analysis-evidence-highlight').waitFor({ state: 'visible' })
    await page.getByTestId('analysis-screenshot-lightbox').getByRole('button', { name: 'Close' }).click()

    const appThemeBeforeWebsitePreview = await page.locator('html').getAttribute('data-app-theme')
    await page.getByTestId('save-theme').click()
    await page.waitForFunction(
      () => document.querySelector('[data-testid="save-theme"]')?.getAttribute('aria-label') === 'Saved',
    )
    assert.equal(await page.getByTestId('save-theme').isDisabled(), true)
    const archivedTheme = await page.evaluate(async () => {
      const [theme] = await window.electronAPI.getThemeArchive()
      return theme
        ? {
            hasCss: theme.css_variables.includes('--color-'),
            hasDesignDoc: theme.design_doc.includes('# Design System'),
            hasEvidence: Boolean(theme.design_evidence_json),
          }
        : null
    })
    assert.deepEqual(archivedTheme, { hasCss: true, hasDesignDoc: true, hasEvidence: true })
    const repeatedSave = await page.evaluate(async () => {
      const [analysis] = await window.electronAPI.getAnalysisSummaries()
      const firstThemeId = (await window.electronAPI.getThemeArchive())[0]?.id
      const response = await window.electronAPI.saveTheme(analysis.id)
      return {
        sameTheme: response.theme.id === firstThemeId,
        themeCount: (await window.electronAPI.getThemeArchive()).length,
      }
    })
    assert.deepEqual(repeatedSave, { sameTheme: true, themeCount: 1 })
    await page.getByTestId('validate-theme').click()
    await page.getByTestId('extracted-theme-preview-info').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-theme-preview="extracted"]').count(), 1)
    assert.equal(await page.locator('[data-theme-preview="extracted"]').getAttribute('data-theme-color-mode'), 'base')
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    assert.equal(await page.locator('[data-theme-preview="extracted"]').getAttribute('data-theme-color-mode'), 'dark')
    await page.getByRole('button', { name: 'Captured', exact: true }).click()
    assert.equal(await page.locator('html').getAttribute('data-app-theme'), appThemeBeforeWebsitePreview)

    await page.locator('a[href="#/themes"]').click()
    await page.locator('.theme-card-preview-glassmorphism').locator('..').click()
    assert.equal(await page.locator('html').getAttribute('data-app-theme'), 'glassmorphism')
    await page.getByRole('button', { name: /^Website Themes \(1\)$/ }).click()
    await page.getByText(fixtureUrl, { exact: true }).waitFor()

    await page.locator('a[href="#/history"]').click()
    await page.getByText(fixtureUrl, { exact: true }).first().waitFor()
    assert.equal(await page.getByText(fixtureUrl, { exact: true }).count(), 2)
    assert.equal(await page.getByTestId('history-preview-image').count(), 2)
    assert.match(
      (await page.getByTestId('history-created-at').first().textContent()) || '',
      /\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)/i,
    )
    const historyThumbnailSize = await page
      .getByTestId('history-preview-image')
      .first()
      .evaluate(async (image) => {
        await image.decode()
        return { width: image.naturalWidth, height: image.naturalHeight }
      })
    assert.ok(historyThumbnailSize.width <= 192)
    assert.ok(historyThumbnailSize.height <= 128)
    const selectAllStyle = await page.getByTestId('history-select-all').evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        appearance: style.appearance,
        borderTopWidth: style.borderTopWidth,
        borderTopColor: style.borderTopColor,
      }
    })
    assert.equal(selectAllStyle.appearance, 'none')
    assert.equal(selectAllStyle.borderTopWidth, '1px')
    assert.notEqual(selectAllStyle.borderTopColor, 'rgba(0, 0, 0, 0)')
    const analysisListPayloads = await page.evaluate(async () => {
      const summaries = await window.electronAPI.getAnalysisSummaries()
      const firstPage = await window.electronAPI.getAnalysisSummariesPage({ page: 1, pageSize: 1 })
      const secondPage = await window.electronAPI.getAnalysisSummariesPage({ page: 2, pageSize: 1 })
      const fullRecords = await window.electronAPI.getAnalyses()
      return {
        summaryKeys: Object.keys(summaries[0] || {}),
        summarySiteNames: summaries.map((record) => record.site_name),
        summaryHasScreenshot: typeof summaries[0]?.screenshot_path === 'string',
        pageTotals: [firstPage.total, firstPage.matchingIds.length],
        pageSizes: [firstPage.records.length, secondPage.records.length],
        pageNumbers: [firstPage.page, secondPage.page],
        fullRecordHasTokens: Object.hasOwn(fullRecords[0] || {}, 'tokens_json'),
        fullRecordsContainSubmittedSecrets: JSON.stringify(fullRecords).includes('private-value'),
        captureManifestSchema: JSON.parse(fullRecords[0]?.capture_manifest_json || 'null')?.schemaVersion,
        captureRequestSchema: JSON.parse(fullRecords[0]?.capture_manifest_json || 'null')?.request?.schemaVersion,
      }
    })
    assert.equal(analysisListPayloads.summaryKeys.includes('tokens_json'), false)
    assert.equal(analysisListPayloads.summaryKeys.includes('design_doc'), false)
    assert.deepEqual(analysisListPayloads.summarySiteNames, ['Imprint Fixture', 'Imprint Fixture'])
    assert.equal(analysisListPayloads.summaryHasScreenshot, true)
    assert.deepEqual(analysisListPayloads.pageTotals, [2, 2])
    assert.deepEqual(analysisListPayloads.pageSizes, [1, 1])
    assert.deepEqual(analysisListPayloads.pageNumbers, [1, 2])
    assert.equal(analysisListPayloads.fullRecordHasTokens, true)
    assert.equal(analysisListPayloads.fullRecordsContainSubmittedSecrets, false)
    assert.equal(analysisListPayloads.captureManifestSchema, '1')
    assert.equal(analysisListPayloads.captureRequestSchema, '1')
    const siteNameSearch = await page.evaluate(() =>
      window.electronAPI.getAnalysisSummariesPage({ page: 1, pageSize: 10, search: 'Imprint Fixture' }),
    )
    assert.equal(siteNameSearch.total, 2)

    const historyRows = page.getByTestId('history-record')
    assert.equal(await page.getByText('Imprint Fixture', { exact: true }).count(), 2)
    assert.equal(await page.getByTestId('history-compare-reference').count(), 0)
    await page.getByTestId('history-open-comparison-picker').click()
    const comparisonPicker = page.getByTestId('comparison-picker-dialog')
    await comparisonPicker.waitFor({ state: 'visible' })
    assert.match((await comparisonPicker.textContent()) || '', /choose the analyses from before and after a change/i)
    assert.notEqual(
      await page.getByTestId('comparison-picker-earlier').inputValue(),
      await page.getByTestId('comparison-picker-later').inputValue(),
    )
    await page.getByTestId('comparison-picker-submit').click()
    await comparisonPicker.waitFor({ state: 'detached' })
    await page.getByTestId('reference-comparison-dialog').waitFor({ state: 'visible' })
    assert.equal(await page.getByTestId('reference-comparison-status').textContent(), 'Inconclusive')
    assert.match(
      (await page.getByTestId('reference-comparison-dialog').textContent()) || '',
      /page and viewport sets do not match/i,
    )
    await page.getByTestId('reference-comparison-dialog').getByRole('button', { name: 'Close' }).click()
    await page.getByTestId('reference-comparison-dialog').waitFor({ state: 'detached' })

    const firstHistoryRecord = await page.getByTestId('history-record').first().elementHandle()
    await firstHistoryRecord.click()
    await page.getByTestId('analysis-detail-dialog').waitFor({ state: 'visible' })
    const detailThumbnailSize = await page
      .getByTestId('analysis-page-screenshot-image')
      .first()
      .evaluate(async (image) => {
        await image.decode()
        return { width: image.naturalWidth, height: image.naturalHeight }
      })
    assert.ok(detailThumbnailSize.width <= 192)
    assert.ok(detailThumbnailSize.height <= 128)
    const historyArtifactScroller = page.getByTestId('artifact-scroll-container')
    const historyScrollMetrics = await historyArtifactScroller.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }))
    assert.ok(historyScrollMetrics.scrollHeight > historyScrollMetrics.clientHeight)
    await historyArtifactScroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    assert.ok((await historyArtifactScroller.evaluate((element) => element.scrollTop)) > 0)
    await page.getByTestId('analysis-detail-backdrop').click({ position: { x: 4, y: 4 } })
    await page.getByTestId('analysis-detail-dialog').waitFor({ state: 'detached' })
    assert.equal(await firstHistoryRecord.evaluate((element) => element.isConnected), true)
    await firstHistoryRecord.dispose()

    await page.locator('a[href="#/themes"]').click()
    await page.locator('.theme-card-preview-default').locator('..').click()
    assert.equal(await page.locator('html').getAttribute('data-app-theme'), 'default')
    await page.locator('a[href="#/templates"]').click()
    await page.getByTestId('validation-scenario-grid').waitFor({ state: 'visible' })
    assert.equal(await page.locator('button[data-testid^="validation-scenario-"]').count(), 12)
    assert.equal(await page.locator('#validation-scenario').count(), 0)
    await page.getByTestId('validation-scenario-pricing').click()
    assert.equal(await page.getByTestId('validation-scenario-pricing').getAttribute('aria-pressed'), 'true')

    await page.locator('a[href="#/"]').click()
    assert.equal(await page.getByTestId('analysis-page-count').inputValue(), '1')
    const privateUrl = `${fixtureUrl}private`
    await page.getByTestId('analyze-url').fill(privateUrl)
    await page.getByTestId('analyze-submit').click()
    await page.getByTestId('auth-required-dialog').waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByTestId('auth-login').click()
    await page.getByTestId('auth-login-complete').waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByTestId('auth-login-complete').click()
    assert.equal(await page.getByTestId('analyze-submit').isDisabled(), true)
    await page
      .locator(`[data-testid="analysis-result"][data-source-url="${privateUrl}"][data-access-mode="managed"]`)
      .waitFor({ state: 'visible', timeout: 90_000 })
    assert.equal(await page.getByTestId('analysis-page-screenshot').count(), 2)
    await page.getByTestId('anonymous-auth-warning').waitFor({ state: 'detached', timeout: 30_000 })

    const originalSavedTheme = await page.evaluate(async () => {
      const [theme] = await window.electronAPI.getThemeArchive()
      return theme ? { id: theme.id, sourceUrl: theme.source_url } : null
    })
    assert.equal(originalSavedTheme?.sourceUrl, fixtureUrl)
    await page.getByTestId('save-theme').click()
    const replaceThemeDialog = page.getByRole('alertdialog')
    await replaceThemeDialog.waitFor({ state: 'visible' })
    const confirmBackdropCoverage = await page.getByTestId('confirm-dialog-backdrop').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return {
        bounds: {
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
        },
        parentIsBody: element.parentElement === document.body,
        viewport: {
          height: window.innerHeight,
          width: window.innerWidth,
        },
      }
    })
    assert.equal(confirmBackdropCoverage.parentIsBody, true)
    assert.deepEqual(confirmBackdropCoverage.bounds, {
      bottom: confirmBackdropCoverage.viewport.height,
      left: 0,
      right: confirmBackdropCoverage.viewport.width,
      top: 0,
    })
    assert.match((await replaceThemeDialog.textContent()) || '', /theme named.*already exists.*history is retained/is)
    await replaceThemeDialog.getByRole('button', { name: 'Cancel' }).click()
    await replaceThemeDialog.waitFor({ state: 'detached' })
    assert.equal((await page.evaluate(async () => window.electronAPI.getThemeArchive())).length, 1)
    assert.equal(await page.getByTestId('save-theme').getAttribute('aria-label'), 'Save to Theme Library')

    await page.getByTestId('save-theme').click()
    await replaceThemeDialog.waitFor({ state: 'visible' })
    await page.getByTestId('confirm-dialog-confirm').click()
    await page.waitForFunction(
      () => document.querySelector('[data-testid="save-theme"]')?.getAttribute('aria-label') === 'Saved',
    )
    const replacedThemes = await page.evaluate(async () =>
      (await window.electronAPI.getThemeArchive()).map((theme) => ({ id: theme.id, sourceUrl: theme.source_url })),
    )
    assert.deepEqual(replacedThemes, [{ id: originalSavedTheme.id, sourceUrl: privateUrl }])

    await page.getByTestId('browser-sessions-open').click()
    await page.getByTestId('browser-sessions-dialog').waitFor({ state: 'visible' })
    assert.match(
      (await page.getByTestId('browser-sessions-purpose').textContent()) || '',
      /signing in is not required.*public and sign-in pages.*everyday Chrome profile/i,
    )
    assert.equal(await page.getByTestId('browser-session').count(), 1)
    await page.getByRole('button', { name: 'Close website sign-ins' }).click()

    const previousScreenshotSrc = await page
      .getByTestId('analysis-page-screenshot')
      .first()
      .locator('img')
      .getAttribute('src')
    await page.getByTestId('analyze-url').fill(privateUrl)
    await page.getByTestId('analyze-submit').click()
    await page.waitForFunction(
      (previousSrc) => {
        const submit = document.querySelector('[data-testid="analyze-submit"]')
        const screenshot = document.querySelector('[data-testid="analysis-page-screenshot"] img')
        return (
          submit instanceof HTMLButtonElement &&
          !submit.disabled &&
          screenshot instanceof HTMLImageElement &&
          screenshot.src !== previousSrc
        )
      },
      previousScreenshotSrc,
      { timeout: 90_000 },
    )
    assert.equal(await page.getByTestId('analysis-result').getAttribute('data-access-mode'), 'managed')
    assert.equal(await page.getByTestId('auth-required-dialog').count(), 0)

    await page.getByTestId('browser-sessions-open').click()
    await page.getByTestId('browser-session-delete').click()
    await page.getByTestId('browser-session-confirm-delete').click()
    await page.getByTestId('browser-sessions-empty').waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'Close website sign-ins' }).click()

    await page.getByTestId('analyze-url').fill(privateUrl)
    await page.getByTestId('analyze-submit').click()
    await page.getByTestId('auth-required-dialog').waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByTestId('auth-continue-anonymous').click()
    await page.getByTestId('anonymous-auth-warning').waitFor({ state: 'visible', timeout: 90_000 })
    assert.equal(await page.getByTestId('analysis-result').getAttribute('data-access-mode'), 'anonymous')
    assert.equal(await page.getByTestId('analysis-page-screenshot').count(), 2)

    t.diagnostic('Intentionally triggering a connection failure to verify the durable error and retry UI')
    const failureUrl = `${fixtureUrl}failure`
    await page.getByTestId('analyze-url').fill(failureUrl)
    await page.getByTestId('analyze-submit').click()
    await page.getByTestId('analysis-error').waitFor({ state: 'visible', timeout: 30_000 })
    assert.equal(await page.getByTestId('analyze-url').inputValue(), failureUrl)
    await page.getByTestId('analysis-error-retry').waitFor({ state: 'visible' })

    await page.getByTestId('analysis-page-count').selectOption('4')
    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await page.locator('a[href="#/themes"]').click()
    await page.locator('.theme-card-preview-blueprint').locator('..').click()
    assert.equal(await page.locator('html').getAttribute('data-app-theme'), 'blueprint')

    await page.getByRole('button', { name: 'Switch interface language' }).click()
    await page.getByRole('link', { name: '主题库' }).waitFor()
    await page.getByRole('button', { name: '切换界面语言' }).click()
    await page.getByRole('link', { name: 'Themes' }).waitFor()

    await electronApp.close()
    electronApp = await launchApp('zh-CN')
    page = await electronApp.firstWindow({ timeout: 60_000 })
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('link', { name: 'Analyze' }).waitFor()
    assert.equal(await page.evaluate(async () => (await window.electronAPI.getSettings()).language), 'en')
    assert.equal(await page.getByTestId('analysis-page-count').inputValue(), '4')
    assert.equal(await page.locator('html').getAttribute('data-app-theme'), 'blueprint')
    assert.equal(await page.locator('html').evaluate((element) => element.classList.contains('dark')), true)

    await page.locator('a[href="#/templates"]').click()
    assert.equal(await page.getByTestId('validation-scenario-pricing').getAttribute('aria-pressed'), 'true')
  } catch (error) {
    await fs.mkdir(resultDir, { recursive: true })
    await page?.screenshot({ fullPage: false, path: failureScreenshotPath, timeout: 5_000 }).catch(() => {})
    throw error
  }
})

test(
  'loads changed token and observed-evidence comparisons through the Desktop database and IPC path',
  { timeout: 180_000 },
  async () => {
    const comparisonUrl = `${fixtureUrl}comparison`
    comparisonFixtureChanged = false
    const earlierAnalysisId = await page.evaluate(async (url) => {
      const result = await window.electronAPI.analyzeUrl(url, {
        viewports: ['desktop', 'mobile'],
        maxPages: 1,
        authMode: 'anonymous',
      })
      if (!result.analysisId) throw new Error(result.message || 'Earlier analysis failed')
      return result.analysisId
    }, comparisonUrl)

    comparisonFixtureChanged = true
    const laterAnalysisId = await page.evaluate(async (url) => {
      const result = await window.electronAPI.analyzeUrl(url, {
        viewports: ['desktop', 'mobile'],
        maxPages: 1,
        authMode: 'anonymous',
      })
      if (!result.analysisId) throw new Error(result.message || 'Later analysis failed')
      return result.analysisId
    }, comparisonUrl)
    const comparison = await page.evaluate(
      ({ earlierId, laterId }) => window.electronAPI.compareAnalyses(earlierId, laterId),
      { earlierId: earlierAnalysisId, laterId: laterAnalysisId },
    )

    assert.equal(comparison.success, true)
    assert.equal(comparison.comparison.status, 'changed')
    assert.deepEqual(comparison.comparison.comparability.reasons, [])
    assert.ok(comparison.comparison.entityMatching)
    assert.ok(comparison.comparison.entityMatching.summary.sections.matchedPairs > 0)
    assert.equal(
      comparison.comparison.entityMatching.limitations.includes('ambiguous-and-unmatched-are-not-drift'),
      true,
    )
    assert.ok(
      comparison.comparison.categories.some(
        (category) => category.category === 'colors' && category.status === 'changed',
      ),
    )
    for (const categoryName of ['layout', 'interaction-states', 'responsive']) {
      const category = comparison.comparison.categories.find(({ category }) => category === categoryName)
      assert.equal(category?.status, 'changed')
      assert.equal(category?.coverage, 'partial')
      assert.ok(category.changes.length > 0)
    }
    const invalidPairResults = await page.evaluate(
      ({ earlierId, laterId }) =>
        Promise.all([
          window.electronAPI.compareAnalyses(earlierId, earlierId),
          window.electronAPI.compareAnalyses(laterId, earlierId),
        ]),
      { earlierId: earlierAnalysisId, laterId: laterAnalysisId },
    )
    assert.deepEqual(invalidPairResults, [
      { success: false, reason: 'same-analysis' },
      { success: false, reason: 'analysis-order-invalid' },
    ])
    await page.locator('a[href="#/history"]').click()
    await page.getByTestId('history-open-comparison-picker').click()
    await page.getByTestId('comparison-picker-earlier').selectOption(earlierAnalysisId)
    await page.getByTestId('comparison-picker-later').selectOption(laterAnalysisId)
    await page.getByTestId('comparison-picker-submit').click()
    const dialog = page.getByTestId('reference-comparison-dialog')
    await dialog.waitFor({ state: 'visible' })
    assert.equal(await page.getByTestId('reference-comparison-status').textContent(), 'Changed')
    await dialog.getByText('Category comparison scope', { exact: true }).waitFor()
    assert.equal(await dialog.getByTestId('entity-matching-details').count(), 0)
    assert.equal(await dialog.getByText('Limited comparability', { exact: true }).count(), 0)
    const layoutSummaries = dialog.getByTestId('layout-change-summary')
    assert.ok((await layoutSummaries.count()) > 0)
    const layoutSummaryTexts = await layoutSummaries.allTextContents()
    assert.equal(
      layoutSummaryTexts.every((summary) => !/layout\./i.test(summary)),
      true,
    )
    assert.equal(
      layoutSummaryTexts.every((summary) =>
        /identified page sections before|matched .* sections? changed/i.test(summary),
      ),
      true,
    )

    await dialog.getByTestId('open-visual-diff').click()
    const visualDiff = page.getByTestId('visual-diff-dialog')
    await visualDiff.waitFor({ state: 'visible' })
    assert.match(
      (await page.getByTestId('reference-comparison-backdrop').getAttribute('class')) || '',
      /bg-transparent/,
    )
    assert.match((await page.getByTestId('visual-diff-backdrop').getAttribute('class')) || '', /bg-black\/55/)
    await page.waitForFunction(() => {
      const reference = document.querySelector('[data-testid="visual-diff-reference"]')
      const target = document.querySelector('[data-testid="visual-diff-target"]')
      return (
        reference instanceof HTMLImageElement &&
        target instanceof HTMLImageElement &&
        reference.complete &&
        target.complete &&
        reference.naturalWidth > 0 &&
        target.naturalWidth > 0
      )
    })
    assert.equal(await visualDiff.getByText('Earlier analysis', { exact: true }).count(), 0)
    assert.equal(await visualDiff.getByText('Later analysis', { exact: true }).count(), 0)
    assert.equal(await visualDiff.getByTestId('visual-diff-zoom-level').textContent(), '100%')
    await visualDiff.getByRole('button', { name: 'Zoom in' }).click()
    assert.equal(await visualDiff.getByTestId('visual-diff-zoom-level').textContent(), '125%')
    await visualDiff.getByRole('button', { name: 'Close' }).click()
    await visualDiff.waitFor({ state: 'detached' })
    await dialog.waitFor({ state: 'visible' })

    await dialog.getByTestId('comparison-choose-another').click()
    const reopenedPicker = page.getByTestId('comparison-picker-dialog')
    await reopenedPicker.waitFor({ state: 'visible' })
    assert.equal(await reopenedPicker.getByRole('status').count(), 0)
    assert.equal(await page.getByTestId('comparison-picker-earlier').inputValue(), earlierAnalysisId)
    assert.equal(await page.getByTestId('comparison-picker-later').inputValue(), laterAnalysisId)
    await page.getByTestId('comparison-picker-submit').click()
    await dialog.waitFor({ state: 'visible' })

    assert.equal(await dialog.getByText(/Approve later value|Exclude from contract|Design Contract/i).count(), 0)
    const copyReport = dialog.getByTestId('copy-comparison-report')
    await copyReport.hover()
    await copyReport.getByRole('tooltip').waitFor({ state: 'visible' })
    assert.equal(await copyReport.getByRole('tooltip').textContent(), 'Copy report')
    const exportReport = dialog.getByTestId('export-comparison-report')
    await exportReport.hover()
    await exportReport.getByRole('tooltip').waitFor({ state: 'visible' })
    assert.equal(await exportReport.getByRole('tooltip').textContent(), 'Export Markdown')
    await copyReport.click()
    await page.getByText('Copied to clipboard', { exact: true }).waitFor()
    await exportReport.waitFor()
    await dialog.getByRole('button', { name: 'Close' }).click()
  },
)
