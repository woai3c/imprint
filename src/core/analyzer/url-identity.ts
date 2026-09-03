import { createHash } from 'node:crypto'

export const PERSISTED_ROUTE_IDENTITY_VERSION = 1 as const

/**
 * Canonical fetch identity for one document. Query parameters are part of HTTP resource identity and must survive
 * discovery, capture grouping, and promotion. Only credentials and fragments are request-local here; public artifact
 * sanitization removes query text separately.
 */
export function pageIdentityUrl(value: string): string {
  try {
    const pageUrl = new URL(value)
    pageUrl.username = ''
    pageUrl.password = ''
    pageUrl.hash = ''
    return pageUrl.href
  } catch {
    return value.split('#', 1)[0]
  }
}

/** Deterministic public-safe identity for a query-bearing document; never contains URL or query text. */
export function opaqueRouteIdentity(value: string): string {
  const digest = createHash('sha256').update(pageIdentityUrl(value)).digest('hex').slice(0, 12)
  return `route-${digest}`
}

export function isOpaqueRouteIdentity(value: unknown): value is string {
  return typeof value === 'string' && /^route-[0-9a-f]{12}$/.test(value)
}

/**
 * Recovers the source document's explicit identity only when every matching capture agrees. This remains safe for
 * multi-viewport sources while refusing query-redacted Evidence whose public source URL matches several documents.
 */
export function explicitSourceRouteIdentity(
  evidence: {
    source?: { routeId?: string; requestedUrl?: string; finalUrl?: string }
    pages?: Array<{ url: string; routeId?: string }>
  } | null,
): string | undefined {
  if (evidence?.source?.routeId) return evidence.source.routeId
  const sourceUrl = evidence?.source?.finalUrl || evidence?.source?.requestedUrl
  if (!sourceUrl) return undefined
  const sourceIdentity = pageIdentityUrl(sourceUrl)
  const matchingPages = (evidence?.pages || []).filter((page) => pageIdentityUrl(page.url) === sourceIdentity)
  const routeIds = new Set(
    matchingPages.map((page) => page.routeId).filter((routeId): routeId is string => Boolean(routeId)),
  )
  if (matchingPages.length === 0 || routeIds.size !== 1 || matchingPages.some((page) => !page.routeId)) {
    return undefined
  }
  return [...routeIds][0]
}

/** Public-safe grouping key retained on new Evidence pages when their persisted URLs have query text removed. */
export function evidencePageRouteIdentity(page: { url: string; routeId?: string }): string {
  return page.routeId || pageIdentityUrl(page.url)
}
