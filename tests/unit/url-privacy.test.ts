import { describe, expect, it } from 'vitest'

import type { DesignToken } from '../../src/core/analyzer/types.js'
import {
  redactUrlsInText,
  sanitizeDesignEvidenceForPersistence,
  sanitizeDesignTokensForPersistence,
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
  })

  it('redacts token provenance page URLs', () => {
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
          sources: ['computed-style'],
          reasons: ['computed-style'],
        },
      },
    } satisfies DesignToken

    expect(sanitizeDesignTokensForPersistence(tokens).evidence?.['colors.primary'].pages).toEqual([
      'https://example.com/path',
    ])
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
