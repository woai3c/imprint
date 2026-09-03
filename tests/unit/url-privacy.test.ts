import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import {
  formatExtractionIssueDiagnosticsForDisplay,
  redactUrlsInText,
  sanitizeDesignEvidenceForPersistence,
  sanitizeDesignTokensForPersistence,
  sanitizeDiagnosticTextForDisplay,
  sanitizeUrlForPersistence,
} from '../../src/core/analyzer/url-privacy.js'
import type { DesignEvidence } from '../../src/core/design-evidence/types.js'

describe('URL privacy', () => {
  it('removes credentials, query parameters, and fragments while retaining the route', () => {
    expect(sanitizeUrlForPersistence('https://user:secret@example.com/private/path?token=secret#account')).toBe(
      'https://example.com/private/path',
    )
  })

  it('redacts embedded URLs without swallowing sentence punctuation', () => {
    expect(redactUrlsInText('Failed at https://user:secret@example.com/path?token=secret, retry.')).toBe(
      'Failed at https://example.com/path, retry.',
    )
    expect(redactUrlsInText('Proxy socks5://user:secret@127.0.0.1:1080?token=secret')).toBe(
      'Proxy socks5://127.0.0.1:1080',
    )
    expect(redactUrlsInText('来源 https://example.com/path?token=secret：检测到横向溢出')).toBe(
      '来源 https://example.com/path：检测到横向溢出',
    )
  })

  it('removes terminal formatting from diagnostic text', () => {
    const escape = String.fromCharCode(27)
    expect(
      sanitizeDiagnosticTextForDisplay(
        `page.goto: Timeout 20000ms exceeded.\n${escape}[2m - waiting for https://example.test/path?token=secret${escape}[22m`,
      ),
    ).toBe('page.goto: Timeout 20000ms exceeded.\n - waiting for https://example.test/path')
  })

  it('redacts a complete diagnostic URL when its path contains a legal apostrophe', () => {
    const requestUrl = "http://demo:secret@127.0.0.1:9/foo'bar?token=synthetic#fragment"
    const diagnostic = `connect failed at ${requestUrl}`

    expect(sanitizeDiagnosticTextForDisplay(diagnostic, [requestUrl])).toBe(
      "connect failed at http://127.0.0.1:9/foo'bar",
    )
    expect(sanitizeDiagnosticTextForDisplay(diagnostic)).not.toContain('synthetic')
    expect(sanitizeDiagnosticTextForDisplay(diagnostic)).not.toContain('fragment')
  })

  it('formats bounded, deduplicated, and sanitized capture diagnostics', () => {
    const requestUrl = 'https://user:secret@example.com/private?token=secret'
    const diagnostics = formatExtractionIssueDiagnosticsForDisplay(
      [
        { stage: 'page-1:desktop:health:large-overlay', reason: `blocked at ${requestUrl}` },
        { stage: 'page-1:desktop:health:large-overlay', reason: `blocked at ${requestUrl}` },
        { stage: 'page-1:desktop:navigation', reason: 'navigation failed' },
      ],
      [requestUrl],
      2,
    )

    expect(diagnostics).toBe(
      'page-1:desktop:health:large-overlay: blocked at https://example.com/private\npage-1:desktop:navigation: navigation failed',
    )
    expect(diagnostics).not.toContain('secret')
  })

  it('redacts token provenance page URLs', () => {
    const renderedTextOwner = {
      ownerId: 'body > p:nth-of-type(1)',
      textRole: 'body' as const,
      styles: {
        color: 'rgb(18, 52, 86)',
        fontFamily: 'Inter, sans-serif',
        fontSize: '16px',
        fontWeight: '400',
        lineHeight: '24px',
        letterSpacing: 'normal',
      },
      source: {
        kind: 'direct-text' as const,
        widthPx: 120,
        heightPx: 24,
        visibleWidthPx: 120,
        visibleHeightPx: 24,
        paintedAreaPx: 2880,
        captureIntersectionRatio: 1,
        effectiveClipPathAreaRatio: 1,
        ancestorClipCount: 0,
        clientRectCount: 1,
        glyphRectCount: 1,
        visibleBounds: { xPx: 0, yPx: 0, widthPx: 120, heightPx: 24 },
        visibleGlyphRects: [{ xPx: 0, yPx: 0, widthPx: 120, heightPx: 24 }],
        visibleGlyphAreaPx: 2880,
        clip: 'auto',
        clipPath: 'none',
        contentVisibility: 'visible',
        opacity: 1,
        textIndentPx: 0,
        foreground: 'rgb(18, 52, 86)',
      },
      page: 'https://example.com/path?owner=secret',
      routeId: 'route-aaaaaaaaaaaa',
      viewport: 'desktop',
    }
    const tokens = {
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: [],
      radii: [],
      shadows: [],
      borders: [],
      zIndices: [],
      transitions: [],
      evidence: {
        'colors.primary': {
          value: '#123456',
          confidence: 'high',
          observationCount: 1,
          pageCount: 1,
          captureCount: 1,
          pages: ['https://example.com/path?token=secret'],
          renderedTextOwners: [renderedTextOwner],
          pairedSurface: {
            background: '#ffffff',
            pageCount: 1,
            eligiblePageCount: 1,
            pageSupportRatio: 1,
            normalizedShare: 1,
            normalizedMainTextShare: 1,
            ownerCount: 1,
            minimumPageOwnerCount: 1,
            mainTextPageCount: 1,
            mainTextOwnerCount: 1,
            headingPageCount: 0,
            headingOwnerCount: 0,
            contrastRatio: 12.72,
            textRoles: ['body'],
            routeSupport: [
              {
                page: 'https://example.com/path?pair=secret',
                routeId: 'route-bbbbbbbbbbbb',
                supported: true,
                ownerIds: ['body > p:nth-of-type(1)'],
                totalOwnerIds: ['body > p:nth-of-type(1)'],
                mainTextOwnerIds: ['body > p:nth-of-type(1)'],
                headingOwnerIds: [],
                textRoles: ['body'],
                normalizedShare: 1,
                normalizedMainTextShare: 1,
              },
            ],
          },
          sources: ['computed-style'],
          reasons: ['computed-style'],
        },
      },
      candidates: {
        values: [
          {
            group: 'typography.fontFamilies',
            value: 'Inter',
            rejectionReason: 'local-scope',
            evidence: {
              value: 'Inter',
              confidence: 'low',
              observationCount: 1,
              pageCount: 1,
              captureCount: 1,
              pages: ['https://example.com/path?candidate=secret'],
              renderedTextOwners: [{ ...renderedTextOwner, page: 'https://example.com/path?candidate-owner=secret' }],
              sources: ['rendered:text'],
              reasons: ['rendered-use'],
            },
          },
        ],
      },
    } satisfies DesignToken

    const sanitized = sanitizeDesignTokensForPersistence(tokens)
    expect(sanitized.evidence?.['colors.primary'].pages).toEqual(['https://example.com/path'])
    expect(sanitized.evidence?.['colors.primary'].renderedTextOwners?.[0].page).toBe('https://example.com/path')
    expect(sanitized.evidence?.['colors.primary'].renderedTextOwners?.[0].routeId).toBe('route-aaaaaaaaaaaa')
    expect(sanitized.evidence?.['colors.primary'].pairedSurface?.routeSupport[0].page).toBe('https://example.com/path')
    expect(sanitized.evidence?.['colors.primary'].pairedSurface?.routeSupport[0].routeId).toBe('route-bbbbbbbbbbbb')
    expect(sanitized.candidates?.values?.[0].evidence.pages).toEqual(['https://example.com/path'])
    expect(sanitized.candidates?.values?.[0].evidence.renderedTextOwners?.[0].page).toBe('https://example.com/path')
  })

  it('redacts color-role capture IDs while preserving their viewport suffix', () => {
    const tokens = {
      colors: { primary: '#123456' },
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: [],
      radii: [],
      shadows: [],
      borders: [],
      zIndices: [],
      transitions: [],
      colorRoles: {
        primaryAction: {
          observedBackground: '#123456',
          provenance: [
            {
              captureId: 'https://user:secret@example.com/path?token=secret#panel|1440x900',
              elementRef: 'button',
              elementKind: 'button',
              role: 'primary-action',
            },
          ],
        },
      },
    } satisfies DesignToken

    expect(sanitizeDesignTokensForPersistence(tokens).colorRoles?.primaryAction?.provenance[0].captureId).toBe(
      'https://example.com/path|1440x900',
    )
  })

  it('redacts evidence source, page, and nested token provenance URLs', () => {
    const tokens = sanitizeDesignTokensForPersistence({
      colors: {},
      typography: {
        fontFamilies: [],
        fontStacks: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
      },
      spacing: [],
      radii: [],
      shadows: [],
      borders: [],
      zIndices: [],
      transitions: [],
    })
    const evidence = {
      source: {
        requestedUrl: 'https://user:secret@example.com/path?token=secret',
        finalUrl: 'https://example.com/path?session=secret#panel',
      },
      pages: [
        {
          url: 'https://example.com/path?session=secret',
          health: {
            status: 'degraded',
            checkedAt: '2026-08-17T00:00:00.000Z',
            recovered: false,
            attempts: 2,
            viewport: { width: 1440, height: 900 },
            content: { width: 1440, height: 1800 },
            overlayAreaRatio: 0,
            mutationCount: 0,
            evidenceEligible: false,
            issues: [
              {
                code: 'health-recovery-failed',
                severity: 'warning',
                recoverable: false,
                detail: 'Navigation failed at https://user:secret@example.com/path?session=secret#panel',
              },
            ],
          },
        },
      ],
      tokens,
    } as DesignEvidence

    expect(sanitizeDesignEvidenceForPersistence(evidence)).toMatchObject({
      source: {
        requestedUrl: 'https://example.com/path',
        finalUrl: 'https://example.com/path',
      },
      pages: [
        {
          url: 'https://example.com/path',
          health: {
            issues: [
              {
                detail: 'Navigation failed at https://example.com/path',
              },
            ],
          },
        },
      ],
    })
  })
})
