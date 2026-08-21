import type { PageDiscoveryMode } from './page-discovery.js'
import type { AuthMode } from './types.js'

export const ANALYSIS_REQUEST_SCHEMA_VERSION = '2' as const
export const ANALYSIS_VIEWPORTS = ['desktop', 'tablet', 'mobile'] as const
export const DEFAULT_ANALYSIS_PAGE_COUNT = 8

export type AnalysisViewport = (typeof ANALYSIS_VIEWPORTS)[number]
export type AnalysisDepth = 'standard' | 'deep'
export type PageAnalysisMode = 'auto' | 'bounded'

export interface AnalysisRequestInput {
  url: string
  viewports?: readonly string[]
  maxPages?: number
  useSession?: boolean
  authMode?: AuthMode
  extractDarkMode?: boolean
  depth?: AnalysisDepth
  pageDiscovery?: PageDiscoveryMode
}

export interface AnalysisRequest {
  schemaVersion: typeof ANALYSIS_REQUEST_SCHEMA_VERSION
  url: string
  viewports: AnalysisViewport[]
  pageMode: PageAnalysisMode
  maxPages: number
  authMode: AuthMode
  extractDarkMode: boolean
  depth: AnalysisDepth
  pageDiscovery: PageDiscoveryMode
}

export interface AnalysisRequestDefaults {
  viewports: readonly AnalysisViewport[]
  maxPages?: number
  authMode: AuthMode
  extractDarkMode: boolean
  depth: AnalysisDepth
  pageDiscovery: PageDiscoveryMode
}

export type AnalysisRequestErrorCode =
  | 'invalid-url'
  | 'invalid-viewports'
  | 'invalid-page-count'
  | 'invalid-auth-mode'
  | 'invalid-dark-mode'
  | 'invalid-depth'
  | 'invalid-page-discovery'

export class AnalysisRequestError extends Error {
  constructor(readonly code: AnalysisRequestErrorCode) {
    super(`Invalid analysis request: ${code}`)
    this.name = 'AnalysisRequestError'
  }
}

export const CORE_ANALYSIS_REQUEST_DEFAULTS: AnalysisRequestDefaults = {
  viewports: ['desktop', 'mobile'],
  maxPages: DEFAULT_ANALYSIS_PAGE_COUNT,
  authMode: 'managed',
  extractDarkMode: true,
  depth: 'standard',
  pageDiscovery: 'auto',
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T)
}

export function createAnalysisRequest(
  input: AnalysisRequestInput,
  defaults: AnalysisRequestDefaults = CORE_ANALYSIS_REQUEST_DEFAULTS,
): AnalysisRequest {
  const url = input.url.trim()
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new AnalysisRequestError('invalid-url')
  } catch (error) {
    if (error instanceof AnalysisRequestError) throw error
    throw new AnalysisRequestError('invalid-url')
  }

  const requestedViewports = input.viewports ?? defaults.viewports
  if (
    !Array.isArray(requestedViewports) ||
    requestedViewports.length === 0 ||
    requestedViewports.some((viewport) => !isOneOf(viewport, ANALYSIS_VIEWPORTS))
  ) {
    throw new AnalysisRequestError('invalid-viewports')
  }
  const viewports = [...new Set(requestedViewports)] as AnalysisViewport[]

  const maxPages = input.maxPages ?? defaults.maxPages ?? DEFAULT_ANALYSIS_PAGE_COUNT
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new AnalysisRequestError('invalid-page-count')
  }

  const authMode = input.authMode ?? (input.useSession === false ? 'anonymous' : defaults.authMode)
  if (!isOneOf(authMode, ['auto', 'anonymous', 'managed'] as const)) {
    throw new AnalysisRequestError('invalid-auth-mode')
  }
  const depth = input.depth ?? defaults.depth
  if (!isOneOf(depth, ['standard', 'deep'] as const)) throw new AnalysisRequestError('invalid-depth')
  const pageDiscovery = input.pageDiscovery ?? defaults.pageDiscovery
  if (!isOneOf(pageDiscovery, ['auto', 'links', 'sitemap'] as const)) {
    throw new AnalysisRequestError('invalid-page-discovery')
  }
  if (input.extractDarkMode !== undefined && typeof input.extractDarkMode !== 'boolean') {
    throw new AnalysisRequestError('invalid-dark-mode')
  }

  return {
    schemaVersion: ANALYSIS_REQUEST_SCHEMA_VERSION,
    url,
    viewports,
    pageMode: 'bounded',
    maxPages,
    authMode,
    extractDarkMode: input.extractDarkMode ?? defaults.extractDarkMode,
    depth,
    pageDiscovery,
  }
}
