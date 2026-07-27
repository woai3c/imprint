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

let fixtureServer
let fixtureUrl
let electronApp
let page
let userDataDir

before(async () => {
  const fixture = await fs.readFile(fixturePath)
  fixtureServer = http.createServer((_request, response) => {
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': fixture.length,
      'content-type': 'text/html; charset=utf-8',
    })
    response.end(fixture)
  })

  await new Promise((resolve, reject) => {
    fixtureServer.once('error', reject)
    fixtureServer.listen(0, '127.0.0.1', resolve)
  })

  const address = fixtureServer.address()
  if (!address || typeof address === 'string') throw new Error('The E2E fixture server did not expose a TCP port')
  fixtureUrl = `http://127.0.0.1:${address.port}/`

  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-e2e-'))
  electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    locale: 'en-US',
    timeout: 60_000,
  })
  page = await electronApp.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded')
})

after(async () => {
  await electronApp?.close()
  await new Promise((resolve) => fixtureServer?.close(resolve))
  if (userDataDir) await fs.rm(userDataDir, { force: true, recursive: true })
})

test('extracts a local design system without LLM credentials and persists it', { timeout: 120_000 }, async () => {
  try {
    await page.getByTestId('analyze-url').fill(fixtureUrl)
    await page.getByTestId('analyze-submit').click()

    await page.getByTestId('analysis-result').waitFor({ state: 'visible', timeout: 90_000 })
    assert.equal(await page.getByTestId('analysis-source').textContent(), '127.0.0.1')

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

    await page.getByTestId('save-theme').click()
    await page.getByTestId('save-theme').getByText('Saved', { exact: true }).waitFor()

    await page.locator('a[href="#/themes"]').click()
    await page.getByRole('button', { name: /^Extracted Themes \(1\)$/ }).click()
    await page.getByText(fixtureUrl, { exact: true }).waitFor()

    await page.locator('a[href="#/history"]').click()
    await page.getByText(fixtureUrl, { exact: true }).waitFor()
  } catch (error) {
    await fs.mkdir(resultDir, { recursive: true })
    await page?.screenshot({ fullPage: true, path: path.join(resultDir, 'core-flow-failure.png') })
    throw error
  }
})
