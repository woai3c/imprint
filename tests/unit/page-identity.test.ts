import { describe, expect, test } from 'vitest'

import {
  pageIdentityFromMetadata,
  resolveDesignSystemName,
  sanitizePageIdentity,
} from '../../src/core/design-evidence/page-identity.js'

describe('page identity', () => {
  test('uses application-name before og:site_name and title', () => {
    expect(
      pageIdentityFromMetadata({
        applicationName: 'Metricbase',
        openGraphSiteName: 'Metricbase Cloud',
        title: 'Metricbase Console',
      }),
    ).toEqual({ siteName: 'Metricbase', title: 'Metricbase Console' })

    expect(
      pageIdentityFromMetadata({ applicationName: 'Home', openGraphSiteName: 'Bubblebox', title: 'Snacks that pop' }),
    ).toEqual({ siteName: 'Bubblebox', title: 'Snacks that pop' })
  })

  test('cleans hostile or multiline metadata without guessing a brand', () => {
    const long = `${'😀'.repeat(121)}\nname: injected\u0000`
    const cleaned = sanitizePageIdentity(long)

    expect(cleaned).not.toContain('\n')
    expect(cleaned).not.toContain('\u0000')
    expect([...cleaned!]).toHaveLength(120)
  })

  test.each([
    'Home',
    'Login',
    'Sign in',
    '403 Forbidden',
    'Access denied',
    'Just a moment...',
    'Checking your browser',
    'Cloudflare',
    'Captcha challenge',
    'Error',
  ])('rejects generic or interstitial title %s', (title) => {
    expect(pageIdentityFromMetadata({ title })).toEqual({})
  })

  test('uses safe entry metadata before hostname and fallback', () => {
    expect(
      resolveDesignSystemName({
        url: 'http://127.0.0.1:4173/playful-marketing.html',
        title: 'Bubblebox — Snacks that pop',
      }),
    ).toBe('Bubblebox — Snacks that pop')
    expect(resolveDesignSystemName({ url: 'https://www.example.com/path' })).toBe('example.com Design System')
    expect(resolveDesignSystemName({})).toBe('Extracted Design System')
  })

  test.each([
    ['(1 条消息) 首页 - 知乎', '首页 - 知乎'],
    ['（23条新消息）知乎', '知乎'],
    ['[2 new messages] Product Console', 'Product Console'],
    ['(7) Example Dashboard', 'Example Dashboard'],
    ['【未读】创作中心', '创作中心'],
    ['(7) [2 new messages] Home - Example', 'Home - Example'],
  ])('removes volatile notification prefixes from %s', (title, expected) => {
    expect(sanitizePageIdentity(title)).toBe(expected)
    expect(pageIdentityFromMetadata({ title })).toEqual({ title: expected })
  })

  test('rejects entry metadata from unusable or blocked page health', () => {
    expect(
      pageIdentityFromMetadata({
        applicationName: 'Cloudflare',
        title: 'Actual Product',
        pageHealth: { status: 'unusable', issueCodes: ['captcha'] },
      }),
    ).toEqual({})
  })
})
