import { describe, expect, test } from 'vitest'

import { classifyPageKind, scorePageUrl } from '../../src/core/analyzer/page-discovery.js'
import { pageIdentityUrl } from '../../src/core/analyzer/url-identity.js'

describe('page discovery scoring', () => {
  const baseUrl = 'https://example.com/'

  test('does not infer page semantics from route language', () => {
    expect(classifyPageKind('/zh-CN/pricing')).toBe('generic')
    expect(classifyPageKind('/produits/tarifs')).toBe('generic')

    const pricing = scorePageUrl('/pricing', baseUrl, 20)
    const opaque = scorePageUrl('/x7q', baseUrl, 20)
    expect(pricing && { kind: pricing.kind, score: pricing.score }).toEqual(
      opaque && { kind: opaque.kind, score: opaque.score },
    )
  })

  test('rejects deceptive origins, non-document assets, and malformed URLs without route-word exclusions', () => {
    expect(scorePageUrl('https://example.com.evil.test/pricing', baseUrl)).toBeNull()
    expect(scorePageUrl('/signin', baseUrl)).not.toBeNull()
    expect(scorePageUrl('/legal/privacy', baseUrl)).not.toBeNull()
    expect(scorePageUrl('/brand/logo.svg', baseUrl)).toBeNull()
    expect(scorePageUrl('/enterprise"', baseUrl)).toBeNull()
    expect(scorePageUrl('/enterprise%22', baseUrl)).toBeNull()
    expect(scorePageUrl('/enterprise%2522', baseUrl)).toBeNull()
    expect(scorePageUrl('/enterprise%252522', baseUrl)).toBeNull()
  })

  test('does not assume that localized or conventional-looking route names are error pages', () => {
    expect(scorePageUrl('/404.html', baseUrl)).not.toBeNull()
    expect(scorePageUrl('/not-found', baseUrl)).not.toBeNull()
    expect(scorePageUrl('/page-not-found/', baseUrl)).not.toBeNull()
    expect(scorePageUrl('/guides/http-404-errors', baseUrl)).not.toBeNull()
    expect(scorePageUrl('/guides/404/handling', baseUrl)).not.toBeNull()
  })

  test('preserves query-addressed documents while dropping fragment-only state', () => {
    const page = scorePageUrl('/features?utm_source=test#hero', baseUrl)
    expect(page?.url).toBe('https://example.com/features?utm_source=test')
    expect(page?.kind).toBe('generic')

    expect(scorePageUrl('/?page=pricing', 'https://example.com/?page=home')?.url).toBe(
      'https://example.com/?page=pricing',
    )
    expect(scorePageUrl('/app?view=pricing', 'https://example.com/app?view=home')?.url).toBe(
      'https://example.com/app?view=pricing',
    )
    expect(scorePageUrl('/app?view=home#details', 'https://example.com/app?view=home')).toBeNull()
  })

  test('uses full query order and repeated keys as crawl identity without exposing credentials', () => {
    expect(pageIdentityUrl('https://user:secret@example.com/app?a=1&a=2&b=3#part')).toBe(
      'https://example.com/app?a=1&a=2&b=3',
    )
    expect(pageIdentityUrl('https://example.com/app?a=1&b=2')).not.toBe(
      pageIdentityUrl('https://example.com/app?b=2&a=1'),
    )
    expect(pageIdentityUrl('https://example.com/app?a=1#first')).toBe(
      pageIdentityUrl('https://example.com/app?a=1#second'),
    )
  })

  test('applies identical scoring rules across hostnames', () => {
    const first = scorePageUrl('/products/editor', 'https://alpha.test/people/sample', 12)
    const second = scorePageUrl('/products/editor', 'https://beta.test/people/sample', 12)

    expect(first && { kind: first.kind, score: first.score }).toEqual(
      second && { kind: second.kind, score: second.score },
    )
  })

  test('uses structural depth and DOM location instead of route vocabulary', () => {
    const question = scorePageUrl('/question/123456/answer/987654', baseUrl, 24)
    const contact = scorePageUrl('/contact', baseUrl, -20)
    const community = scorePageUrl('/community', baseUrl, -20)

    expect(question?.kind).toBe('generic')
    expect(question!.score).toBeGreaterThan(contact!.score)
    expect(question!.score).toBeGreaterThan(community!.score)
    expect(contact!.score).toBeLessThan(90)
    expect(community!.score).toBeLessThan(90)
  })
})
