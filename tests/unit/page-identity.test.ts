import { describe, expect, test } from 'vitest'

import {
  isMeaningfulPageIdentity,
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
    'Homepage',
    '首页',
    '主页',
    'Login',
    'Sign in',
    '403 Forbidden',
    'Access denied',
    'Just a moment...',
    'Checking your browser',
    'Captcha challenge',
    'Error',
  ])('rejects generic or interstitial title %s', (title) => {
    expect(pageIdentityFromMetadata({ title })).toEqual({})
  })

  test('derives a site name only when a separated title has one generic page label', () => {
    expect(pageIdentityFromMetadata({ title: '首页 - 知乎' })).toEqual({ siteName: '知乎', title: '首页 - 知乎' })
    expect(pageIdentityFromMetadata({ title: 'Home — Example' })).toEqual({
      siteName: 'Example',
      title: 'Home — Example',
    })
    expect(pageIdentityFromMetadata({ title: 'Bubblebox — Snacks that pop' })).toEqual({
      title: 'Bubblebox — Snacks that pop',
    })
  })

  test('uses safe entry metadata before hostname and fallback', () => {
    expect(
      resolveDesignSystemName({
        url: 'http://127.0.0.1:4173/playful-marketing.html',
        title: 'Bubblebox — Snacks that pop',
      }),
    ).toBe('Bubblebox — Snacks that pop')
    expect(resolveDesignSystemName({ url: 'https://www.zhihu.com/', title: '首页 - 知乎' })).toBe('知乎')
    expect(resolveDesignSystemName({ url: 'https://www.example.com/path' })).toBe('example.com Design System')
    expect(resolveDesignSystemName({})).toBe('Extracted Design System')
  })

  test.each([
    ['(1 条消息) 首页 - 知乎', '首页 - 知乎', '知乎'],
    ['（23条新消息）知乎', '知乎', undefined],
    ['[2 new messages] Product Console', 'Product Console', undefined],
    ['(7) Example Dashboard', 'Example Dashboard', undefined],
    ['【未读】创作中心', '创作中心', undefined],
    ['(7) [2 new messages] Home - Example', 'Home - Example', 'Example'],
  ])('removes volatile notification prefixes from %s', (title, expected, expectedSiteName) => {
    expect(sanitizePageIdentity(title)).toBe(expected)
    expect(pageIdentityFromMetadata({ title })).toEqual({
      ...(expectedSiteName ? { siteName: expectedSiteName } : {}),
      title: expected,
    })
  })

  test('retains healthy brand metadata without vendor-specific filtering', () => {
    expect(isMeaningfulPageIdentity('Cloudflare')).toBe(true)
    expect(pageIdentityFromMetadata({ applicationName: 'Cloudflare', title: 'Cloudflare' })).toEqual({
      siteName: 'Cloudflare',
      title: 'Cloudflare',
    })
  })

  test('rejects entry metadata when generic page health evidence is blocked', () => {
    expect(
      pageIdentityFromMetadata({
        applicationName: 'Cloudflare',
        title: 'Actual Product',
        pageHealth: { status: 'unusable', issueCodes: ['captcha'] },
      }),
    ).toEqual({})
  })
})
