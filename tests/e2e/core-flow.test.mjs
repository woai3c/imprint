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
let fakeAgentDir
let page
let userDataDir

function launchApp(locale = 'en-US') {
  return electron.launch({
    args: ['.'],
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      IMPRINT_E2E: '1',
      IMPRINT_E2E_USER_DATA_DIR: userDataDir,
      PATH: `${fakeAgentDir}${path.delimiter}${process.env.PATH || ''}`,
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
  fakeAgentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-e2e-agent-'))
  const fakeAgentSource = `if (process.argv.includes('--version')) {
  console.log('codex 0.0.0-e2e')
  process.exit(0)
}
let prompt = ''
for await (const chunk of process.stdin) prompt += chunk
const writeJsonAndExit = async (value) => {
  await new Promise((resolve) => process.stdout.write(JSON.stringify(value) + '\\n', resolve))
  process.exit(0)
}
try {
  const { appendFileSync } = await import('node:fs')
  appendFileSync(
    process.env.FAKE_AGENT_LOG || 'fake-agent-invocations.log',
    JSON.stringify({ argv: process.argv.slice(2), promptHead: prompt.slice(0, 120), promptLength: prompt.length }) + '\\n',
  )
} catch {}
if (prompt.includes('section observer')) {
  const sectionIds = [...new Set([...prompt.matchAll(/"id":"(section-[^"]+)"/g)].map((match) => match[1]))]
  await writeJsonAndExit({
    observations: sectionIds.map((sectionId) => ({
      sectionId,
      structure: 'A stacked band pairs a dominant heading with a compact action cluster.',
      visualRelations: 'Heading scale outweighs body text while the action sits inside the same column.',
      states: '',
      limitations: '',
      evidenceIds: [sectionId]
    }))
  })
}
if (prompt.includes('design-language interpreter')) {
  const unique = (values) => [...new Set(values)]
  const ids = unique([...prompt.matchAll(/"id":"((?:section|layout|image|component|interaction|responsive)-[^"]+)"/g)].map((match) => match[1]))
  const inputMode = prompt.includes('The input mode is multimodal') ? 'multimodal' : 'structural-only'
  const attachedImageIds = unique(
    [...prompt.matchAll(/- \\.\\/([\\w.-]+\\.(?:png|jpe?g|webp))/g)].map((match) => match[1].replace(/\\.[^.]+$/, '')),
  )
  const sectionIds = ids.filter((id) => id.startsWith('section-'))
  const refs = (sectionIds.length >= 2 ? sectionIds.slice(0, 2) : ids.slice(0, 2)).map((evidenceId) => ({
    evidenceId,
    note: 'Observed fixture evidence'
  }))
  const claim = (statement = 'Centered content bands use deliberate spacing to establish a repeatable reading rhythm') => ({
    statement,
    implementation: 'Use centered content bands and keep the observed spacing rhythm across primary sections.',
    confidence: refs.length >= 2 ? 'high' : 'medium',
    evidence: refs
  })
  const responsiveId = ids.find((id) => id.startsWith('responsive-'))
  const interactionId = ids.find((id) => id.startsWith('interaction-'))
  const interactionClaim = {
    ...claim('Small state changes provide restrained feedback without disrupting layout'),
    confidence: 'medium',
    evidence: interactionId ? [{ evidenceId: interactionId, note: 'Observed target state difference' }] : refs
  }
  const continuity = {
    ...claim('Desktop groups reflow into a narrow single-column sequence while preserving hierarchy'),
    confidence: 'medium',
    evidence: responsiveId ? [{ evidenceId: responsiveId, note: 'Observed responsive reflow' }] : refs
  }
  await writeJsonAndExit({
    schemaVersion: '1',
    language: 'en',
    inputMode,
    imageObservations: attachedImageIds.map((imageId) => ({
      imageId,
      description: 'Screenshot of the fixture page showing its hero band and card sections.'
    })),
    thesis: claim(),
    signatureMoves: [{
      ...claim('A saturated action accent punctuates otherwise quiet neutral content surfaces'),
      id: 'move-accent-punctuation',
      name: 'Accent punctuation',
      distinctiveness: 'A focused action color is paired with broad neutral fields.'
    }],
    composition: {
      containerStrategy: claim(),
      alignmentStrategy: claim(),
      densityAndWhitespace: claim(),
      rhythm: claim()
    },
    attention: {
      entryPoint: claim(),
      visualSequence: [claim()],
      actionHierarchy: claim(),
      contrastStrategy: claim()
    },
    visualLanguage: {
      color: claim(),
      typography: claim(),
      shape: claim(),
      surfaces: claim()
    },
    sectionGrammar: [{
      role: 'hero',
      composition: [claim()],
      contentRhythm: [claim()],
      transitionToNext: [claim()]
    }],
    interactionLanguage: {
      primaryDrivers: [interactionClaim],
      feedbackStyle: interactionClaim,
      stateChangeAmplitude: interactionClaim,
      continuityRules: [continuity]
    },
    componentGrammar: [{ component: 'button', role: 'primary action', rules: [claim()] }],
    patterns: [{
      id: 'pattern-action-cluster',
      name: 'Action cluster',
      role: 'Keep related calls to action together',
      structureRules: [claim()],
      visualRules: [claim()],
      interactionRules: [interactionClaim],
      responsiveRules: [continuity],
      tokenRefs: [],
      evidenceRefs: refs.map((reference) => reference.evidenceId),
      sourceInstances: 2,
      confidence: 'medium'
    }],
    transferRules: {
      preserve: [claim()],
      adapt: [claim()],
      avoid: [claim()]
    },
    uncertainties: []
  })
}
const colorName = prompt.match(/^([^:\\r\\n]+):\\s*#2563eb\\s*$/im)?.[1] || ''
console.log(JSON.stringify({
  renames: colorName
    ? [
        { tokenId: colorName, name: 'e2e-agent-brand' },
        { tokenId: 'missing-token', name: 'should-be-rejected' },
        { tokenId: 'background', name: 'Invalid Name' }
      ]
    : [],
  examples: colorName
    ? [
        {
          title: 'Neutral card',
          html: '<article style="background: var(--color-' + colorName + '); color: var(--color-background); padding: var(--spacing-3)"><h3>Card</h3></article>'
        }
      ]
    : []
}))
`
  await fs.writeFile(path.join(fakeAgentDir, 'fake-agent.mjs'), fakeAgentSource, 'utf-8')
  if (process.platform === 'win32') {
    await fs.writeFile(path.join(fakeAgentDir, 'codex.cmd'), '@echo off\r\nnode "%~dp0fake-agent.mjs" %*\r\n', 'utf-8')
  } else {
    const fakeAgentPath = path.join(fakeAgentDir, 'codex')
    await fs.writeFile(fakeAgentPath, '#!/bin/sh\nexec node "$(dirname "$0")/fake-agent.mjs" "$@"\n', 'utf-8')
    await fs.chmod(fakeAgentPath, 0o755)
  }

  const fixture = await fs.readFile(fixturePath)
  fixtureServer = http.createServer((request, response) => {
    if (request.url?.startsWith('/failure')) {
      request.socket.destroy()
      return
    }

    const requiresAuthentication = request.url?.startsWith('/private')
    const authenticated = request.headers.cookie?.split(/;\s*/).includes('imprint_e2e_auth=1') ?? false
    const authenticationRequired = requiresAuthentication && !authenticated
    const body = authenticationRequired ? authFixture : fixture
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
  if (fakeAgentDir) await fs.rm(fakeAgentDir, { force: true, recursive: true })
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

test('extracts a local design system without LLM credentials and persists it', { timeout: 300_000 }, async (t) => {
  try {
    assert.equal(await page.getByTestId('analysis-page-count').inputValue(), '3')
    assert.match((await page.getByTestId('analysis-page-scope').textContent()) || '', /choose 1–5.*if fewer exist/i)

    await page.locator('a[href="#/settings"]').click()
    await page.getByTestId('ai-engine-status').waitFor({ state: 'visible' })
    assert.equal(await page.getByTestId('ai-engine-status-label').textContent(), 'AI enhancement is not enabled')

    await page.getByTestId('ai-mode-agent-cli').click()
    await page.locator('[data-testid^="agent-cli-option-"]').first().waitFor({ state: 'visible', timeout: 30_000 })
    assert.equal(await page.locator('[data-testid^="agent-cli-option-"][aria-pressed="true"]').count(), 0)
    assert.equal(
      await page.evaluate(async () => (await window.electronAPI.getSettings()).agentCli),
      '',
      'CLI detection must not select a candidate',
    )

    await page.evaluate(async () => {
      await window.electronAPI.saveSettings({ agentCli: 'codex' })
    })
    await page.locator('a[href="#/"]').click()
    await page.locator('a[href="#/settings"]').click()
    assert.equal(await page.getByTestId('ai-engine-status-label').textContent(), 'Local CLI · Codex')
    await page.evaluate(async () => {
      await window.electronAPI.saveSettings({ agentCli: '' })
    })
    await page.locator('a[href="#/"]').click()
    await page.locator('a[href="#/settings"]').click()
    assert.equal(await page.getByTestId('ai-engine-status-label').textContent(), 'AI enhancement is not enabled')
    assert.equal(
      await page.evaluate(async () => (await window.electronAPI.getSettings()).agentCli),
      '',
      'The selected CLI must be clearable',
    )

    await page.getByTestId('ai-mode-api-key').click()
    await page.getByLabel('LLM Provider').selectOption('deepseek')
    await page.getByLabel('API Key').fill('e2e-placeholder-key')
    assert.equal(await page.getByTestId('ai-engine-status-label').textContent(), 'API Key · DeepSeek')
    await page.getByLabel('LLM Provider').selectOption('openai')
    assert.equal(await page.getByLabel('API Key').inputValue(), '')
    assert.equal(await page.getByTestId('ai-engine-status-label').textContent(), 'AI enhancement is not enabled')
    await page.getByLabel('API Key').fill('e2e-openai-key')
    await page.getByLabel('LLM Provider').selectOption('deepseek')
    assert.equal(await page.getByLabel('API Key').inputValue(), 'e2e-placeholder-key')
    await page.getByTestId('ai-mode-agent-cli').click()
    assert.equal(await page.getByTestId('ai-engine-status-label').textContent(), 'AI enhancement is not enabled')
    await page.getByTestId('ai-mode-api-key').click()
    assert.equal(await page.getByTestId('ai-engine-status-label').textContent(), 'API Key · DeepSeek')
    await page.getByLabel('API Key').fill('')
    await page.waitForFunction(async () => {
      const settings = await window.electronAPI.getSettings()
      return settings.aiMode === 'apiKey' && !settings.apiKeys.deepseek && settings.apiKeys.openai && !settings.agentCli
    })

    await page.locator('a[href="#/"]').click()
    await page.getByTestId('no-ai-tip').waitFor({ state: 'visible' })
    await page.getByTestId('dismiss-no-ai-tip').click()
    await page.getByTestId('analyze-url').fill(fixtureUrl)
    await page.getByTestId('analyze-submit').click()

    await page.getByTestId('analysis-result').waitFor({ state: 'visible', timeout: 90_000 })
    assert.equal(await page.getByTestId('analysis-source').textContent(), '127.0.0.1')
    assert.equal(await page.getByTestId('analysis-page-screenshot').count(), 5)
    assert.equal(await page.getByTestId('analysis-page-screenshot').filter({ hasText: 'Mobile' }).count(), 2)
    await page.getByTestId('design-evidence-overview').waitFor({ state: 'visible' })
    assert.match(
      (await page.getByTestId('analysis-evidence-coverage').textContent()) || '',
      /sections.*components.*screen sizes/i,
    )
    assert.equal(await page.getByTestId('example-components').count(), 0)
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
    await page.getByTestId('ai-export-info').hover()
    await page.getByRole('tooltip').waitFor({ state: 'visible' })
    await page.getByTestId('analysis-page-count').selectOption('1')
    assert.equal(await page.getByTestId('analysis-page-count').inputValue(), '1')

    await page.getByTestId('artifact-tab-overview').click()
    await page.getByTestId('design-evidence-overview').waitFor({ state: 'visible' })

    await page.getByTestId('artifact-tab-css').click()
    const css = await page.getByTestId('artifact-content-css').textContent()
    assert.match(css || '', /:root\s*\{/)
    assert.match(css || '', /--color-/)

    await page.evaluate(async () => {
      await window.electronAPI.saveSettings({ aiMode: 'agentCli', agentCli: 'codex' })
    })
    const previousAgentScreenshotSrc = await page
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
      previousAgentScreenshotSrc,
      { timeout: 90_000 },
    )
    await page.getByTestId('artifact-tab-overview').click()
    await page
      .locator(
        '[data-testid="design-intelligence-status-complete"], [data-testid="design-intelligence-status-partial"]',
      )
      .waitFor({ state: 'visible' })
    await page.getByTestId('artifact-tab-preview').click()
    assert.equal(await page.getByTestId('example-generation').count(), 0)
    assert.equal(await page.getByTestId('example-components').count(), 0)
    await page.getByTestId('artifact-tab-overview').click()
    await page.getByTestId('design-evidence-link').first().click()
    await page.getByTestId('analysis-evidence-highlight').waitFor({ state: 'visible' })
    await page.getByTestId('analysis-screenshot-lightbox').getByRole('button', { name: 'Close' }).click()
    await page.evaluate(async () => {
      await window.electronAPI.saveSettings({ aiMode: 'apiKey', agentCli: '' })
    })

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
        summaryHasScreenshot: typeof summaries[0]?.screenshot_path === 'string',
        pageTotals: [firstPage.total, firstPage.matchingIds.length],
        pageSizes: [firstPage.records.length, secondPage.records.length],
        pageNumbers: [firstPage.page, secondPage.page],
        fullRecordHasTokens: Object.hasOwn(fullRecords[0] || {}, 'tokens_json'),
      }
    })
    assert.equal(analysisListPayloads.summaryKeys.includes('tokens_json'), false)
    assert.equal(analysisListPayloads.summaryKeys.includes('design_doc'), false)
    assert.equal(analysisListPayloads.summaryHasScreenshot, true)
    assert.deepEqual(analysisListPayloads.pageTotals, [2, 2])
    assert.deepEqual(analysisListPayloads.pageSizes, [1, 1])
    assert.deepEqual(analysisListPayloads.pageNumbers, [1, 2])
    assert.equal(analysisListPayloads.fullRecordHasTokens, true)
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
