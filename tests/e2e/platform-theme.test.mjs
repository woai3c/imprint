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

      const detailProbe = document.createElement('div')
      detailProbe.dataset.testid = 'analysis-detail-backdrop'
      detailProbe.innerHTML = `
        <div data-testid="analysis-detail-dialog" class="bg-background">
          <div class="analysis-artifact-content bg-card">
            <article class="design-claim-card bg-background"></article>
          </div>
        </div>
      `
      document.body.append(detailProbe)

      const rootStyle = getComputedStyle(document.documentElement)
      const probeStyle = getComputedStyle(probe)
      const detailDialogStyle = getComputedStyle(detailProbe.firstElementChild)
      const artifactContentStyle = getComputedStyle(detailProbe.querySelector('.analysis-artifact-content'))
      const claimCardStyle = getComputedStyle(detailProbe.querySelector('.design-claim-card'))
      const previewElement = document.querySelector('.theme-card-preview-glassmorphism')
      if (!(previewElement instanceof HTMLElement)) throw new Error('Aurora theme preview was not found')
      const previewStyle = getComputedStyle(previewElement)
      const previewLayerStyle = getComputedStyle(previewElement, '::after')
      const backdropStyle = getComputedStyle(document.querySelector('.app-shell'), '::before')
      const result = {
        platform: document.documentElement.dataset.platform,
        bodyFont: getComputedStyle(document.body).fontFamily,
        shellFont: getComputedStyle(document.querySelector('.app-shell')).fontFamily,
        sidebarFilter: getComputedStyle(document.querySelector('.app-sidebar')).backdropFilter,
        topbarFilter: getComputedStyle(document.querySelector('.app-topbar')).backdropFilter,
        artCardBorder: rootStyle.getPropertyValue('--art-card-border').trim(),
        artPrimaryShadow: rootStyle.getPropertyValue('--art-primary-shadow').trim(),
        cardBackground: probeStyle.backgroundColor,
        cardBackgroundImage: probeStyle.backgroundImage,
        cardBorder: probeStyle.borderTopColor,
        cardFilter: probeStyle.backdropFilter,
        backdropAnimation: backdropStyle.animationName,
        backdropTop: backdropStyle.top,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        detailDialogFilter: detailDialogStyle.backdropFilter,
        detailContentBackgroundImage: artifactContentStyle.backgroundImage,
        detailClaimFilter: claimCardStyle.backdropFilter,
        previewBackgroundImage: previewStyle.backgroundImage,
        previewLayerFilter: previewLayerStyle.backdropFilter,
        previewLayerShadow: previewLayerStyle.boxShadow,
      }
      probe.remove()
      detailProbe.remove()
      return result
    })

    if (process.platform === 'win32') {
      assert.equal(styles.platform, 'windows')
      assert.match(styles.bodyFont, /Segoe UI/)
      assert.equal(styles.sidebarFilter, 'none')
      assert.equal(styles.topbarFilter, 'none')
      assert.match(styles.artCardBorder, /82 92 112/)
      assert.doesNotMatch(styles.artCardBorder, /primary/)
      assert.equal(styles.artPrimaryShadow, 'none')
      assert.equal(styles.cardBackgroundImage, 'none')
      assert.doesNotMatch(styles.previewBackgroundImage, /255, 105, 184|118, 91, 255/)
      assert.equal(styles.previewLayerFilter, 'none')
      assert.equal(styles.previewLayerShadow, 'none')
    } else if (process.platform === 'darwin') {
      assert.equal(styles.platform, 'macos')
      assert.match(styles.shellFont, /apple-system|BlinkMacSystemFont/)
      assert.match(styles.sidebarFilter, /blur\(28px\)/)
      assert.match(styles.topbarFilter, /blur\(24px\)/)
      assert.match(styles.artCardBorder, /255 255 255/)
      assert.equal(styles.cardBackgroundImage, 'none')
      assert.match(styles.cardFilter, /blur\(18px\)/)
      assert.equal(styles.backdropAnimation, styles.reducedMotion ? 'none' : 'macos-aurora-drift')
      assert.notEqual(styles.backdropTop, '0px')
      assert.match(styles.detailDialogFilter, /blur\(32px\)/)
      assert.equal(styles.detailContentBackgroundImage, 'none')
      assert.equal(styles.detailClaimFilter, 'none')
      assert.match(styles.previewBackgroundImage, /255, 105, 184|118, 91, 255/)
      assert.match(styles.previewLayerFilter, /blur\(8px\)/)
    }

    assert.notEqual(styles.cardBackground, 'rgba(0, 0, 0, 0)')
    assert.notEqual(styles.cardBorder, 'rgba(0, 0, 0, 0)')

    await fs.mkdir(resultDir, { recursive: true })
    await preview.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(resultDir, `aurora-option-${styles.platform}.png`) })

    await page.evaluate(() => {
      window.location.hash = '/templates'
    })
    await page.getByTestId('theme-calibration-strip').waitFor()

    await page.screenshot({ path: path.join(resultDir, `aurora-${styles.platform}.png`) })
  } finally {
    await electronApp.close()
    await fs.rm(userDataDir, { force: true, recursive: true })
  }
})
