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
const colorName = prompt.match(/^([^:\\r\\n]+):\\s*#2563eb\\s*$/im)?.[1] || ''
console.log(JSON.stringify({
  renames: colorName ? [{ tokenId: colorName, name: 'e2e-agent-brand' }] : []
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
  if (fakeAgentDir) await fs.rm(fakeAgentDir, { force: true, recursive: true })
  if (userDataDir) await fs.rm(userDataDir, { force: true, recursive: true })
})

test('extracts a local design system without LLM credentials and persists it', { timeout: 120_000 }, async (t) => {
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
    await page.getByTestId('agent-cli-clear').click()
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
    await page.getByTestId('ai-mode-agent-cli').click()
    assert.equal(await page.getByTestId('ai-engine-status-label').textContent(), 'AI enhancement is not enabled')
    await page.getByTestId('ai-mode-api-key').click()
    assert.equal(await page.getByTestId('ai-engine-status-label').textContent(), 'API Key · DeepSeek')
    await page.getByLabel('API Key').fill('')
    await page.waitForFunction(async () => {
      const settings = await window.electronAPI.getSettings()
      return settings.aiMode === 'apiKey' && settings.apiKey === '' && settings.agentCli === ''
    })

    await page.locator('a[href="#/"]').click()
    await page.getByTestId('no-ai-tip').waitFor({ state: 'visible' })
    await page.getByTestId('dismiss-no-ai-tip').click()
    await page.getByTestId('analyze-url').fill(fixtureUrl)
    await page.getByTestId('analyze-submit').click()

    await page.getByTestId('analysis-result').waitFor({ state: 'visible', timeout: 90_000 })
    assert.equal(await page.getByTestId('analysis-source').textContent(), '127.0.0.1')
    assert.equal(await page.getByTestId('analysis-page-screenshot').count(), 3)
    await page.getByTestId('analysis-page-screenshot').first().locator('img').click()
    await page.getByTestId('analysis-screenshot-lightbox').waitFor({ state: 'visible' })
    await page.getByTestId('analysis-screenshot-zoom-in').click()
    await page.getByTestId('analysis-screenshot-zoom-in').click()
    const lightboxImage = page.getByTestId('analysis-screenshot-lightbox-image')
    const lightboxImageBox = await lightboxImage.boundingBox()
    assert.ok(lightboxImageBox, 'Expected the screenshot lightbox image to have a bounding box')
    const initialTransform = await lightboxImage.evaluate((element) => element.style.transform)
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
    const draggedTransform = await lightboxImage.evaluate((element) => element.style.transform)
    assert.notEqual(draggedTransform, initialTransform)
    assert.match(draggedTransform, /translate3d\((?!0px, 0px)/)
    await page.getByTestId('analysis-screenshot-lightbox').getByRole('button', { name: 'Close' }).click()
    await page.getByTestId('analysis-screenshot-lightbox').waitFor({ state: 'detached' })
    await page.getByTestId('ai-export-info').hover()
    await page.getByRole('tooltip').waitFor({ state: 'visible' })
    await page.getByTestId('analysis-page-count').selectOption('1')
    assert.equal(await page.getByTestId('analysis-page-count').inputValue(), '1')

    await page.getByTestId('artifact-tab-json').click()
    const tokenText = await page.getByTestId('artifact-content-json').textContent()
    assert.ok(tokenText, 'Expected the Tokens JSON tab to contain generated output')

    const tokens = JSON.parse(tokenText)
    assert.ok(Object.values(tokens.colors).includes('#2563eb'), 'Expected the fixture brand color')
    assert.ok(tokens.spacing.includes('24px'), 'Expected the fixture spacing token')
    assert.ok(tokens.radii.includes('14px'), 'Expected the fixture radius token')

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
    await page.getByTestId('artifact-tab-json').click()
    const agentTokens = JSON.parse((await page.getByTestId('artifact-content-json').textContent()) || '{}')
    assert.equal(agentTokens.colors['e2e-agent-brand'], '#2563eb')
    await page.evaluate(async () => {
      await window.electronAPI.saveSettings({ aiMode: 'apiKey', agentCli: '' })
    })

    await page.getByTestId('save-theme').click()
    await page.waitForFunction(
      () => document.querySelector('[data-testid="save-theme"]')?.getAttribute('aria-label') === 'Saved',
    )
    assert.equal(await page.getByTestId('save-theme').isDisabled(), true)

    await page.locator('a[href="#/themes"]').click()
    await page.getByRole('button', { name: /^Extracted Themes \(1\)$/ }).click()
    await page.getByText(fixtureUrl, { exact: true }).waitFor()

    await page.locator('a[href="#/history"]').click()
    await page.getByText(fixtureUrl, { exact: true }).first().waitFor()
    assert.equal(await page.getByText(fixtureUrl, { exact: true }).count(), 2)

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
    assert.equal(await page.getByTestId('analysis-page-screenshot').count(), 1)
    await page.getByTestId('anonymous-auth-warning').waitFor({ state: 'detached', timeout: 30_000 })

    await page.getByTestId('browser-sessions-open').click()
    await page.getByTestId('browser-sessions-dialog').waitFor({ state: 'visible' })
    assert.match(
      (await page.getByTestId('browser-sessions-purpose').textContent()) || '',
      /signing in is not required.*public and sign-in pages.*everyday Chrome profile/i,
    )
    assert.equal(await page.getByTestId('browser-session').count(), 1)
    await page.getByRole('button', { name: 'Close website sign-ins' }).click()

    const previousScreenshotSrc = await page.getByTestId('analysis-page-screenshot').locator('img').getAttribute('src')
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
    assert.equal(await page.getByTestId('analysis-page-screenshot').count(), 1)

    t.diagnostic('Intentionally triggering a connection failure to verify the durable error and retry UI')
    const failureUrl = `${fixtureUrl}failure`
    await page.getByTestId('analyze-url').fill(failureUrl)
    await page.getByTestId('analyze-submit').click()
    await page.getByTestId('analysis-error').waitFor({ state: 'visible', timeout: 30_000 })
    assert.equal(await page.getByTestId('analyze-url').inputValue(), failureUrl)
    await page.getByTestId('analysis-result').waitFor({ state: 'visible' })
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
    assert.equal(await page.evaluate(() => localStorage.getItem('imprint.language')), 'en')
    assert.equal(await page.getByTestId('analysis-page-count').inputValue(), '4')
    assert.equal(await page.locator('html').getAttribute('data-app-theme'), 'blueprint')
    assert.equal(await page.locator('html').evaluate((element) => element.classList.contains('dark')), true)
    assert.equal(await page.getByTestId('no-ai-tip').count(), 0)

    await page.locator('a[href="#/templates"]').click()
    assert.equal(await page.getByTestId('validation-scenario-pricing').getAttribute('aria-pressed'), 'true')
  } catch (error) {
    await fs.mkdir(resultDir, { recursive: true })
    await page?.screenshot({ fullPage: true, path: failureScreenshotPath })
    throw error
  }
})
