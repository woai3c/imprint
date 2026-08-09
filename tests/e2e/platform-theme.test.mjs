import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const resultDir = path.join(repoRoot, 'test-results')

test('translates Aurora Glass materials for the host desktop platform', async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-platform-theme-'))
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      IMPRINT_E2E: '1',
      IMPRINT_E2E_USER_DATA_DIR: userDataDir,
    },
    locale: 'en-US',
    timeout: 60_000,
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForSelector('.app-shell')
    await page.evaluate(() => {
      window.location.hash = '/themes'
    })
    const preview = page.locator('.theme-card-preview-glassmorphism')
    await preview.waitFor()
    await preview.evaluate((element) => {
      const applyButton = element.closest('button')
      if (!(applyButton instanceof HTMLButtonElement)) throw new Error('Aurora theme apply button was not found')
      applyButton.click()
    })
    await page.waitForFunction(() => document.documentElement.dataset.appTheme === 'glassmorphism')

    const styles = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.className = 'bg-card border'
      probe.style.position = 'fixed'
      probe.style.inset = '48px'
      probe.style.pointerEvents = 'none'
      document.body.append(probe)

      const rootStyle = getComputedStyle(document.documentElement)
      const probeStyle = getComputedStyle(probe)
      const result = {
        platform: document.documentElement.dataset.platform,
        bodyFont: getComputedStyle(document.body).fontFamily,
        sidebarFilter: getComputedStyle(document.querySelector('.app-sidebar')).backdropFilter,
        topbarFilter: getComputedStyle(document.querySelector('.app-topbar')).backdropFilter,
        artCardBorder: rootStyle.getPropertyValue('--art-card-border').trim(),
        cardBackground: probeStyle.backgroundColor,
        cardBorder: probeStyle.borderTopColor,
      }
      probe.remove()
      return result
    })

    if (process.platform === 'win32') {
      assert.equal(styles.platform, 'windows')
      assert.match(styles.bodyFont, /Segoe UI/)
      assert.equal(styles.sidebarFilter, 'none')
      assert.equal(styles.topbarFilter, 'none')
      assert.match(styles.artCardBorder, /76%.*24%/)
    } else if (process.platform === 'darwin') {
      assert.equal(styles.platform, 'macos')
      assert.match(styles.bodyFont, /apple-system|BlinkMacSystemFont/)
      assert.match(styles.sidebarFilter, /blur\(30px\)/)
      assert.match(styles.topbarFilter, /blur\(26px\)/)
      assert.match(styles.artCardBorder, /255 255 255/)
    }

    assert.notEqual(styles.cardBackground, 'rgba(0, 0, 0, 0)')
    assert.notEqual(styles.cardBorder, 'rgba(0, 0, 0, 0)')

    await fs.mkdir(resultDir, { recursive: true })
    await page.screenshot({ path: path.join(resultDir, `aurora-${styles.platform}.png`) })
  } finally {
    await electronApp.close()
    await fs.rm(userDataDir, { force: true, recursive: true })
  }
})
