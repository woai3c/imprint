import type { Page } from 'playwright-core'

export type PageDiscoveryMode = 'auto' | 'links' | 'sitemap'
export type PageKind = 'pricing' | 'product' | 'docs' | 'content' | 'about' | 'contact' | 'blog' | 'support' | 'generic'

export interface DiscoveredPage {
  url: string
  source: 'dom' | 'sitemap'
  kind: PageKind
  score: number
}

export interface PageDiscoveryResult {
  pages: DiscoveredPage[]
  candidateCount: number
  issues: Array<{ stage: string; reason: string }>
}

interface PageCandidate extends DiscoveredPage {
  locationScore: number
}

const EXCLUDED_PATHS = [
  /\/(?:login|log-in|signin|sign-in|signup|sign-up|register|auth)(?:\/|$)/i,
  /\/(?:logout|signout|sign-out)(?:\/|$)/i,
  /\/(?:terms|privacy|legal|cookie|gdpr|tos)(?:\/|$)/i,
  /\/(?:account|profile|settings|checkout|cart|search)(?:\/|$)/i,
  /\/(?:cdn-cgi|wp-admin|wp-content|wp-json|api)(?:\/|$)/i,
  /\/(?:tag|author|page)\/[^/]+/i,
  /\/(?:19|20)\d{2}\/(?:0?[1-9]|1[0-2])(?:\/|$)/,
  /\.(?:avif|css|csv|docx?|gif|ico|jpe?g|js|json|mov|mp3|mp4|pdf|png|svg|tar|webm|webp|xml|zip|gz)$/i,
]

const TRACKING_PARAMETERS = /^(?:fbclid|gclid|mc_cid|mc_eid|ref|source|utm_.+)$/i
const MIN_REPRESENTATIVE_SCORE = 90

function normalizedUrl(candidate: string, baseUrl: string): URL | null {
  try {
    const base = new URL(baseUrl)
    const resolved = new URL(candidate, base)
    if (!['http:', 'https:'].includes(resolved.protocol) || resolved.origin !== base.origin) return null
    resolved.hash = ''
    for (const key of [...resolved.searchParams.keys()]) {
      if (TRACKING_PARAMETERS.test(key)) resolved.searchParams.delete(key)
    }
    resolved.searchParams.sort()
    resolved.pathname = resolved.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
    return resolved
  } catch {
    return null
  }
}

export function classifyPageKind(pathname: string): PageKind {
  const path = pathname.toLowerCase()
  if (/\/(?:pricing|plans?|cost)(?:\/|$)/.test(path)) return 'pricing'
  if (/\/(?:product|products|features?|solutions?|platform|enterprise|business)(?:\/|$)/.test(path)) return 'product'
  if (/\/(?:docs?|documentation|developers?|api-reference|guides?)(?:\/|$)/.test(path)) return 'docs'
  if (/\/(?:questions?|answers?|topics?|posts?|stories?|videos?|watch|explore|feed)(?:\/|$)/.test(path)) {
    return 'content'
  }
  if (/\/(?:about|company|team|story|careers?)(?:\/|$)/.test(path)) return 'about'
  if (/\/(?:contact|demo|trial|get-started|start)(?:\/|$)/.test(path)) return 'contact'
  if (/\/(?:blog|resources|insights|news|articles?)(?:\/|$)/.test(path)) return 'blog'
  if (/\/(?:help|support|faq|community)(?:\/|$)/.test(path)) return 'support'
  return 'generic'
}

export function scorePageUrl(candidate: string, baseUrl: string, locationScore = 0): PageCandidate | null {
  const url = normalizedUrl(candidate, baseUrl)
  if (!url || EXCLUDED_PATHS.some((pattern) => pattern.test(url.pathname))) return null

  const base = new URL(baseUrl)
  const basePath = base.pathname.replace(/\/$/, '') || '/'
  if (url.pathname === basePath) return null

  const segments = url.pathname.split('/').filter(Boolean)
  const kind = classifyPageKind(url.pathname)
  const boosts: Record<PageKind, number> = {
    pricing: 36,
    product: 30,
    docs: 26,
    content: 24,
    blog: 16,
    generic: 12,
    about: 10,
    support: -12,
    contact: -14,
  }
  let score = 100 + boosts[kind] + locationScore - Math.max(0, segments.length - 1) * 12
  if (url.search) score -= 15
  if (segments.some((segment) => /^\d+$/.test(segment) || segment.length > 64)) {
    score -= kind === 'content' ? 2 : 20
  }

  return { url: url.href, source: 'dom', kind, score, locationScore }
}

async function discoverDomCandidates(page: Page, baseUrl: string): Promise<PageCandidate[]> {
  const links = await page.evaluate(() => {
    const locationScore = (anchor: HTMLAnchorElement): number => {
      if (anchor.closest('nav, header, [role="navigation"], [aria-label*="nav" i], [data-nav]')) return 24
      if (anchor.closest('footer')) return -20
      if (anchor.closest('main, article, [role="main"]')) return 12
      return 0
    }
    return [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].map((anchor) => ({
      href: anchor.href,
      locationScore: locationScore(anchor),
    }))
  })

  return links.flatMap(({ href, locationScore }) => {
    const candidate = scorePageUrl(href, baseUrl, locationScore)
    return candidate ? [candidate] : []
  })
}

function sitemapLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc(?:\s[^>]*)?>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
    match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim(),
  )
}

async function fetchText(page: Page, url: string, timeout: number): Promise<string> {
  const response = await page.request.get(url, {
    timeout,
    failOnStatusCode: false,
    headers: { 'user-agent': 'Imprint/1.0 design-system extraction' },
  })
  if (!response.ok()) return ''
  const body = await response.text()
  return body.length <= 2_000_000 ? body : ''
}

async function discoverSitemapCandidates(page: Page, baseUrl: string): Promise<PageCandidate[]> {
  const base = new URL(baseUrl)
  const robotsUrl = `${base.origin}/robots.txt`
  const robots = await fetchText(page, robotsUrl, 3_000).catch(() => '')
  const declaredSitemaps = [...robots.matchAll(/^sitemap:\s*(\S+)\s*$/gim)].map((match) => match[1])
  const sitemapUrls = [
    ...declaredSitemaps,
    `${base.origin}/sitemap.xml`,
    `${base.origin}/sitemap_index.xml`,
    `${base.origin}/sitemap/sitemap-index.xml`,
  ]
    .map((url) => normalizedUrl(url, baseUrl)?.href)
    .filter((url): url is string => Boolean(url))
    .filter((url, index, list) => list.indexOf(url) === index)
    .slice(0, 8)

  const rootDocuments = await Promise.all(sitemapUrls.map((url) => fetchText(page, url, 5_000).catch(() => '')))
  const childSitemaps = rootDocuments
    .filter((xml) => /<sitemapindex(?:\s|>)/i.test(xml))
    .flatMap(sitemapLocations)
    .map((url) => normalizedUrl(url, baseUrl)?.href)
    .filter((url): url is string => Boolean(url))
    .slice(0, 12)
  const childDocuments = await Promise.all(childSitemaps.map((url) => fetchText(page, url, 5_000).catch(() => '')))
  const documents = [...rootDocuments.filter((xml) => !/<sitemapindex(?:\s|>)/i.test(xml)), ...childDocuments]

  return documents.flatMap(sitemapLocations).flatMap((href) => {
    const candidate = scorePageUrl(href, baseUrl)
    return candidate ? [{ ...candidate, source: 'sitemap' as const }] : []
  })
}

function selectDiversePages(candidates: PageCandidate[], maximum: number): DiscoveredPage[] {
  const byUrl = new Map<string, PageCandidate>()
  for (const candidate of candidates) {
    const existing = byUrl.get(candidate.url)
    if (!existing || candidate.score > existing.score || (candidate.source === 'dom' && existing.source !== 'dom')) {
      byUrl.set(candidate.url, candidate)
    }
  }

  const ranked = [...byUrl.values()]
    .filter((candidate) => candidate.score >= MIN_REPRESENTATIVE_SCORE)
    .sort((first, second) => second.score - first.score || first.url.localeCompare(second.url))
  const selected: PageCandidate[] = []
  while (selected.length < maximum && selected.length < ranked.length) {
    const candidatesLeft = ranked.filter(
      (candidate) => !selected.some((selectedPage) => selectedPage.url === candidate.url),
    )
    const rankedForDiversity = candidatesLeft
      .map((candidate) => {
        const sameKindCount = selected.filter((selectedPage) => selectedPage.kind === candidate.kind).length
        const firstSegment = new URL(candidate.url).pathname.split('/').filter(Boolean)[0] || ''
        const sameFamilyCount = selected.filter((selectedPage) => {
          const selectedSegment = new URL(selectedPage.url).pathname.split('/').filter(Boolean)[0] || ''
          return firstSegment !== '' && selectedSegment === firstSegment
        }).length
        return {
          candidate,
          adjustedScore: candidate.score - sameKindCount * 12 - sameFamilyCount * 4,
        }
      })
      .sort(
        (first, second) =>
          second.adjustedScore - first.adjustedScore ||
          second.candidate.score - first.candidate.score ||
          first.candidate.url.localeCompare(second.candidate.url),
      )
    const next = rankedForDiversity[0]?.candidate
    if (!next) break
    selected.push(next)
  }

  return selected.map(({ locationScore: _locationScore, ...page }) => page)
}

export async function discoverPages(
  page: Page,
  baseUrl: string,
  max: number,
  mode: PageDiscoveryMode = 'auto',
): Promise<PageDiscoveryResult> {
  if (max <= 0) return { pages: [], candidateCount: 0, issues: [] }
  const issues: PageDiscoveryResult['issues'] = []
  const candidates: PageCandidate[] = []

  if (mode !== 'sitemap') {
    try {
      candidates.push(...(await discoverDomCandidates(page, baseUrl)))
    } catch (error) {
      issues.push({ stage: 'links', reason: error instanceof Error ? error.message : String(error) })
    }
  }
  if (mode !== 'links') {
    try {
      candidates.push(...(await discoverSitemapCandidates(page, baseUrl)))
    } catch (error) {
      issues.push({ stage: 'sitemap', reason: error instanceof Error ? error.message : String(error) })
    }
  }

  return {
    pages: selectDiversePages(candidates, max),
    candidateCount: new Set(candidates.map(({ url }) => url)).size,
    issues,
  }
}

export async function discoverSubPages(
  page: Page,
  baseUrl: string,
  max: number,
  mode: PageDiscoveryMode = 'auto',
): Promise<string[]> {
  return (await discoverPages(page, baseUrl, max, mode)).pages.map((candidate) => candidate.url)
}
