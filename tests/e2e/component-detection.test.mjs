import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

import { findBrowser } from '../../dist/core/analyzer/browser-finder.js'
import { clusterColors } from '../../dist/core/analyzer/color-cluster.js'
import { detectComponents, summarizeComponentVariants } from '../../dist/core/analyzer/component-detect.js'
import { extractStyles } from '../../dist/core/analyzer/style-extractor.js'
import { buildDesignTokens } from '../../dist/core/analyzer/token-builder.js'
import { isActionableComponentPattern } from '../../dist/core/design-context/component-catalog.js'
import { observeSafeInteractions } from '../../dist/core/design-evidence/interaction-observer.js'
import { extractPageEvidence } from '../../dist/core/design-evidence/page-extractor.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const fixturePath = path.join(repoRoot, 'tests', 'e2e', 'fixtures', 'design-system.html')

let browser
let fixtureServer
let fixtureUrl
let unsafeWriteRequests = 0

before(async () => {
  const fixture = await fs.readFile(fixturePath)
  fixtureServer = http.createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/unsafe-write') unsafeWriteRequests += 1
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
  if (!address || typeof address === 'string') throw new Error('Fixture server did not expose a TCP port')
  fixtureUrl = `http://127.0.0.1:${address.port}/`

  const executablePath = findBrowser()
  assert.ok(executablePath, 'Chrome or Edge is required for the component detection E2E test')
  browser = await chromium.launch({ executablePath, headless: true })
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => fixtureServer?.close(resolve))
})

test('detects visible semantic components and a visually bounded card', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    const hiddenModal = document.createElement('div')
    hiddenModal.className = 'modal'
    hiddenModal.setAttribute('role', 'dialog')
    hiddenModal.style.cssText = 'display:none;position:fixed;z-index:50'
    document.body.append(hiddenModal)

    const decorativeButtonClass = document.createElement('div')
    decorativeButtonClass.className = 'button'
    decorativeButtonClass.textContent = 'Not interactive'
    document.body.append(decorativeButtonClass)
  })

  const components = await detectComponents(page)
  const byType = new Map(components.map((component) => [component.type, component]))

  assert.equal(byType.get('button')?.count, 4)
  assert.ok((byType.get('button')?.confidence || 0) >= 0.95)
  assert.deepEqual(byType.get('button')?.evidence, ['native-element'])

  assert.equal(byType.get('navigation')?.count, 1)
  assert.ok((byType.get('navigation')?.confidence || 0) >= 0.95)

  assert.equal(byType.get('card')?.count, 1)
  assert.ok((byType.get('card')?.confidence || 0) >= 0.75)
  assert.ok(byType.get('card')?.evidence.includes('border-boundary'))

  assert.equal(byType.has('modal'), false, 'Hidden dialogs must not be reported')

  const evidence = await extractPageEvidence(page, 'desktop')
  assert.equal(evidence.interactionCandidates.length, 2)
  assert.equal(evidence.interactionCandidates[0].kind, 'disclosure')
  for (const candidate of evidence.interactionCandidates) {
    assert.equal(
      await page.locator(candidate.locator).evaluate((element) => Boolean(element.closest('form'))),
      false,
      'Form controls must never enter the safe active-interaction allowlist',
    )
  }
  const observations = await observeSafeInteractions(page, evidence, 10)
  assert.equal(observations.length, 1, 'Only the restorable local disclosure should produce active evidence')
  assert.equal(observations[0].after.ariaExpanded, 'true')
  assert.equal(observations[0].after.controlledHidden, 'false')
  assert.equal(unsafeWriteRequests, 0, 'Non-GET side effects must be blocked before reaching the fixture server')
  await page.close()
})

test('keeps exact component font metrics, heights, and unequal borders out of the same reusable style', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      main { padding:32px; }
      button { box-sizing:border-box; height:44px; min-height:36px; padding:8px 16px; background:#2255ff; color:white; border:1px solid #173ea8; border-radius:8px; }
      .compact { line-height:20px; letter-spacing:0.2px; }
      .airy { line-height:24px; letter-spacing:0.6px; }
      .asymmetric { border-right-width:3px; }
    </style>
    <main>
      <h1>Controls</h1>
      <button class="compact">One</button><button class="compact">Two</button>
      <button class="airy">Three</button><button class="airy">Four</button>
      <button class="asymmetric">Five</button>
    </main>`)

  const snapshot = await extractPageEvidence(page, 'desktop')
  const buttons = snapshot.components.filter((component) => component.type === 'button')
  const asymmetric = buttons.find((button) => button.styles.borderRight)
  const patterns = summarizeComponentVariants(
    buttons
      .filter((button) => !button.styles.borderRight)
      .map((button) => ({
        ...button,
        type: 'button',
        evidence: [button.key],
        widthPx: button.rect.width * snapshot.contentWidth,
        heightPx: button.rect.height * snapshot.height,
        pageId: 'fixture-page',
      })),
  )

  assert.equal(buttons[0].styles.height, '44px')
  assert.equal(buttons[0].styles.minHeight, '36px')
  assert.equal(buttons[0].styles.lineHeight, '20px')
  assert.equal(buttons[0].styles.letterSpacing, '0.2px')
  assert.equal(patterns.length, 2, 'font metric differences must not be merged into one reusable recipe')
  assert.deepEqual(patterns.map((pattern) => pattern.count).sort(), [2, 2])
  assert.ok(asymmetric)
  assert.equal(asymmetric.styles.border, undefined)
  assert.match(asymmetric.styles.borderRight, /^3px /)
  assert.match(asymmetric.styles.borderLeft, /^1px /)
  await page.close()
})

test('attributes component boundary, text, and content-sized geometry to their rendered owners', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; font-family:Times; color:rgb(17, 17, 17); }
      main { min-height:900px; padding:32px; }
      .label { font-family:Inter, sans-serif; font-size:18px; font-weight:600; line-height:24px; color:rgb(20, 70, 140); }
      button { height:44px; padding:8px 16px; border:1px solid rgb(20, 70, 140); background:white; }
      .icon { width:44px; padding:8px; color:rgb(180, 30, 40); }
      .clipped-label-control { width:44px; background:rgb(232, 240, 248); }
      .dot-tab { display:block; width:8px; height:8px; min-height:0; padding:0; border:0; border-radius:50%; background:rgb(45, 55, 65); }
      .visually-hidden { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0, 0, 0, 0); clip-path:inset(50%); white-space:nowrap; }
      input { height:40px; font-family:Inter, sans-serif; color:rgb(30, 40, 50); }
      #empty-checkbox { width:20px; height:20px; }
      nav { height:64px; padding:8px 16px; background:rgb(248, 249, 250); }
      nav a, li span, .card-copy { font-family:Inter, sans-serif; color:rgb(20, 70, 140); }
      ul { display:grid; gap:8px; height:120px; }
      .card { height:140px; padding:16px; border:1px solid #ccd2d8; border-radius:12px; }
      .live-region { height:400px; }
      .bounded-status { height:40px; padding:8px 12px; background:rgb(181, 71, 8); color:white; }
      .transparent-input-shell { position:relative; width:360px; height:40px; margin-top:12px; border-radius:20px; background:rgb(238, 242, 247); }
      .transparent-input-shell input { position:absolute; left:16px; top:8px; width:280px; height:24px; color:rgba(0, 0, 0, 0); background:transparent; }
      .visible-input-label { position:absolute; left:16px; top:8px; font-family:Arial, sans-serif; font-size:15px; line-height:24px; color:rgb(46, 62, 86); pointer-events:none; }
      .clipped-native-shell { position:relative; width:140px; height:40px; margin-top:12px; border-radius:8px; background:rgb(225, 235, 245); }
      .clipped-native-shell input { position:absolute; left:10px; top:8px; width:120px; height:24px; clip-path:inset(50%); font-family:Georgia, serif; font-size:29px; font-weight:700; color:rgb(238, 17, 17); }
      .clipped-native-label { position:absolute; left:12px; top:8px; font-family:Inter, sans-serif; font-size:16px; line-height:24px; color:rgb(17, 34, 51); pointer-events:none; }
      .direct-live-region { box-sizing:border-box; width:100%; height:400px; padding:16px; color:rgb(32, 48, 64); }
    </style>
    <main>
      <button id="nested-label"><span class="label">Continue</span></button>
      <button id="icon-only" class="icon" aria-label="Settings"><svg width="20" height="20"><path d="M0 0h20v20H0z"/></svg></button>
      <button id="clipped-label" class="clipped-label-control"><svg width="20" height="20"><path d="M0 0h20v20H0z"/></svg><span class="visually-hidden">Settings</span></button>
      <button class="clipped-label-control"><svg width="20" height="20"><path d="M0 0h20v20H0z"/></svg><span class="visually-hidden">Profile</span></button>
      <button id="dot-tab" class="dot-tab" role="tab"><span class="visually-hidden">Slide one</span></button>
      <input id="field" value="Search">
      <input id="empty-checkbox" type="checkbox" aria-label="Toggle option">
      <div class="transparent-input-shell"><input id="transparent-field" role="combobox" aria-label="Search"><span class="visible-input-label">Search</span></div>
      <div class="transparent-input-shell"><input role="combobox" aria-label="Filter"><span class="visible-input-label">Filter</span></div>
      <div class="clipped-native-shell"><input id="clipped-native-field" value="Hidden" aria-label="Clipped"><span class="clipped-native-label">Visible label</span></div>
      <nav><a href="#one">Section one</a></nav>
      <ul><li><span>First item</span></li><li><span>Second item</span></li></ul>
      <article class="card"><p class="card-copy">Card content owned by a descendant.</p></article>
      <section class="live-region" aria-live="polite"><p>Large dynamic content region.</p></section>
      <section class="direct-live-region" aria-live="polite">Broad direct status one</section>
      <section class="direct-live-region" aria-live="polite">Broad direct status two</section>
      <div class="bounded-status" role="status">Saved</div>
    </main>`)

  const snapshot = await extractPageEvidence(page, 'desktop')
  const buttons = snapshot.components.filter((component) => component.type === 'button')
  const nested = buttons.find((component) => component.styles.backgroundColor === 'rgb(255, 255, 255)')
  const icon = buttons.find(
    (component) => component.styles.color === undefined && component.styles.backgroundColor === 'rgba(0, 0, 0, 0)',
  )
  const clippedLabel = buttons.find((component) => component.styles.backgroundColor === 'rgb(232, 240, 248)')
  const dotTab = snapshot.components.find(
    (component) => component.type === 'tab' && component.styles.backgroundColor === 'rgb(45, 55, 65)',
  )
  const fields = snapshot.components.filter((component) => component.type === 'input')
  const field = fields.find((component) => component.styles.backgroundColor === 'rgb(255, 255, 255)')
  const transparentField = fields.find((component) => component.styles.backgroundColor === 'rgb(238, 242, 247)')
  const clippedNativeField = fields.find((component) => component.styles.backgroundColor === 'rgb(225, 235, 245)')
  const emptyCheckbox = fields.find((component) => component.styles.height === '20px')
  const navigation = snapshot.components.find((component) => component.type === 'navigation')
  const list = snapshot.components.find((component) => component.type === 'list')
  const card = snapshot.components.find((component) => component.type === 'card')
  const statuses = snapshot.components.filter((component) => component.type === 'status')
  const broadStatus = statuses.find((component) => component.styles.backgroundColor === 'rgba(0, 0, 0, 0)')
  const boundedStatus = statuses.find((component) => component.styles.backgroundColor === 'rgb(181, 71, 8)')

  assert.equal(nested?.textStyleOwner, 'descendant')
  assert.equal(nested?.styles.fontFamily, 'Inter, sans-serif')
  assert.equal(nested?.styles.color, 'rgb(20, 70, 140)')
  assert.equal(nested?.styles.height, '44px')
  assert.equal(icon?.textStyleOwner, undefined)
  assert.equal(icon?.styles.fontFamily, undefined)
  assert.equal(icon?.styles.color, undefined)
  assert.equal(clippedLabel?.textStyleOwner, undefined)
  assert.equal(clippedLabel?.styles.fontFamily, undefined)
  assert.equal(clippedLabel?.styles.color, undefined)
  assert.equal(dotTab?.textStyleOwner, undefined)
  assert.equal(dotTab?.styles.fontFamily, undefined)
  assert.equal(dotTab?.styles.color, undefined)
  assert.equal(field?.textStyleOwner, 'root')
  assert.equal(field?.styles.fontFamily, 'Inter, sans-serif')
  assert.equal(transparentField?.textStyleOwner, 'descendant')
  assert.equal(transparentField?.styles.fontFamily, 'Arial, sans-serif')
  assert.equal(transparentField?.styles.color, 'rgb(46, 62, 86)')
  assert.equal(clippedNativeField?.textStyleOwner, 'descendant')
  assert.equal(clippedNativeField?.styles.fontFamily, 'Inter, sans-serif')
  assert.equal(clippedNativeField?.styles.fontSize, '16px')
  assert.equal(clippedNativeField?.styles.color, 'rgb(17, 34, 51)')
  assert.equal(clippedNativeField?.textStyleSource?.kind, 'descendant-text')
  assert.ok(clippedNativeField?.textStyleSource?.glyphRectCount > 0)
  assert.equal(emptyCheckbox?.textStyleOwner, undefined)
  assert.equal(emptyCheckbox?.styles.fontFamily, undefined)
  assert.equal(emptyCheckbox?.styles.color, undefined)
  assert.equal(navigation?.styles.height, '64px')
  assert.equal(navigation?.styles.fontFamily, undefined)
  assert.equal(navigation?.styles.color, undefined)
  assert.equal(list?.styles.height, undefined)
  assert.equal(list?.styles.fontFamily, undefined)
  assert.equal(card?.styles.height, undefined)
  assert.equal(card?.styles.fontFamily, undefined)
  assert.equal(broadStatus?.styles.height, undefined)
  assert.equal(broadStatus?.styles.fontFamily, undefined)
  assert.equal(boundedStatus?.textStyleOwner, 'root')
  assert.equal(boundedStatus?.styles.height, undefined)
  assert.equal(boundedStatus?.styles.color, 'rgb(255, 255, 255)')

  const detected = await detectComponents(page)
  const detectedClippedLabel = detected.find((component) => component.styles.backgroundColor === 'rgb(232, 240, 248)')
  assert.ok(detectedClippedLabel)
  assert.equal(detectedClippedLabel.styles.fontFamily, undefined)
  assert.equal(detectedClippedLabel.styles.color, undefined)
  await page
    .locator('#field, #empty-checkbox')
    .evaluateAll((elements) => elements.forEach((element) => element.remove()))
  const detectedTransparentInputs = await detectComponents(page)
  const detectedTransparentField = detectedTransparentInputs.find(
    (component) => component.type === 'input' && component.styles.backgroundColor === 'rgb(238, 242, 247)',
  )
  assert.ok(
    detectedTransparentField,
    JSON.stringify(detectedTransparentInputs.filter((component) => component.type === 'input')),
  )
  assert.equal(detectedTransparentField.styles.fontFamily, 'Arial, sans-serif')
  assert.equal(detectedTransparentField.styles.color, 'rgb(46, 62, 86)')
  await page
    .locator('.transparent-input-shell')
    .evaluateAll((elements) => elements.forEach((element) => element.remove()))
  const detectedClippedInputs = await detectComponents(page)
  const detectedClippedNativeField = detectedClippedInputs.find(
    (component) => component.type === 'input' && component.styles.backgroundColor === 'rgb(225, 235, 245)',
  )
  assert.ok(detectedClippedNativeField)
  assert.equal(detectedClippedNativeField.styles.fontFamily, 'Inter, sans-serif')
  assert.equal(detectedClippedNativeField.styles.fontSize, '16px')
  assert.equal(detectedClippedNativeField.styles.color, 'rgb(17, 34, 51)')

  const statusPatterns = summarizeComponentVariants(
    statuses.map((status) => ({
      ...status,
      type: 'status',
      evidence: [status.key],
      pageId: 'style-owner-page',
      widthPx: status.rect.width * snapshot.contentWidth,
      heightPx: status.rect.height * snapshot.height,
    })),
  )
  const broadPattern = statusPatterns.find((pattern) => pattern.styles.backgroundColor === 'rgba(0, 0, 0, 0)')
  assert.ok(broadPattern)
  assert.equal(isActionableComponentPattern(broadPattern, []), false)
  const directBroadPattern = statusPatterns.find(
    (pattern) => pattern.styles.fontFamily === 'Times' && pattern.styleObservationCount === 2,
  )
  assert.ok(directBroadPattern)
  assert.equal(directBroadPattern.statusBoundarySupport, 0)
  assert.equal(isActionableComponentPattern(directBroadPattern, []), false)
  await page.close()
})

test('uses visible labels when native input text is hidden by an ancestor or near-total clipping', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  const cases = [
    ['offscreen-ancestor', 'position:absolute;left:-9999px;top:0'],
    ['one-pixel-ancestor', 'position:absolute;left:12px;top:8px;width:1px;height:1px;overflow:hidden'],
    ['transparent-ancestor', 'position:absolute;left:12px;top:8px;opacity:0'],
    ['near-total-clip', 'position:absolute;left:12px;top:8px', 'clip-path:inset(49%)'],
    ['tiny-circle-clip', 'position:absolute;left:12px;top:8px', 'clip-path:circle(1px)'],
    ['tiny-ellipse-clip', 'position:absolute;left:12px;top:8px', 'clip-path:ellipse(1px 1px)'],
    ['tiny-polygon-clip', 'position:absolute;left:12px;top:8px', 'clip-path:polygon(0 0, 1px 0, 1px 1px, 0 1px)'],
  ]

  for (const [name, wrapperStyle, inputStyle = ''] of cases) {
    await page.setContent(`<!doctype html>
      <style>
        body { margin:0; }
        .shell { position:relative; width:180px; height:44px; margin:24px; border-radius:8px; background:rgb(225, 235, 245); }
        .source { ${wrapperStyle} }
        input { box-sizing:border-box; width:120px; height:24px; border:0; background:transparent; font:700 29px/24px Georgia, serif; color:rgb(238, 17, 17); ${inputStyle} }
        .label { position:absolute; left:12px; top:10px; font:600 16px/24px Inter, sans-serif; color:rgb(17, 34, 51); pointer-events:none; }
      </style>
      <main><div class="shell"><span class="source"><input value="Hidden"></span><span class="label">Visible ${name}</span></div></main>`)

    const snapshot = await extractPageEvidence(page, 'desktop')
    const field = snapshot.components.find(
      (component) => component.type === 'input' && component.styles.backgroundColor === 'rgb(225, 235, 245)',
    )
    assert.ok(field, `${name}: canonical input evidence must be retained`)
    assert.equal(field.textStyleOwner, 'descendant', `${name}: hidden native text must not own typography`)
    assert.equal(field.textStyleSource?.kind, 'descendant-text')
    assert.equal(field.styles.fontFamily, 'Inter, sans-serif')
    assert.equal(field.styles.color, 'rgb(17, 34, 51)')
    assert.ok(field.textStyleSource.visibleWidthPx > 2)
    assert.ok(field.textStyleSource.visibleHeightPx > 2)
    assert.ok(field.textStyleSource.paintedAreaPx > 16)
    assert.ok(field.textStyleSource.captureIntersectionRatio > 0)
    assert.ok(field.textStyleSource.effectiveClipPathAreaRatio > 0)

    const detected = await detectComponents(page)
    const detectedField = detected.find(
      (component) => component.type === 'input' && component.styles.backgroundColor === 'rgb(225, 235, 245)',
    )
    assert.ok(detectedField, `${name}: legacy input pattern must be retained`)
    assert.equal(detectedField.styles.fontFamily, 'Inter, sans-serif')
    assert.equal(detectedField.styles.color, 'rgb(17, 34, 51)')
  }

  await page.close()
})

test('requires the complete native text box when glyph rectangles are unavailable', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  const clippedCases = [
    ['value', '<input class="native" value="Displaced value">', 'input'],
    ['placeholder', '<input class="native" placeholder="Displaced placeholder">', 'input'],
    ['selection', '<select class="native"><option>Displaced selection</option></select>', 'input'],
    ['input-button', '<input class="native" type="submit" value="Displaced action">', 'button'],
  ]

  for (const [name, control, componentType] of clippedCases) {
    await page.setContent(`<!doctype html>
      <style>
        body { margin:0; }
        .shell { position:relative; width:220px; height:48px; margin:24px; background:rgb(225, 235, 245); }
        .native { box-sizing:border-box; position:absolute; inset:4px auto auto 4px; width:200px; height:40px; padding:4px 8px; border:1px solid rgb(90, 110, 130); clip-path:inset(0 180px 0 0); text-indent:100px; font:700 24px/30px Georgia, serif; color:rgb(238, 17, 17); background:transparent; }
        .label { position:absolute; left:12px; top:12px; font:600 16px/24px Inter, sans-serif; color:rgb(17, 34, 51); pointer-events:none; }
      </style>
      <main><div class="shell">${control}<span class="label">Visible ${name}</span></div></main>`)

    const snapshot = await extractPageEvidence(page, 'desktop')
    const component = snapshot.components.find((candidate) => candidate.type === componentType)
    assert.ok(component, `${name}: canonical component must be retained`)
    if (componentType === 'input') {
      assert.equal(component.textStyleOwner, 'descendant', `${name}: visible label must own typography`)
      assert.equal(component.textStyleSource?.kind, 'descendant-text')
      assert.equal(component.styles.fontFamily, 'Inter, sans-serif')
      assert.equal(component.styles.color, 'rgb(17, 34, 51)')
    } else {
      assert.equal(component.textStyleOwner, undefined, `${name}: clipped native text must not own typography`)
      assert.equal(component.textStyleSource, undefined)
      assert.equal(component.styles.fontFamily, undefined)
      assert.equal(component.styles.color, undefined)
    }

    const detected = await detectComponents(page)
    const legacy = detected.find((candidate) => candidate.type === componentType)
    assert.ok(legacy, `${name}: legacy component must be retained`)
    assert.notEqual(legacy.styles.fontFamily, 'Georgia, serif')
    assert.notEqual(legacy.styles.color, 'rgb(238, 17, 17)')
  }

  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; }
      input { display:block; box-sizing:border-box; width:40px; height:40px; margin:16px; border:1px solid rgb(90, 110, 130); background-color:rgb(225, 235, 245); background-image:linear-gradient(45deg, transparent 45%, rgb(20, 70, 140) 45% 55%, transparent 55%); font:700 25px/30px Georgia, serif; color:rgb(238, 17, 17); }
    </style>
    <main>
      <input type="button" value="" aria-label="First icon action">
      <input type="button" value="" aria-label="Second icon action">
    </main>`)
  const emptyButtonSnapshot = await extractPageEvidence(page, 'desktop')
  const emptyButtons = emptyButtonSnapshot.components.filter((component) => component.type === 'button')
  assert.equal(emptyButtons.length, 2)
  assert.ok(emptyButtons.every((component) => component.textStyleOwner === undefined))
  assert.ok(emptyButtons.every((component) => component.textStyleSource === undefined))
  assert.ok(emptyButtons.every((component) => component.styles.fontFamily === undefined))
  assert.ok(emptyButtons.every((component) => component.styles.color === undefined))
  const emptyButtonPatterns = summarizeComponentVariants(
    emptyButtons.map((button) => ({
      ...button,
      type: 'button',
      evidence: [button.key],
      pageId: 'empty-native-button-page',
      widthPx: button.rect.width * emptyButtonSnapshot.contentWidth,
      heightPx: button.rect.height * emptyButtonSnapshot.height,
    })),
  )
  assert.equal(emptyButtonPatterns.length, 1)
  assert.equal(emptyButtonPatterns[0].variant, 'icon')
  assert.equal(emptyButtonPatterns[0].styles.fontFamily, undefined)
  const emptyLegacyButton = (await detectComponents(page)).find((component) => component.type === 'button')
  assert.ok(emptyLegacyButton)
  assert.equal(emptyLegacyButton.styles.fontFamily, undefined)
  assert.equal(emptyLegacyButton.styles.color, undefined)

  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; }
      .native { box-sizing:border-box; display:block; width:220px; height:44px; margin:16px; padding:4px 12px; border:1px solid rgb(90, 110, 130); font:700 18px/28px Georgia, serif; color:rgb(34, 68, 136); }
      #value { text-align:right; background:rgb(241, 242, 243); }
      #placeholder { text-align:center; background:rgb(242, 243, 244); }
      #selection { text-align:right; background:rgb(243, 244, 245); }
      #action { text-align:center; background:rgb(244, 245, 246); }
      #default-action { text-align:center; background:rgb(245, 246, 247); }
      #placeholder::placeholder { color:rgb(34, 68, 136); opacity:1; }
    </style>
    <main>
      <input id="value" class="native" value="Aligned value">
      <input id="placeholder" class="native" placeholder="Aligned placeholder">
      <select id="selection" class="native"><option>Aligned selection</option></select>
      <input id="action" class="native" type="submit" value="Aligned action">
      <input id="default-action" class="native" type="submit">
    </main>`)

  const positiveSnapshot = await extractPageEvidence(page, 'desktop')
  const positiveComponents = positiveSnapshot.components.filter((component) =>
    ['input', 'button'].includes(component.type),
  )
  assert.equal(positiveComponents.length, 5)
  assert.deepEqual(positiveComponents.map((component) => component.textStyleSource?.kind).sort(), [
    'native-placeholder',
    'native-selection',
    'native-value',
    'native-value',
    'native-value',
  ])
  assert.ok(
    positiveComponents.some((component) => component.textStyleSource?.nativeTextOrigin === 'user-agent-default'),
  )
  for (const component of positiveComponents) {
    const source = component.textStyleSource
    assert.ok(source?.nativeTextBounds)
    assert.equal(component.styles.fontFamily, 'Georgia, serif')
    assert.equal(component.styles.color, 'rgb(34, 68, 136)')
    assert.ok(source.visibleBounds.xPx <= source.nativeTextBounds.xPx + 1)
    assert.ok(
      source.visibleBounds.xPx + source.visibleBounds.widthPx >=
        source.nativeTextBounds.xPx + source.nativeTextBounds.widthPx - 1,
    )
  }
  const positiveLegacy = (await detectComponents(page)).filter((component) =>
    ['input', 'button'].includes(component.type),
  )
  assert.equal(positiveLegacy.length, 2)
  assert.ok(positiveLegacy.every((component) => component.styles.fontFamily === 'Georgia, serif'))
  assert.ok(positiveLegacy.every((component) => component.styles.color === 'rgb(34, 68, 136)'))

  await page.close()
})

test('does not attribute component typography to near-total circular, elliptical, or polygon label clips', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  for (const clipPath of ['circle(1px)', 'ellipse(1px 1px)', 'polygon(0 0, 1px 0, 1px 1px, 0 1px)']) {
    await page.setContent(`<!doctype html>
      <style>
        button { width:160px; height:44px; background:rgb(225, 235, 245); border:1px solid rgb(90, 110, 130); }
        span { display:block; width:100px; height:24px; clip-path:${clipPath}; font:700 29px/24px Georgia, serif; color:rgb(238, 17, 17); }
      </style>
      <main><button><span>Clipped label</span></button></main>`)

    const snapshot = await extractPageEvidence(page, 'desktop')
    const button = snapshot.components.find((component) => component.type === 'button')
    assert.ok(button)
    assert.equal(button.textStyleOwner, undefined)
    assert.equal(button.textStyleSource, undefined)
    assert.equal(button.styles.fontFamily, undefined)
    assert.equal(button.styles.color, undefined)

    const detected = await detectComponents(page)
    const pattern = detected.find((component) => component.type === 'button')
    assert.ok(pattern)
    assert.equal(pattern.styles.fontFamily, undefined)
    assert.equal(pattern.styles.color, undefined)
  }
  await page.close()
})

test('requires actual glyph rectangles to intersect the surviving ancestor clip', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; font-family:Arial, sans-serif; color:rgb(20, 30, 40); }
      .glyph-window { display:block; width:50px; height:36px; overflow:hidden; }
      .poison { display:block; box-sizing:content-box; width:220px; padding-left:100px; font:913 42px/48px Georgia, serif; color:rgb(238, 17, 17); }
      button { display:block; width:180px; height:52px; margin:12px; background:rgb(225, 235, 245); border:1px solid rgb(90, 110, 130); }
    </style>
    <main>
      <div class="glyph-window"><span class="poison">Outside one</span></div>
      <div class="glyph-window"><span class="poison">Outside two</span></div>
      <button><span class="glyph-window"><span class="poison">Hidden button label</span></span></button>
    </main>`)

  const styles = await extractStyles(page)
  assert.equal(
    styles.fontFamilies.some((family) => family.includes('Georgia')),
    false,
  )
  assert.equal(styles.textColors.includes('rgb(238, 17, 17)'), false)
  const tokens = buildDesignTokens(styles, clusterColors(styles.colors, styles.usageCount), styles)
  assert.equal(
    tokens.typography.fontFamilies.some((family) => family.includes('Georgia')),
    false,
  )
  assert.equal(Object.values(tokens.colors).includes('#ee1111'), false)

  const snapshot = await extractPageEvidence(page, 'desktop')
  const button = snapshot.components.find((component) => component.type === 'button')
  assert.ok(button)
  assert.equal(button.textStyleOwner, undefined)
  assert.equal(button.textStyleSource, undefined)
  assert.equal(button.styles.fontFamily, undefined)
  assert.equal(button.styles.color, undefined)

  const detected = await detectComponents(page)
  const legacyButton = detected.find((component) => component.type === 'button')
  assert.ok(legacyButton)
  assert.equal(legacyButton.styles.fontFamily, undefined)
  assert.equal(legacyButton.styles.color, undefined)
  await page.close()
})

test('uses effective glyph fill for component typography without inventing gradient foregrounds', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      button { display:block; width:260px; height:52px; margin:12px; background:rgb(225, 235, 245); border:1px solid rgb(90, 110, 130); }
      .transparent { color:rgb(238, 17, 17); -webkit-text-fill-color:transparent; font:700 29px/36px Georgia, serif; }
      .solid { color:rgb(238, 17, 17); -webkit-text-fill-color:color(srgb 0 0.3 1); font:600 18px/24px Arial, sans-serif; }
      .gradient { color:rgb(238, 17, 17); -webkit-text-fill-color:transparent; -webkit-background-clip:text; background-clip:text; background-image:linear-gradient(90deg, rgb(0, 80, 220), rgb(120, 0, 180)); font:500 20px/28px "Times New Roman", serif; }
      .filtered { filter:opacity(0); color:rgb(229, 100, 20); font:700 26px/32px Palatino, serif; }
      .svg-filtered { filter:url(#zero-alpha); color:rgb(30, 140, 80); font:700 27px/34px Cambria, serif; }
      .masked { -webkit-mask-image:linear-gradient(transparent, transparent); mask-image:linear-gradient(transparent, transparent); color:rgb(120, 20, 180); font:700 31px/38px Baskerville, serif; }
      .blended { mix-blend-mode:difference; color:rgb(200, 30, 90); font:700 33px/40px "Courier New", monospace; }
      .transparent-heading { color:rgb(220, 20, 60); -webkit-text-fill-color:transparent; font:700 64px/64px Georgia, serif; }
      .masked-heading { -webkit-mask-image:linear-gradient(transparent, transparent); mask-image:linear-gradient(transparent, transparent); color:rgb(120, 20, 180); font:700 62px/64px Baskerville, serif; }
      .blended-heading { mix-blend-mode:difference; color:rgb(200, 30, 90); font:700 60px/64px "Courier New", monospace; }
    </style>
    <main>
      <svg width="0" height="0" aria-hidden="true"><filter id="zero-alpha"><feComponentTransfer><feFuncA type="table" tableValues="0 0"/></feComponentTransfer></filter></svg>
      <h1 class="transparent-heading">Unpainted heading</h1>
      <h2 class="masked-heading">Masked heading</h2>
      <h3 class="blended-heading">Backdrop-dependent heading</h3>
      <button class="transparent">Unpainted label</button>
      <button class="solid">Solid fill label</button>
      <button class="gradient">Gradient label</button>
      <button class="filtered">Filtered label one</button>
      <button class="filtered">Filtered label two</button>
      <button class="svg-filtered">SVG filtered label one</button>
      <button class="svg-filtered">SVG filtered label two</button>
      <button class="masked">Masked label one</button>
      <button class="masked">Masked label two</button>
      <button class="blended">Blended label one</button>
      <button class="blended">Blended label two</button>
    </main>`)

  const snapshot = await extractPageEvidence(page, 'desktop')
  const canonicalButtons = snapshot.components.filter((component) => component.type === 'button')
  const transparent = canonicalButtons.find((component) => component.styles.fontFamily?.includes('Georgia'))
  assert.equal(transparent, undefined)
  const solid = canonicalButtons.find((component) => component.styles.fontFamily?.includes('Arial'))
  assert.ok(solid)
  assert.equal(solid.styles.color, 'rgb(0, 77, 255)')
  assert.equal(solid.textStyleSource?.glyphPaintKind, 'solid-color')
  const gradient = canonicalButtons.find((component) => component.styles.fontFamily?.includes('Times New Roman'))
  assert.ok(gradient)
  assert.equal(gradient.styles.color, undefined)
  assert.equal(gradient.textStyleSource?.glyphPaintKind, 'background-clip')

  const detected = await detectComponents(page)
  assert.equal(
    detected.some((component) => component.styles.fontFamily?.includes('Georgia')),
    false,
  )
  const detectedSolid = detected.find((component) => component.styles.fontFamily?.includes('Arial'))
  assert.ok(detectedSolid)
  assert.equal(detectedSolid.styles.color, 'rgb(0, 77, 255)')
  assert.equal(
    detected.some((component) => component.styles.color === 'rgb(238, 17, 17)'),
    false,
  )
  assert.equal(
    canonicalButtons.some((component) => component.styles.fontFamily?.includes('Palatino')),
    false,
  )
  assert.equal(
    canonicalButtons.some((component) => component.styles.fontFamily?.includes('Cambria')),
    false,
  )
  assert.equal(
    detected.some((component) => component.styles.fontFamily?.includes('Palatino')),
    false,
  )
  assert.equal(
    detected.some((component) => component.styles.fontFamily?.includes('Cambria')),
    false,
  )
  assert.equal(
    canonicalButtons.some((component) => component.styles.fontFamily?.includes('Baskerville')),
    false,
  )
  assert.equal(
    detected.some((component) => component.styles.fontFamily?.includes('Baskerville')),
    false,
  )
  assert.equal(
    canonicalButtons.some((component) => component.styles.fontFamily?.includes('Courier New')),
    false,
  )
  assert.equal(
    detected.some((component) => component.styles.fontFamily?.includes('Courier New')),
    false,
  )
  assert.equal(
    snapshot.layoutNodes.some((node) => node.styles.fontFamily?.includes('Baskerville')),
    false,
  )
  assert.equal(
    snapshot.layoutNodes.some((node) => node.styles.fontFamily?.includes('Courier New')),
    false,
  )
  const transparentHeading = snapshot.layoutNodes.find((node) => node.role === 'heading')
  assert.ok(transparentHeading)
  assert.equal(transparentHeading.textRole, undefined)
  assert.equal(transparentHeading.textStyleSource, undefined)
  assert.equal(transparentHeading.styles.fontFamily, undefined)
  assert.equal(transparentHeading.styles.color, undefined)
  await page.close()
})

test('discards an interaction observation when restoring the control leaves page geometry changed', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <main>
      <button aria-expanded="false" aria-controls="panel" onclick="
        this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
        document.getElementById('panel').toggleAttribute('hidden');
        document.querySelector('.payload')?.remove();
      ">Details</button>
      <section id="panel" hidden>Panel</section>
      <div class="payload" style="height:1400px">Long content</div>
    </main>`)
  const evidence = await extractPageEvidence(page, 'desktop')

  const observations = await observeSafeInteractions(page, evidence, 1, 3_000)

  assert.equal(observations.length, 0)
  await page.close()
})

test('blocks a disclosure click that attempts to replace the main document', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await page.setContent(`<!doctype html>
    <main>
      <button aria-expanded="false" aria-controls="panel" onclick="location.href='/navigated'">Details</button>
      <section id="panel" hidden>Panel</section>
    </main>`)
  const evidence = await extractPageEvidence(page, 'desktop')
  const originalUrl = page.url()

  const observations = await observeSafeInteractions(page, evidence, 1, 3_000)

  assert.deepEqual(observations, [])
  assert.equal(page.url(), originalUrl)
  await page.close()
})

test('restores the exact observed document when a disclosure replaces the current history entry', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await page.setContent(`<!doctype html>
    <main>
      <button aria-expanded="false" aria-controls="panel" onclick="history.replaceState({}, '', '/history-mutated')">
        Details
      </button>
      <section id="panel" hidden>Panel</section>
    </main>`)
  const evidence = await extractPageEvidence(page, 'desktop')
  const originalUrl = page.url()

  const observations = await observeSafeInteractions(page, evidence, 1, 3_000)

  assert.deepEqual(observations, [])
  assert.equal(page.url(), originalUrl)
  await page.close()
})

test('extracts foreground and effective background as observed pairs', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; background:rgb(255, 255, 255); color:rgb(17, 24, 39); }
      main { padding:32px; }
      .inverse { padding:24px; background:rgb(17, 24, 39); color:rgb(255, 255, 255); }
      .translucent { padding:24px; background:rgb(0 0 0 / 50%); color:rgb(255, 255, 255); }
    </style>
    <main><p>Body text on the page canvas.</p><section class="inverse"><span>Inverse text.</span></section>
      <section class="translucent"><span>Text on a composited surface.</span></section></main>`)

  const styles = await extractStyles(page)

  assert.ok(
    styles.textColorPairObservations.some(
      (pair) => pair.background === 'rgb(255, 255, 255)' && pair.foreground === 'rgb(17, 24, 39)',
    ),
  )
  assert.ok(
    styles.textColorPairObservations.some(
      (pair) => pair.background === 'rgb(17, 24, 39)' && pair.foreground === 'rgb(255, 255, 255)',
    ),
  )
  assert.ok(
    styles.textColorPairObservations.some(
      (pair) =>
        /^rgb\((?:127|128), (?:127|128), (?:127|128)\)$/.test(pair.background) &&
        pair.foreground === 'rgb(255, 255, 255)',
    ),
  )
  await page.close()
})

test('counts real text metrics and distinct gap axes without computed-style aliases', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; font:400 16px/24px system-ui; }
      .grid { display:grid; gap:13px; }
      code { font:inherit; padding:1.728px; }
    </style>
    <main><div class="grid"><div><span>One</span></div><div><span>Two</span></div></div>
      <pre><code>const value = true</code></pre></main>`)

  const styles = await extractStyles(page)

  assert.equal(styles.usageCount['spacing:13px'], 1)
  assert.equal(styles.usageCount['fontSize:16px'], 3)
  assert.equal(styles.usageCount['spacing:1.728px'], 4)
  assert.equal(styles.usageOwnerCounts['spacing:1.728px'], 1)
  assert.equal(styles.valueSourceCounts['spacing:1.728px']['element:specialized-spacing'], 1)
  await page.close()
})

test('extracts the painted input wrapper and does not assume every root route is a landing page', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; color:#172033; }
      main { min-height:500px; padding:32px; }
      .search-shell { display:flex; width:360px; height:40px; padding:0 16px; border-radius:20px; background:rgb(243, 246, 250); }
      input { width:100%; border:0; border-radius:0; padding:0; background:transparent; font-family:Inter, sans-serif; color:rgb(32, 48, 72); }
      input::placeholder { color:rgb(32, 48, 72); opacity:1; }
    </style>
    <main>
      <div class="search-shell"><input role="combobox" aria-label="Search" placeholder="Search"></div>
      <div class="feed"><h2>Recommended</h2><p>A signed-in feed can live at the root URL without being a landing page.</p></div>
    </main>`)

  const detected = await detectComponents(page)
  const detectedInput = detected.find((component) => component.type === 'input')
  const evidence = await extractPageEvidence(page, 'desktop')
  const evidenceInput = evidence.components.find((component) => component.type === 'input')

  assert.equal(detectedInput?.styles.borderRadius, '20px')
  assert.equal(detectedInput?.styles.backgroundColor, 'rgb(243, 246, 250)')
  assert.equal(detectedInput?.styles.fontFamily, 'Inter, sans-serif')
  assert.equal(detectedInput?.styles.color, 'rgb(32, 48, 72)')
  assert.equal(evidenceInput?.styles.borderRadius, '20px')
  assert.equal(evidenceInput?.styles.backgroundColor, 'rgb(243, 246, 250)')
  assert.equal(evidenceInput?.textStyleOwner, 'descendant')
  assert.equal(evidenceInput?.styles.fontFamily, 'Inter, sans-serif')
  assert.equal(evidenceInput?.styles.color, 'rgb(32, 48, 72)')
  assert.equal(Math.round((evidenceInput?.rect.height || 0) * evidence.height), 40)
  assert.equal(evidence.role, 'unknown')
  await page.close()
})

test('classifies a long repeated feed as a content page while preserving its feature-group section', async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  const items = Array.from(
    { length: 4 },
    (_, index) =>
      `<article><h2>Feed item ${index + 1}</h2><p>${'A repeated feed remains page-level content. '.repeat(8)}</p></article>`,
  ).join('')
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; }
      main { padding:16px; }
      article { min-height:160px; padding:16px; border-bottom:1px solid #ddd; }
    </style>
    <main>${items}</main>`)

  const evidence = await extractPageEvidence(page, 'mobile')

  assert.equal(evidence.role, 'content')
  assert.ok(evidence.sections.some((section) => section.role === 'feature-group'))
  await page.close()
})

test('classifies workspace and content pages from standards-backed structure', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <header><nav aria-label="Application"><a href="#canvas">Canvas</a></nav></header>
    <main>
      <div role="toolbar"><button type="button">Undo</button><button type="button">Redo</button></div>
      <div role="tablist"><button role="tab" aria-selected="true">Canvas</button></div>
      <div role="grid" aria-label="Editable data"><div role="row"><div role="gridcell">Draft</div></div></div>
    </main>`)
  const workspace = await extractPageEvidence(page, 'desktop')

  await page.setContent(`<!doctype html>
    <main><article><h1>Observed article</h1><p>${'Standards-backed article content. '.repeat(40)}</p></article></main>`)
  const content = await extractPageEvidence(page, 'desktop')

  assert.equal(workspace.role, 'workspace')
  assert.equal(content.role, 'content')
  await page.close()
})

test('classifies a public profile before generic table and navigation heuristics', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <main>
      <header><nav><a href="/profile">Overview</a></nav></header>
      <section itemscope itemtype="https://schema.org/Person">
        <h1 itemprop="name">Sample creator</h1><span itemprop="additionalName">sample-creator</span>
      </section>
      <div role="tablist"><button role="tab">Contributions</button></div>
      <table><tbody><tr><td>Recent activity</td></tr></tbody></table>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')

  assert.equal(evidence.role, 'profile')
  await page.close()
})

test('uses native form semantics for primary actions and ignores implementation naming across localized labels', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { display:block; min-height:400px; }
      button, input { display:block; width:120px; height:40px; margin:8px; border:0; color:white; }
      input[type="submit"], [data-intent="primary"] { background:rgb(21, 94, 239); }
      [data-intent="destructive"] { background:rgb(180, 35, 24); }
    </style>
    <main>
      <section>
        <form><input type="submit" value="Save"></form>
        <button data-intent="primary">متابعة</button>
        <button data-intent="destructive">Eliminar</button>
        <button data-intent="destructive">削除</button>
        <button>删除</button>
      </section>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const primaryActions = evidence.components.filter((component) => component.role === 'primary-action')
  const destructiveActions = evidence.components.filter((component) => component.role === 'destructive-action')
  const genericActions = evidence.components.filter((component) => component.role === 'action')
  const statuses = evidence.components.filter((component) => component.type === 'status')

  assert.equal(primaryActions.length, 1)
  assert.equal(destructiveActions.length, 0)
  assert.equal(genericActions.length, 4)
  assert.equal(statuses.length, 0)
  await page.close()
})

test('keeps multiple submitters in one form hierarchy-neutral across styles, tokens, evidence, and recipes', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; font-family:system-ui; color:#172033; }
      main { min-height:400px; padding:32px; }
      form { display:flex; gap:12px; }
      button { width:140px; height:42px; border:0; border-radius:8px; color:white; background:rgb(23, 94, 232); }
    </style>
    <main><h1>Draft workflow</h1><form id="draft-workflow" method="post">
      <button type="submit" name="intent" value="preview" formaction="/preview">Preview</button>
    </form><button type="submit" form="draft-workflow" name="intent" value="save" formaction="/save">Save draft</button></main>`)

  const styles = await extractStyles(page)
  const actionObservations = styles.colorRoleObservations.filter(
    (observation) => observation.background === 'rgb(23, 94, 232)',
  )
  assert.equal(actionObservations.length, 2)
  assert.ok(actionObservations.every((observation) => observation.role === 'action'))
  assert.equal(styles.usageCount['primaryActionBackgroundColor:rgb(23, 94, 232)'], undefined)
  assert.equal(styles.usageCount['actionBackgroundColor:rgb(23, 94, 232)'], 2)

  const tokens = buildDesignTokens(styles, clusterColors(styles.colors, styles.usageCount), styles)
  assert.equal(tokens.colors.primary, undefined)
  assert.equal(tokens.colorRoles?.primaryAction, undefined)

  const snapshot = await extractPageEvidence(page, 'desktop')
  const buttons = snapshot.components.filter((component) => component.type === 'button')
  assert.equal(buttons.length, 2)
  assert.ok(buttons.every((component) => component.role === 'action'))
  const recipes = summarizeComponentVariants(
    buttons.map((button) => ({
      ...button,
      type: 'button',
      evidence: [button.key],
      widthPx: button.rect.width * snapshot.contentWidth,
      heightPx: button.rect.height * snapshot.height,
      pageId: 'multi-submit-page',
    })),
  )
  assert.ok(recipes.length > 0)
  assert.ok(recipes.every((recipe) => recipe.variant === 'action'))
  await page.close()
})

test('ignores non-painted submitters when identifying a form primary action', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:400px; padding:32px; }
      form { display:flex; gap:12px; }
      button { width:140px; height:42px; border:0; color:white; background:rgb(23, 94, 232); }
      .not-painted { filter:opacity(0); }
    </style>
    <main><form>
      <button id="visible-submit" type="submit">Save</button>
      <button id="hidden-submit" class="not-painted" type="submit">Preview</button>
    </form></main>`)

  const styles = await extractStyles(page)
  const observations = styles.colorRoleObservations.filter(
    (observation) => observation.background === 'rgb(23, 94, 232)',
  )
  assert.equal(observations.length, 1)
  assert.equal(observations[0].role, 'primary-action')

  const snapshot = await extractPageEvidence(page, 'desktop')
  const buttons = snapshot.components.filter((component) => component.type === 'button')
  assert.equal(buttons.length, 1)
  assert.equal(buttons[0].role, 'primary-action')
  await page.close()
})

test('treats image submitters as actions across styles, component detection, evidence, and recipes', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const imageSource =
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="40"%3E%3Crect width="120" height="40" fill="transparent"/%3E%3C/svg%3E'
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:400px; padding:32px; }
      form { display:flex; gap:12px; margin-bottom:16px; }
      input { display:block; width:120px; height:40px; border:0; color:white; }
      #sole-image { background:rgb(21, 94, 239); }
      #paired-image, #paired-submit { background:rgb(76, 89, 112); }
    </style>
    <main>
      <form><input id="sole-image" type="image" alt="Save" src="${imageSource}"></form>
      <form>
        <input id="paired-image" type="image" alt="Preview" src="${imageSource}">
        <input id="paired-submit" type="submit" value="Save">
      </form>
    </main>`)

  const styles = await extractStyles(page)
  const primaryObservations = styles.colorRoleObservations.filter(
    (observation) => observation.background === 'rgb(21, 94, 239)',
  )
  const pairedObservations = styles.colorRoleObservations.filter(
    (observation) => observation.background === 'rgb(76, 89, 112)',
  )
  assert.equal(primaryObservations.length, 1)
  assert.equal(primaryObservations[0].role, 'primary-action')
  assert.equal(pairedObservations.length, 2)
  assert.ok(pairedObservations.every((observation) => observation.role === 'action'))

  const detected = await detectComponents(page)
  assert.equal(detected.find((component) => component.type === 'button')?.count, 3)
  assert.equal(
    detected.some((component) => component.type === 'input'),
    false,
  )

  const snapshot = await extractPageEvidence(page, 'desktop')
  const buttons = snapshot.components.filter((component) => component.type === 'button')
  assert.equal(buttons.length, 3)
  assert.equal(buttons.filter((component) => component.role === 'primary-action').length, 1)
  assert.equal(buttons.filter((component) => component.role === 'action').length, 2)
  assert.equal(
    snapshot.components.some((component) => component.type === 'input'),
    false,
  )

  const recipes = summarizeComponentVariants(
    buttons.map((button) => ({
      ...button,
      type: 'button',
      evidence: [button.key],
      widthPx: button.rect.width * snapshot.contentWidth,
      heightPx: button.rect.height * snapshot.height,
      pageId: 'image-submit-page',
    })),
  )
  assert.ok(recipes.some((recipe) => recipe.variant === 'primary'))
  assert.ok(recipes.some((recipe) => recipe.variant === 'action'))
  await page.close()
})

test('keeps voting controls as action components instead of statuses', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      button { width:96px; height:36px; color:#175199; background:#e5f2ff; border:0; }
    </style>
    <main>
      <button class="VoteButton VoteButton--up">赞同</button>
      <button class="VoteButton VoteButton--down">反对</button>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const votes = evidence.components.filter((component) => component.type === 'button')

  assert.equal(votes.length, 2)
  assert.ok(votes.every((component) => component.role === 'action'))
  assert.equal(evidence.components.filter((component) => component.type === 'status').length, 0)
  await page.close()
})

test('keeps aria-live controls as actions while preserving non-interactive live regions', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      button, [role="status"] { width:120px; height:36px; color:#175199; background:#e5f2ff; }
    </style>
    <main>
      <button aria-live="polite" class="VoteButton VoteButton--up">赞同</button>
      <div role="status" class="status success">已保存</div>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')

  assert.equal(evidence.components.filter((component) => component.type === 'button').length, 1)
  assert.equal(evidence.components.filter((component) => component.type === 'status').length, 1)
  await page.close()
})

test('keeps repeated transparent full-width live regions out of actionable status recipes', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; }
      [aria-live] { box-sizing:border-box; width:1000px; height:100px; padding:16px; color:rgb(32, 48, 64); }
      .legacy { border:1px solid transparent; }
      .srgb { border:1px solid color(srgb 1 0 0 / none); }
      .oklch { border:1px solid oklch(60% 0.2 30 / 0); }
      .shadow { box-shadow:0 4px 12px color(srgb 1 0 0 / none); }
      .fill-srgb { background:color(srgb 1 0 0 / none); }
      .fill-oklch { background:oklch(60% 0.2 30 / 0); }
    </style>
    <main>
      <section class="legacy" aria-live="polite">Legacy transparent status one</section>
      <section class="legacy" aria-live="polite">Legacy transparent status two</section>
      <section class="srgb" aria-live="polite">sRGB transparent status one</section>
      <section class="srgb" aria-live="polite">sRGB transparent status two</section>
      <section class="oklch" aria-live="polite">OKLCH transparent status one</section>
      <section class="oklch" aria-live="polite">OKLCH transparent status two</section>
      <section class="shadow" aria-live="polite">Transparent shadow status one</section>
      <section class="shadow" aria-live="polite">Transparent shadow status two</section>
      <section class="fill-srgb" aria-live="polite">Transparent sRGB fill status one</section>
      <section class="fill-srgb" aria-live="polite">Transparent sRGB fill status two</section>
      <section class="fill-oklch" aria-live="polite">Transparent OKLCH fill status one</section>
      <section class="fill-oklch" aria-live="polite">Transparent OKLCH fill status two</section>
    </main>`)

  const snapshot = await extractPageEvidence(page, 'desktop')
  const statuses = snapshot.components.filter((component) => component.type === 'status')
  assert.equal(statuses.length, 12)
  assert.ok(statuses.every((component) => component.statusBoundary?.directlyOwnedText))
  assert.ok(statuses.every((component) => component.statusBoundary?.strongVisualBoundary === false))
  assert.ok(statuses.every((component) => component.statusBoundary?.paintedBorder === false))
  assert.ok(statuses.every((component) => component.statusBoundary?.paintedFill === false))

  const patterns = summarizeComponentVariants(
    statuses.map((status) => ({
      ...status,
      type: 'status',
      evidence: [status.key],
      pageId: 'wide-status-page',
      widthPx: status.rect.width * snapshot.contentWidth,
      heightPx: status.rect.height * snapshot.height,
    })),
  )
  assert.ok(patterns.length >= 1)
  assert.ok(patterns.every((pattern) => pattern.statusBoundarySupport === 0))
  assert.ok(patterns.every((pattern) => !isActionableComponentPattern(pattern, [])))

  const styles = await extractStyles(page)
  assert.equal(styles.colorRoleObservations.filter((observation) => observation.role === 'status').length, 0)
  await page.close()
})

test('keeps a nonzero CSS Color 4 border as an observable status boundary', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      [role="status"] { box-sizing:border-box; width:220px; height:48px; padding:12px; border:2px solid color(srgb 1 0 0 / 0.5); color:rgb(32, 48, 64); }
    </style>
    <main><div role="status">Visible modern border</div></main>`)

  const snapshot = await extractPageEvidence(page, 'desktop')
  const status = snapshot.components.find((component) => component.type === 'status')
  assert.ok(status)
  assert.equal(status.statusBoundary?.paintedBorder, true)
  assert.equal(status.statusBoundary?.strongVisualBoundary, true)

  const styles = await extractStyles(page)
  assert.equal(styles.colorRoleObservations.filter((observation) => observation.role === 'status').length, 1)
  await page.close()
})

test('keeps a nonzero CSS Color 4 fill as an observable status boundary', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      [role="status"] { box-sizing:border-box; width:220px; height:48px; padding:12px; background:oklch(60% 0.2 30 / 0.5); color:rgb(32, 48, 64); }
    </style>
    <main><div role="status">Visible modern fill</div></main>`)

  const snapshot = await extractPageEvidence(page, 'desktop')
  const status = snapshot.components.find((component) => component.type === 'status')
  assert.ok(status)
  assert.equal(status.statusBoundary?.paintedFill, true)
  assert.equal(status.statusBoundary?.strongVisualBoundary, true)

  const styles = await extractStyles(page)
  assert.equal(styles.colorRoleObservations.filter((observation) => observation.role === 'status').length, 1)
  await page.close()
})

test('prefers a bounded nested status over a broad live-region wrapper', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; }
      .live-wrapper { box-sizing:border-box; width:1000px; height:300px; padding:40px; }
      .status { box-sizing:border-box; width:220px; height:48px; padding:12px; background:rgb(6, 118, 71); color:white; }
    </style>
    <main><section class="live-wrapper" aria-live="polite"><div class="status" role="status">Saved</div></section></main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const statuses = evidence.components.filter((component) => component.type === 'status')
  assert.equal(statuses.length, 1)
  assert.equal(statuses[0].styles.backgroundColor, 'rgb(6, 118, 71)')

  const styles = await extractStyles(page)
  const styleStatuses = styles.colorRoleObservations.filter((observation) => observation.role === 'status')
  assert.equal(styleStatuses.length, 1)
  assert.equal(styleStatuses[0].background, 'rgb(6, 118, 71)')
  await page.close()
})

test('records only the outermost standards-backed status component', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .status { display:block; width:180px; height:40px; background:#b54708; color:white; }
      .status-label { display:block; width:120px; height:24px; }
    </style>
    <main>
      <section>
        <div role="status" class="status warning">
          <span role="status" class="status-label warning">Warning</span>
        </div>
      </section>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const statuses = evidence.components.filter((component) => component.type === 'status')

  assert.equal(statuses.length, 1)
  assert.equal(statuses[0].role, 'status-neutral')
  assert.match(statuses[0].key, /div/)
  await page.close()
})

test('keeps a visually bounded standards-backed status component instead of splitting its icon and label', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .status { display:flex; width:180px; min-height:40px; padding:8px 12px; background:rgb(181, 71, 8); color:white; }
      .status-icon, .status-label { display:inline-block; }
    </style>
    <main>
      <section>
        <div role="status" class="status warning">
          <span class="status-icon warning">!</span>
          <span class="status-label warning">Warning</span>
        </div>
      </section>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const statuses = evidence.components.filter((component) => component.type === 'status')

  assert.equal(statuses.length, 1)
  assert.equal(statuses[0].role, 'status-neutral')
  assert.equal(statuses[0].styles.backgroundColor, 'rgb(181, 71, 8)')
  assert.match(statuses[0].key, /div/)
  await page.close()
})

test('preserves independently painted standards-backed statuses in a transparent list', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:240px; }
      .status-list { display:grid; gap:8px; width:220px; padding:8px; }
      .status { display:block; width:180px; height:40px; color:white; }
      .success { background:rgb(6, 118, 71); }
      .warning { background:rgb(181, 71, 8); }
    </style>
    <main>
      <section>
        <div class="status-list">
          <div role="status" class="status success">Healthy</div>
          <div role="status" class="status warning">Warning</div>
        </div>
      </section>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const statuses = evidence.components.filter((component) => component.type === 'status')

  assert.equal(statuses.length, 2)
  assert.ok(statuses.every((component) => component.role === 'status-neutral'))
  assert.deepEqual(statuses.map((component) => component.styles.backgroundColor).sort(), [
    'rgb(181, 71, 8)',
    'rgb(6, 118, 71)',
  ])
  await page.close()
})

test('preserves sibling ARIA status components without inferring intent from class names', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:240px; }
      .status-list { display:grid; gap:8px; width:200px; }
      [role="status"], [role="alert"], [aria-live] { display:block; width:180px; height:40px; color:white; }
      .success { background:rgb(6, 118, 71); }
      .warning { background:rgb(181, 71, 8); }
      .danger { background:rgb(180, 35, 24); }
      .notice { background:rgb(124, 58, 237); }
    </style>
    <main>
      <section>
        <div class="status-list">
          <div role="status" class="success">Healthy</div>
          <div role="status" class="warning">Warning</div>
          <div role="alert" class="danger">Error</div>
          <div aria-live="polite" class="notice">Update available</div>
        </div>
      </section>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const statuses = evidence.components.filter((component) => component.type === 'status')

  assert.equal(statuses.length, 4)
  assert.deepEqual(statuses.map((component) => component.styles.backgroundColor).sort(), [
    'rgb(124, 58, 237)',
    'rgb(180, 35, 24)',
    'rgb(181, 71, 8)',
    'rgb(6, 118, 71)',
  ])
  assert.deepEqual(
    statuses.map((component) => component.role),
    Array(4).fill('status-neutral'),
  )
  await page.close()
})

test('excludes one-pixel live regions from visual status evidence and style roles', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .sr-status { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0, 0, 0, 0); background:#b42318; color:white; }
    </style>
    <main><div role="status" class="sr-status">Saved</div><p>Visible content</p></main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const styles = await extractStyles(page)

  assert.equal(
    evidence.components.some((component) => component.type === 'status'),
    false,
  )
  assert.equal(
    Object.keys(styles.usageCount).some((key) => key.startsWith('status')),
    false,
  )
  await page.close()
})

test('drops blank pseudo geometry while retaining empty pseudo elements with visible paint', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .geometry-only::before {
        content:' ';
        display:block;
        width:120px;
        height:32px;
        border-radius:4px;
      }
      .bordered::before {
        content:' ';
        display:block;
        width:120px;
        height:32px;
        border-top:3px solid rgb(153, 27, 27);
      }
      .painted-empty::before {
        content:'';
        display:block;
        width:120px;
        height:32px;
        background:rgb(30, 120, 210);
      }
      .transparent-modern::before {
        content:' ';
        position:absolute;
        width:120px;
        height:32px;
        background:color(srgb 1 0 0 / none);
        border:3px solid oklch(60% 0.2 30 / none);
        box-shadow:0 4px 12px color(srgb 1 0 0 / none);
      }
      .zero-pixel::before {
        content:'';
        display:block;
        width:0;
        height:0;
        background:rgb(210, 30, 30);
      }
      .near-transparent::before {
        content:'';
        display:block;
        width:120px;
        height:32px;
        opacity:.001;
        background:rgb(210, 30, 30);
      }
      .off-capture::before {
        content:'';
        position:absolute;
        left:-10000px;
        top:0;
        width:120px;
        height:32px;
        background:rgb(210, 30, 30);
      }
      .masked-paint::before {
        content:'';
        display:block;
        width:120px;
        height:32px;
        -webkit-mask-image:linear-gradient(transparent, transparent);
        mask-image:linear-gradient(transparent, transparent);
        background:rgb(210, 30, 30);
      }
      .blended-paint::before {
        content:'';
        display:block;
        width:120px;
        height:32px;
        mix-blend-mode:difference;
        background:rgb(210, 30, 30);
      }
    </style>
    <main>
      <div class="geometry-only">Geometry only</div>
      <div class="bordered">Bordered decoration</div>
      <div class="painted-empty">Painted empty decoration</div>
      <div class="transparent-modern">Transparent modern decoration</div>
      <div class="zero-pixel">Zero pixel decoration</div>
      <div class="near-transparent">Near transparent decoration</div>
      <div class="off-capture">Off capture decoration</div>
      <div class="masked-paint">Masked decoration</div>
      <div class="blended-paint">Blended decoration</div>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')

  const pseudos = evidence.pseudoElements.filter((pseudo) => pseudo.kind === 'before')
  assert.equal(pseudos.length, 2)
  assert.ok(pseudos.some((pseudo) => pseudo.styles.borderTop === '3px solid rgb(153, 27, 27)'))
  assert.ok(pseudos.some((pseudo) => pseudo.styles.backgroundColor === 'rgb(30, 120, 210)'))
  assert.ok(
    pseudos.every(
      (pseudo) =>
        pseudo.paint &&
        pseudo.paint.paintedAreaPx > 16 &&
        pseudo.paint.captureIntersectionRatio > 0.02 &&
        pseudo.paint.opacity > 0.02 &&
        pseudo.paint.maskChain.length === 0 &&
        pseudo.paint.blendChain.length === 0,
    ),
  )
  await page.close()
})

test('excludes pseudo elements hidden by display, visibility, or opacity', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .display-hidden::after, .visibility-hidden::after, .opacity-hidden::after, .visible::after {
        content:'Tooltip';
        background:rgb(37, 41, 46);
        color:white;
      }
      .display-hidden::after { display:none; }
      .visibility-hidden::after { visibility:hidden; }
      .opacity-hidden::after { opacity:0; }
      .visible::after { display:inline; visibility:visible; opacity:1; }
    </style>
    <main>
      <button class="display-hidden">Display</button>
      <button class="visibility-hidden">Visibility</button>
      <button class="opacity-hidden">Opacity</button>
      <button class="visible">Visible</button>
    </main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const tooltips = evidence.pseudoElements.filter((pseudo) => pseudo.styles.content === '"Tooltip"')

  assert.equal(tooltips.length, 1)
  assert.match(tooltips[0].target, /button:nth-of-type\(4\)/)
  await page.close()
})

test('requires a material first-letter difference before recording pseudo evidence', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`<!doctype html>
    <style>
      main { min-height:200px; }
      .ordinary { line-height:normal; }
      .drop-cap::first-letter { float:left; font-size:48px; color:rgb(153, 27, 27); }
    </style>
    <main><p class="ordinary">Ordinary paragraph</p><p class="drop-cap">Editorial paragraph</p></main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const firstLetters = evidence.pseudoElements.filter((pseudo) => pseudo.kind === 'first-letter')

  assert.equal(firstLetters.length, 1)
  assert.match(firstLetters[0].target, /p:nth-of-type\(2\)/)
  await page.close()
})

test('applies the deep card limit after cheap candidate qualification', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { display:block; }
      .card { width:160px; height:72px; padding:8px; border:1px solid #ddd; border-radius:8px; }
    </style>
    <main id="content"></main>`)
  await page.evaluate(() => {
    const root = document.querySelector('#content')
    for (let index = 0; index < 1201; index += 1) {
      const span = document.createElement('span')
      span.textContent = String(index)
      root.append(span)
    }
    for (let index = 0; index < 2; index += 1) {
      const card = document.createElement('div')
      card.className = 'card'
      card.textContent = `Card ${index + 1}`
      root.append(card)
    }
  })

  const evidence = await extractPageEvidence(page, 'desktop')

  assert.equal(evidence.components.filter((component) => component.type === 'card').length, 2)
  await page.close()
})

test('keeps a strongly bounded one-off dashboard panel as card evidence', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; background:#f3f4f6; }
      main { padding:32px; }
      .dashboard-panel { width:520px; min-height:180px; padding:24px; border:1px solid #d1d5db; border-radius:16px; background:white; }
    </style>
    <main><section class="dashboard-panel"><h2>Creator overview</h2><p>This panel is unique but has a clear visual surface.</p><button>Open report</button></section></main>`)

  const evidence = await extractPageEvidence(page, 'desktop')
  const panels = evidence.components.filter((component) => component.type === 'card')

  assert.equal(panels.length, 1)
  assert.ok(panels[0].confidence >= 0.62)
  await page.close()
})

test('does not classify a full-width page section as a card component', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      body { margin:0; }
      .action-section { width:100%; padding:64px 24px; border-radius:48px 48px 0 0; background:#431407; color:white; text-align:center; }
    </style>
    <main><section class="action-section"><h2>Choose a path</h2><p>This is a page region, not a reusable card.</p><button>Continue</button></section></main>`)

  const patterns = await detectComponents(page)
  const evidence = await extractPageEvidence(page, 'desktop')

  assert.equal(
    patterns.some((component) => component.type === 'card'),
    false,
  )
  assert.equal(
    evidence.components.some((component) => component.type === 'card'),
    false,
  )
  await page.close()
})

test('bounds deep card geometry work instead of rescanning every sibling for every element', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html>
    <style>
      main { display:grid; grid-template-columns:repeat(4, 160px); gap:8px; }
      .card { width:160px; height:72px; padding:8px; border:1px solid #ddd; border-radius:8px; }
    </style>
    <main id="cards"></main>
    <script>
      const root = document.querySelector('#cards')
      for (let index = 0; index < 1600; index += 1) {
        const card = document.createElement('div')
        card.className = 'card'
        card.textContent = String(index)
        root.append(card)
      }
    </script>`)
  await page.evaluate(() => {
    const nativeRect = Element.prototype.getBoundingClientRect
    window.__imprintRectCalls = 0
    Element.prototype.getBoundingClientRect = function (...args) {
      window.__imprintRectCalls += 1
      return nativeRect.apply(this, args)
    }
  })

  const evidence = await extractPageEvidence(page, 'desktop')
  const rectCalls = await page.evaluate(() => window.__imprintRectCalls)

  assert.ok(rectCalls < 100_000, `expected bounded geometry work, observed ${rectCalls} rect reads`)
  assert.ok(evidence.components.filter((component) => component.type === 'card').length <= 250)
  await page.close()
})
