import { describe, expect, test } from 'vitest'

import { classifyPageKind, scorePageUrl } from '../../src/core/analyzer/page-discovery.js'

describe('page discovery scoring', () => {
  const baseUrl = 'https://example.com/'

  test('classifies useful localized routes and prioritizes navigational product pages', () => {
    expect(classifyPageKind('/zh-CN/pricing')).toBe('pricing')
    expect(classifyPageKind('/en/docs/getting-started')).toBe('docs')

    const pricing = scorePageUrl('/pricing', baseUrl, 20)
    const generic = scorePageUrl('/miscellaneous/deep/page', baseUrl)
    expect(pricing!.score).toBeGreaterThan(generic!.score)
  })

  test('rejects deceptive origins, authentication routes, legal pages, and assets', () => {
    expect(scorePageUrl('https://example.com.evil.test/pricing', baseUrl)).toBeNull()
    expect(scorePageUrl('/signin', baseUrl)).toBeNull()
    expect(scorePageUrl('/legal/privacy', baseUrl)).toBeNull()
    expect(scorePageUrl('/brand/logo.svg', baseUrl)).toBeNull()
  })

  test('normalizes tracking parameters and fragments before deduplication', () => {
    const page = scorePageUrl('/features?utm_source=test#hero', baseUrl)
    expect(page?.url).toBe('https://example.com/features')
    expect(page?.kind).toBe('product')
  })

  test('recognizes content-platform routes and demotes footer-only utility pages', () => {
    const question = scorePageUrl('/question/123456/answer/987654', baseUrl, 12)
    const contact = scorePageUrl('/contact', baseUrl, -20)
    const community = scorePageUrl('/community', baseUrl, -20)

    expect(question?.kind).toBe('content')
    expect(question!.score).toBeGreaterThan(contact!.score)
    expect(question!.score).toBeGreaterThan(community!.score)
    expect(contact!.score).toBeLessThan(90)
    expect(community!.score).toBeLessThan(90)
  })
})
