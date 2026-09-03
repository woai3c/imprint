import type { Page } from 'playwright-core'

import { pageIdentityUrl } from './url-identity.js'

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
  contextualDescendant: boolean
}

const NON_DOCUMENT_EXTENSION =
  /\.(?:avif|css|csv|docx?|gif|ico|jpe?g|js|json|mov|mp3|mp4|pdf|png|svg|tar|webm|webp|xml|zip|gz)$/i
const MIN_REPRESENTATIVE_SCORE = 90
const DIVERSE_PRIORITY_PREFIX = 32

function normalizedUrl(candidate: string, baseUrl: string): URL | null {
  try {
    // URL() percent-encodes stray quote characters instead of rejecting them. These
    // values normally come from malformed markup and must not become crawl targets.
    if (
      /[\u0000-\u001f\u007f\s"'`<>]/u.test(candidate) ||
      /%(?:25)*(?:0[0-9a-f]|1[0-9a-f]|20|22|27|3c|3e|60|7f)/i.test(candidate)
    ) {
      return null
    }
    const base = new URL(baseUrl)
    const resolved = new URL(candidate, base)
    if (!['http:', 'https:'].includes(resolved.protocol) || resolved.origin !== base.origin) return null
    resolved.hash = ''
    resolved.pathname = resolved.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
    return resolved
  } catch {
    return null
  }
}

export function classifyPageKind(_pathname: string): PageKind {
  // Route words are neither language-neutral nor reliable semantics. Keep the legacy field stable while discovery is
  // ranked only from URL structure and standards-based DOM location.
  return 'generic'
}

export function scorePageUrl(candidate: string, baseUrl: string, locationScore = 0): PageCandidate | null {
  const url = normalizedUrl(candidate, baseUrl)
  if (!url || NON_DOCUMENT_EXTENSION.test(url.pathname)) return null

  const base = new URL(baseUrl)
  base.pathname = base.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
  base.hash = ''
  const basePath = base.pathname
  if (pageIdentityUrl(url.href) === pageIdentityUrl(base.href)) return null

  const segments = url.pathname.split('/').filter(Boolean)
  const baseSegments = basePath.split('/').filter(Boolean)
  const contextualDescendant = basePath !== '/' && url.pathname.startsWith(`${basePath}/`)
  const relativeDepth = contextualDescendant ? segments.length - baseSegments.length : segments.length
  const kind = classifyPageKind(url.pathname)
  let score = 100 + locationScore - Math.max(0, relativeDepth - 1) * 8
  if (segments.some((segment) => /^\d+$/.test(segment))) score -= 8
  if (segments.some((segment) => segment.length > 64)) score -= 16

  return { url: url.href, source: 'dom', kind, score, locationScore, contextualDescendant }
}

async function discoverDomCandidates(page: Page, baseUrl: string): Promise<PageCandidate[]> {
  const links = await page.evaluate(() => {
    const locationScore = (anchor: HTMLAnchorElement): number => {
      if (anchor.closest('footer')) return -20
      if (anchor.closest('nav, header, [role="navigation"]')) return 24
      if (anchor.closest('main, article, [role="main"]')) return 24
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
  const contextual = ranked.filter((candidate) => candidate.contextualDescendant)
  const selectionPool = contextual.length > 0 ? contextual : ranked
  const selectionLimit = Math.min(maximum, selectionPool.length)
  const diversityLimit = Math.min(selectionLimit, DIVERSE_PRIORITY_PREFIX)
  const selected: PageCandidate[] = []
  const selectedUrls = new Set<string>()
  const selectedFamilies = new Map<string, number>()
  const familyByUrl = new Map(
    selectionPool.map((candidate) => [
      candidate.url,
      new URL(candidate.url).pathname.split('/').filter(Boolean)[0] || '/',
    ]),
  )
  while (selected.length < diversityLimit) {
    let next: PageCandidate | undefined
    let nextAdjustedScore = Number.NEGATIVE_INFINITY
    for (const candidate of selectionPool) {
      if (selectedUrls.has(candidate.url)) continue
      const family = familyByUrl.get(candidate.url) || ''
      const adjustedScore = candidate.score - (family ? selectedFamilies.get(family) || 0 : 0) * 4
      if (
        !next ||
        adjustedScore > nextAdjustedScore ||
        (adjustedScore === nextAdjustedScore &&
          (candidate.score > next.score ||
            (candidate.score === next.score && candidate.url.localeCompare(next.url) < 0)))
      ) {
        next = candidate
        nextAdjustedScore = adjustedScore
      }
    }
    if (!next) break
    selected.push(next)
    selectedUrls.add(next.url)
    const family = familyByUrl.get(next.url) || ''
    selectedFamilies.set(family, (selectedFamilies.get(family) || 0) + 1)
  }

  // Automatic discovery may expose thousands of URLs. Preserve a diverse, high-value prefix, then append every
  // remaining candidate in deterministic rank order without an expensive all-candidate diversity loop.
  for (const candidate of selectionPool) {
    if (selected.length >= selectionLimit) break
    if (selectedUrls.has(candidate.url)) continue
    selected.push(candidate)
    selectedUrls.add(candidate.url)
  }

  return selected.map(({ locationScore: _locationScore, contextualDescendant: _contextualDescendant, ...page }) => page)
}

export async function discoverPages(
  page: Page,
  baseUrl: string,
  max = Number.MAX_SAFE_INTEGER,
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
