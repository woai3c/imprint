import { describe, expect, test } from 'vitest'

import { buildAnalysisArtifacts } from '../../src/core/analysis-artifacts.js'
import { type BuildAnalysisOutputInput, buildAnalysisOutput } from '../../src/core/analyzer/analysis-output.js'
import type { AnalysisResult, ExtractedStyles } from '../../src/core/analyzer/types.js'
import { canonicalEvidencePageIds } from '../../src/core/design-evidence/canonical-pages.js'
import type { CapturedPageEvidence } from '../../src/core/design-evidence/index.js'
import type { PageEvidenceSnapshot } from '../../src/core/design-evidence/page-extractor.js'
import { createExtractedStyles } from './analyzer-fixtures.js'

function textPaintSource(foreground: string) {
  return {
    kind: 'direct-text' as const,
    widthPx: 160,
    heightPx: 24,
    visibleWidthPx: 160,
    visibleHeightPx: 24,
    paintedAreaPx: 3840,
    captureIntersectionRatio: 1,
    effectiveClipPathAreaRatio: 1,
    ancestorClipCount: 0,
    clientRectCount: 1,
    glyphRectCount: 1,
    visibleBounds: { xPx: 0, yPx: 0, widthPx: 160, heightPx: 24 },
    visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 160, heightPx: 24 }],
    visibleGlyphAreaPx: 3840,
    clipPathChain: [],
    nonRectangularClipPathCount: 0,
    clip: 'auto',
    clipPath: 'none',
    contentVisibility: 'visible',
    opacity: 1,
    filterOpacity: 1,
    filterChain: [],
    maskChain: [],
    blendChain: [],
    textIndentPx: 0,
    filter: 'none',
    glyphPaintKind: 'solid-color' as const,
    foreground,
  }
}

function fontStyles(family: string): ExtractedStyles {
  const stack = `${family}, sans-serif`
  const ownerIds = [`${family}-copy-1`, `${family}-copy-2`]
  return createExtractedStyles({
    fontFamilies: [stack],
    usageCount: { [`fontTextFamily:${stack}`]: ownerIds.length },
    usageOwnerCounts: { [`fontTextFamily:${stack}`]: ownerIds.length },
    usageOwnerIds: { [`fontTextFamily:${stack}`]: ownerIds },
    valueSources: { [`fontTextFamily:${stack}`]: ['rendered:text'] },
    valueSourceCounts: { [`fontTextFamily:${stack}`]: { 'rendered:text': ownerIds.length } },
    renderedTextStyleObservations: ownerIds.map((ownerId) => ({
      ownerId,
      textRole: 'body',
      styles: {
        color: '#111111',
        backgroundColor: '#ffffff',
        fontFamily: stack,
        fontSize: '16px',
        fontWeight: '400',
        lineHeight: '24px',
        letterSpacing: 'normal',
      },
      source: textPaintSource('#111111'),
    })),
  })
}

function capturedPage(
  viewport: 'desktop' | 'mobile',
  severeOverflow: boolean,
  captureKey: string,
  url = 'https://example.com/',
): CapturedPageEvidence {
  const viewportWidth = viewport === 'desktop' ? 1440 : 375
  const contentWidth = severeOverflow ? 4000 : viewportWidth
  const snapshot: PageEvidenceSnapshot = {
    url,
    viewport,
    role: 'landing',
    viewportWidth,
    viewportHeight: viewport === 'desktop' ? 900 : 812,
    width: contentWidth,
    height: 1200,
    contentWidth,
    horizontalOverflow: severeOverflow,
    horizontalOverflowSources: severeOverflow
      ? [{ locator: 'body > main', overflowPx: contentWidth - viewportWidth, width: contentWidth, position: 'static' }]
      : [],
    sections: [],
    components: [],
    layoutNodes: [],
    mediaLayers: [],
    interactionCandidates: [],
    ariaStates: [],
  }
  return {
    captureKey,
    screenshot: {
      url: snapshot.url,
      viewport,
      path: `/tmp/imprint-analysis-output-${viewport}.png`,
      width: viewportWidth,
      height: snapshot.viewportHeight,
      valid: false,
    },
    snapshot,
    ...(viewport === 'mobile' ? { captureScope: 'supplemental' as const } : {}),
    health: {
      status: 'healthy',
      checkedAt: '2026-09-03T00:00:00.000Z',
      recovered: false,
      attempts: 1,
      viewport: { width: viewportWidth, height: snapshot.viewportHeight },
      content: { width: contentWidth, height: snapshot.height },
      overlayAreaRatio: 0,
      mutationCount: 0,
      evidenceEligible: true,
      issues: severeOverflow
        ? [
            {
              code: 'horizontal-overflow',
              severity: 'warning',
              recoverable: false,
              detail: 'controlled severe overflow',
            },
          ]
        : [],
    },
  }
}

function outputInput(reverse: boolean): BuildAnalysisOutputInput {
  const desktopStyles = fontStyles('Georgia')
  const mobileStyles = fontStyles('Inter')
  const desktopCapture = capturedPage('desktop', true, 'entry-desktop')
  const mobileCapture = capturedPage('mobile', false, 'entry-mobile')
  const styleCaptures = [
    {
      captureKey: desktopCapture.captureKey,
      url: desktopCapture.snapshot.url,
      viewport: 'desktop',
      styles: desktopStyles,
    },
    { captureKey: mobileCapture.captureKey, url: mobileCapture.snapshot.url, viewport: 'mobile', styles: mobileStyles },
  ]
  const captures = [desktopCapture, mobileCapture]
  if (reverse) {
    styleCaptures.reverse()
    captures.reverse()
  }
  return {
    analysisId: `canonical-style-${reverse ? 'reverse' : 'forward'}`,
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    accessMode: 'anonymous',
    authWallDetected: false,
    expectedPageCount: 1,
    expectedViewports: ['desktop'],
    expectedCaptureCount: 1,
    styles: styleCaptures.map((capture) => capture.styles),
    styleCaptures,
    evidenceEligibleStyles: styleCaptures.map((capture) => capture.styles),
    evidenceEligibleStyleCaptures: styleCaptures,
    extractionIssues: [],
    limitations: [],
    interactionStyles: { hover: [], focus: [], active: [], disabled: [] },
    breakpoints: [],
    motion: [],
    captures,
  }
}

describe('analysis output canonical style evidence', () => {
  test('uses the healthy mobile fallback instead of a severely overflowing desktop capture', () => {
    for (const reverse of [false, true]) {
      const output = buildAnalysisOutput(outputInput(reverse))
      const fontEvidence = output.tokens.evidence?.['typography.fontFamilies.0']
      const canonicalPageIds = canonicalEvidencePageIds(output.designEvidence)

      expect(output.tokens.typography.fontFamilies).toEqual(['Inter'])
      expect(output.tokens.typography.fontStacks).toEqual(['Inter, sans-serif'])
      expect(fontEvidence?.renderedTextOwners).toHaveLength(2)
      expect(fontEvidence?.renderedTextOwners?.every((owner) => owner.viewport === 'mobile')).toBe(true)
      expect(
        output.designEvidence.pages.filter((page) => canonicalPageIds.has(page.id)).map((page) => page.viewport),
      ).toEqual(['mobile'])
    }
  })

  test('binds duplicate final URL captures to their exact transaction independent of array order', () => {
    const healthyStyles = fontStyles('Inter')
    const severeStyles = fontStyles('Georgia')
    const healthyCapture = capturedPage('desktop', false, 'redirect-healthy')
    const severeCapture = capturedPage('desktop', true, 'redirect-severe')
    const originalStyleCaptures = [
      {
        captureKey: healthyCapture.captureKey,
        url: healthyCapture.snapshot.url,
        viewport: 'desktop',
        styles: healthyStyles,
      },
      {
        captureKey: severeCapture.captureKey,
        url: severeCapture.snapshot.url,
        viewport: 'desktop',
        styles: severeStyles,
      },
    ]
    for (const reverseStyles of [false, true]) {
      for (const reversePages of [false, true]) {
        const styleCaptures = reverseStyles ? [...originalStyleCaptures].reverse() : [...originalStyleCaptures]
        const captures = reversePages ? [severeCapture, healthyCapture] : [healthyCapture, severeCapture]
        const input = outputInput(false)
        const output = buildAnalysisOutput({
          ...input,
          styles: styleCaptures.map((capture) => capture.styles),
          styleCaptures,
          evidenceEligibleStyles: styleCaptures.map((capture) => capture.styles),
          evidenceEligibleStyleCaptures: styleCaptures,
          captures,
        })

        expect(output.tokens.typography.fontFamilies).toEqual(['Inter'])
        expect(output.tokens.evidence?.['typography.fontFamilies.0'].renderedTextOwners).toHaveLength(2)
        expect(output.designEvidence.pages).toHaveLength(1)
        expect(output.designEvidence.pages[0].horizontalOverflow).toBe(false)
        expect(output.designEvidence.pages[0].captureKey).toBe('redirect-healthy')
        expect(JSON.stringify(output.designEvidence)).not.toContain('captureKey')
      }
    }
  })

  test('does not bind an unkeyed style to either side of a keyed duplicate transaction', () => {
    const healthyCapture = capturedPage('desktop', false, 'redirect-healthy')
    const severeCapture = capturedPage('desktop', true, 'redirect-severe')
    const unkeyedStyle = {
      url: healthyCapture.snapshot.url,
      viewport: 'desktop',
      styles: fontStyles('Georgia'),
    }

    for (const captures of [
      [healthyCapture, severeCapture],
      [severeCapture, healthyCapture],
    ]) {
      const input = outputInput(false)
      const output = buildAnalysisOutput({
        ...input,
        styles: [unkeyedStyle.styles],
        styleCaptures: [unkeyedStyle],
        evidenceEligibleStyles: [unkeyedStyle.styles],
        evidenceEligibleStyleCaptures: [unkeyedStyle],
        captures,
      })

      expect(output.tokens.typography.fontFamilies).toEqual([])
      expect(output.designEvidence.pages).toHaveLength(1)
      expect(output.designEvidence.pages[0].captureKey).toBe('redirect-healthy')
    }
  })

  test.each([
    {
      label: 'only the page has a transaction key',
      pageKey: 'page-key',
      styleKey: undefined,
    },
    {
      label: 'only the style has a transaction key',
      pageKey: undefined,
      styleKey: 'style-key',
    },
  ])('fails closed when $label', ({ pageKey, styleKey }) => {
    const page = capturedPage('desktop', false, pageKey || 'temporary')
    page.captureKey = pageKey
    const styles = fontStyles('Georgia')
    const input = outputInput(false)
    const output = buildAnalysisOutput({
      ...input,
      styles: [styles],
      styleCaptures: [
        { ...(styleKey ? { captureKey: styleKey } : {}), url: page.snapshot.url, viewport: 'desktop', styles },
      ],
      evidenceEligibleStyles: [styles],
      evidenceEligibleStyleCaptures: [
        { ...(styleKey ? { captureKey: styleKey } : {}), url: page.snapshot.url, viewport: 'desktop', styles },
      ],
      captures: [page],
    })

    expect(output.tokens.typography.fontFamilies).toEqual([])
    expect(output.designEvidence.pages).toHaveLength(1)
  })

  test('fails closed on duplicate transaction keys on either side of the join', () => {
    const styles = fontStyles('Georgia')
    const page = capturedPage('desktop', false, 'duplicate-key')
    const secondPage = structuredClone(page)
    const input = outputInput(false)

    const duplicatePages = buildAnalysisOutput({
      ...input,
      styles: [styles],
      styleCaptures: [{ captureKey: 'duplicate-key', url: page.snapshot.url, viewport: 'desktop', styles }],
      evidenceEligibleStyles: [styles],
      evidenceEligibleStyleCaptures: [
        { captureKey: 'duplicate-key', url: page.snapshot.url, viewport: 'desktop', styles },
      ],
      captures: [page, secondPage],
    })
    const duplicateStyles = buildAnalysisOutput({
      ...input,
      styles: [styles, styles],
      styleCaptures: [
        { captureKey: 'duplicate-key', url: page.snapshot.url, viewport: 'desktop', styles },
        { captureKey: 'duplicate-key', url: page.snapshot.url, viewport: 'desktop', styles },
      ],
      evidenceEligibleStyles: [styles, styles],
      evidenceEligibleStyleCaptures: [
        { captureKey: 'duplicate-key', url: page.snapshot.url, viewport: 'desktop', styles },
        { captureKey: 'duplicate-key', url: page.snapshot.url, viewport: 'desktop', styles },
      ],
      captures: [page],
    })

    expect(duplicatePages.designEvidence.pages).toEqual([])
    expect(duplicatePages.tokens.typography.fontFamilies).toEqual([])
    expect(duplicateStyles.tokens.typography.fontFamilies).toEqual([])
  })

  test.each([
    ['screenshot URL', (page: CapturedPageEvidence) => (page.screenshot.url = 'https://other.example/')] as const,
    ['screenshot viewport', (page: CapturedPageEvidence) => (page.screenshot.viewport = 'mobile')] as const,
  ])('discards a transaction with a mismatched %s', (_label, mutate) => {
    const page = capturedPage('desktop', false, 'mismatched-page')
    const styles = fontStyles('Georgia')
    mutate(page)
    const input = outputInput(false)
    const output = buildAnalysisOutput({
      ...input,
      styles: [styles],
      styleCaptures: [{ captureKey: page.captureKey, url: page.snapshot.url, viewport: 'desktop', styles }],
      evidenceEligibleStyles: [styles],
      evidenceEligibleStyleCaptures: [
        { captureKey: page.captureKey, url: page.snapshot.url, viewport: 'desktop', styles },
      ],
      captures: [page],
    })

    expect(output.tokens.typography.fontFamilies).toEqual([])
    expect(output.designEvidence.pages).toEqual([])
  })

  test('keeps a matching keyed dark capture for a raw query-bearing Evidence route', () => {
    const sourceUrl = 'https://example.com/?access_token=private-value#panel'
    const page = capturedPage('desktop', false, 'query-entry-desktop', sourceUrl)
    const styles = fontStyles('Inter')
    const input = outputInput(false)
    const output = buildAnalysisOutput({
      ...input,
      requestedUrl: sourceUrl,
      finalUrl: sourceUrl,
      styles: [styles],
      styleCaptures: [{ captureKey: page.captureKey, url: sourceUrl, viewport: 'desktop', styles }],
      evidenceEligibleStyles: [styles],
      evidenceEligibleStyleCaptures: [{ captureKey: page.captureKey, url: sourceUrl, viewport: 'desktop', styles }],
      captures: [page],
    })
    const result = {
      analysisId: input.analysisId,
      ...output,
      screenshots: [],
      pageScreenshots: [],
      interactions: input.interactionStyles,
      darkMode: {
        hasDarkMode: true,
        method: 'media-query',
        source: { captureKey: page.captureKey, url: sourceUrl, viewport: 'desktop' },
        darkStyles: styles,
      },
      components: [],
      breakpoints: [],
      motion: [],
      duration: 0,
      timing: {},
      accessMode: 'anonymous',
      authWallDetected: false,
      finalUrl: sourceUrl,
      extractionIssues: [],
      pageCoverage: { requested: 1, discovered: 0, selected: 0, analyzed: 1, pages: [] },
      captureManifest: {},
      completion: { reason: 'complete' },
    } as AnalysisResult

    const artifacts = buildAnalysisArtifacts(result, { sourceUrl })
    const publicArtifacts = [
      artifacts.designDoc,
      artifacts.dtcgJson,
      artifacts.evidenceJson,
      artifacts.profileJson,
      artifacts.componentSpecsJson,
      artifacts.visualQaJson,
      artifacts.cssVariables,
      artifacts.tailwindTheme,
      artifacts.scssVariables,
    ].join('\n')

    expect(artifacts.darkMode).toBeDefined()
    expect(publicArtifacts).not.toContain('private-value')
    expect(publicArtifacts).not.toContain('captureKey')
  })

  test('does not export dark styles from the losing duplicate transaction', () => {
    const healthyCapture = capturedPage('desktop', false, 'redirect-healthy')
    const severeCapture = capturedPage('desktop', true, 'redirect-severe')
    const healthyStyles = fontStyles('Inter')
    const severeStyles = fontStyles('Georgia')
    const input = outputInput(false)
    const output = buildAnalysisOutput({
      ...input,
      styles: [healthyStyles, severeStyles],
      styleCaptures: [
        {
          captureKey: healthyCapture.captureKey,
          url: healthyCapture.snapshot.url,
          viewport: 'desktop',
          styles: healthyStyles,
        },
        {
          captureKey: severeCapture.captureKey,
          url: severeCapture.snapshot.url,
          viewport: 'desktop',
          styles: severeStyles,
        },
      ],
      evidenceEligibleStyles: [healthyStyles, severeStyles],
      evidenceEligibleStyleCaptures: [
        {
          captureKey: healthyCapture.captureKey,
          url: healthyCapture.snapshot.url,
          viewport: 'desktop',
          styles: healthyStyles,
        },
        {
          captureKey: severeCapture.captureKey,
          url: severeCapture.snapshot.url,
          viewport: 'desktop',
          styles: severeStyles,
        },
      ],
      captures: [healthyCapture, severeCapture],
    })
    const resultBase = {
      analysisId: input.analysisId,
      ...output,
      screenshots: [],
      pageScreenshots: [],
      interactions: input.interactionStyles,
      components: [],
      breakpoints: [],
      motion: [],
      duration: 0,
      timing: {},
      accessMode: 'anonymous',
      authWallDetected: false,
      finalUrl: input.finalUrl,
      extractionIssues: [],
      pageCoverage: { requested: 1, discovered: 0, selected: 0, analyzed: 1, pages: [] },
      captureManifest: {},
      completion: { reason: 'complete' },
    }

    for (const captureKey of [severeCapture.captureKey, undefined]) {
      const result = {
        ...resultBase,
        darkMode: {
          hasDarkMode: true,
          method: 'media-query',
          source: {
            ...(captureKey ? { captureKey } : {}),
            url: severeCapture.snapshot.url,
            viewport: 'desktop',
          },
          darkStyles: severeStyles,
        },
      } as AnalysisResult
      const artifacts = buildAnalysisArtifacts(result, { sourceUrl: input.requestedUrl })

      expect(artifacts.darkMode).toBeUndefined()
      expect(artifacts.designDoc).not.toContain('Georgia')
      expect(artifacts.cssVariables).not.toContain('Georgia')
      expect(artifacts.tailwindTheme).not.toContain('Georgia')
      expect(artifacts.scssVariables).not.toContain('Georgia')
      expect(artifacts.dtcgJson).not.toContain('Georgia')
      expect(artifacts.evidenceJson).not.toContain('captureKey')
    }
  })
})
