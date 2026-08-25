import { describe, expect, it } from 'vitest'

import {
  AnalysisRequestError,
  MAX_ANALYSIS_PAGE_COUNT,
  createAnalysisRequest,
} from '../../src/core/analyzer/analysis-request.js'

describe('versioned analysis request', () => {
  it('normalizes the core defaults into an explicit request', () => {
    expect(createAnalysisRequest({ url: ' https://example.test/catalog?view=full#details ' })).toEqual({
      schemaVersion: '2',
      url: 'https://example.test/catalog?view=full#details',
      viewports: ['desktop', 'mobile'],
      pageMode: 'bounded',
      maxPages: 8,
      authMode: 'managed',
      extractDarkMode: true,
      depth: 'standard',
      pageDiscovery: 'auto',
    })
  })

  it('allows an entry point to declare different defaults without changing the schema', () => {
    const request = createAnalysisRequest(
      { url: 'http://127.0.0.1:4173', depth: 'deep' },
      {
        viewports: ['desktop', 'tablet', 'mobile'],
        maxPages: 2,
        authMode: 'auto',
        extractDarkMode: false,
        depth: 'standard',
        pageDiscovery: 'links',
      },
    )

    expect(request).toMatchObject({
      schemaVersion: '2',
      viewports: ['desktop', 'tablet', 'mobile'],
      pageMode: 'bounded',
      maxPages: 2,
      authMode: 'auto',
      extractDarkMode: false,
      depth: 'deep',
      pageDiscovery: 'links',
    })
  })

  it('maps the legacy no-session option to anonymous access', () => {
    expect(createAnalysisRequest({ url: 'https://example.test', useSession: false }).authMode).toBe('anonymous')
  })

  it('accepts the maximum supported page bound', () => {
    expect(createAnalysisRequest({ url: 'https://example.test', maxPages: MAX_ANALYSIS_PAGE_COUNT })).toMatchObject({
      pageMode: 'bounded',
      maxPages: 20,
    })
  })

  it('deduplicates valid viewports while preserving requested order', () => {
    expect(
      createAnalysisRequest({ url: 'https://example.test', viewports: ['mobile', 'desktop', 'mobile'] }).viewports,
    ).toEqual(['mobile', 'desktop'])
  })

  it.each([
    { input: { url: 'file:///tmp/page.html' }, code: 'invalid-url' },
    { input: { url: 'https://example.test', viewports: [] }, code: 'invalid-viewports' },
    { input: { url: 'https://example.test', viewports: ['wide'] }, code: 'invalid-viewports' },
    { input: { url: 'https://example.test', maxPages: 1.5 }, code: 'invalid-page-count' },
    { input: { url: 'https://example.test', maxPages: 0 }, code: 'invalid-page-count' },
    { input: { url: 'https://example.test', maxPages: 21 }, code: 'invalid-page-count' },
    { input: { url: 'https://example.test', maxPages: Number.MAX_SAFE_INTEGER + 1 }, code: 'invalid-page-count' },
    { input: { url: 'https://example.test', authMode: 'prompt' }, code: 'invalid-auth-mode' },
    { input: { url: 'https://example.test', extractDarkMode: 'yes' }, code: 'invalid-dark-mode' },
    { input: { url: 'https://example.test', depth: 'exhaustive' }, code: 'invalid-depth' },
    { input: { url: 'https://example.test', pageDiscovery: 'random' }, code: 'invalid-page-discovery' },
  ])('rejects $code instead of silently changing semantics', ({ input, code }) => {
    try {
      createAnalysisRequest(input as Parameters<typeof createAnalysisRequest>[0])
      throw new Error('Expected request validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(AnalysisRequestError)
      expect((error as AnalysisRequestError).code).toBe(code)
    }
  })
})
