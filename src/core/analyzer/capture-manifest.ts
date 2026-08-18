import type { DesignEvidence } from '../design-evidence/types.js'
import type { CaptureManifest, CaptureViewportEnvironment, CaptureViewportManifest, PageCoverage } from './types.js'

export const CAPTURE_MANIFEST_SCHEMA_VERSION = '1' as const

interface BrowserEnvironmentFacts {
  userAgent: string
  locale: string
  languages: string[]
  timezone: string
  colorScheme: CaptureManifest['environment']['colorScheme']
  reducedMotion: CaptureManifest['environment']['reducedMotion']
  deviceScaleFactor: number
}

interface AnimationFreezeAttempt {
  url: string
  viewport: string
  succeeded: boolean
}

export interface CaptureManifestInput {
  capturedAt: string
  requestSchemaVersion?: CaptureManifest['request']['schemaVersion']
  toolVersion?: string
  viewports: CaptureViewportManifest[]
  maxPages: number
  pageDiscovery?: CaptureManifest['request']['pageDiscovery']
  depth?: CaptureManifest['request']['depth']
  accessMode: CaptureManifest['request']['accessMode']
  executablePath: string
  headless: boolean
  environment: BrowserEnvironmentFacts
  viewportEnvironments: CaptureViewportEnvironment[]
  animationFreezeAttempts: AnimationFreezeAttempt[]
  evidence: DesignEvidence
  pageCoverage: PageCoverage
}

function browserProduct(
  userAgent: string,
  executablePath: string,
): CaptureManifest['environment']['browser']['product'] {
  if (/(?:^|[\\/])(?:msedge|microsoft edge)(?:[\\/.]|$)/i.test(executablePath)) {
    return 'edge'
  }
  if (/(?:^|[\\/])(?:chrome-headless-shell|chromium)(?:[\\/.]|$)/i.test(executablePath)) return 'chromium'
  if (/(?:^|[\\/])(?:chrome|google chrome)(?:[\\/.]|$)/i.test(executablePath)) {
    return 'chrome'
  }
  if (/Edg\//i.test(userAgent)) return 'edge'
  if (/Chromium\//i.test(userAgent) || /chromium/i.test(executablePath)) return 'chromium'
  if (/(?:Headless)?Chrome\//i.test(userAgent)) return 'chrome'
  return 'unknown'
}

function browserVersion(userAgent: string): string | null {
  return /(?:Edg|Chrome|Chromium)\/([\d.]+)/i.exec(userAgent)?.[1] || null
}

function routeIdentity(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    return `${url.origin}${pathname}`
  } catch {
    return value.split(/[?#]/, 1)[0].replace(/\/+$/, '')
  }
}

export function buildCaptureManifest(input: CaptureManifestInput): CaptureManifest {
  const captureCoverage = input.evidence.coverage.captureCoverage
  const pageKeys = [
    ...new Set(input.evidence.pages.map((page) => `${routeIdentity(page.url)}::${page.viewport}`)),
  ].sort()
  const animationFreezeOutcomes = new Map(
    input.animationFreezeAttempts.map((attempt) => [
      `${routeIdentity(attempt.url)}::${attempt.viewport}`,
      attempt.succeeded,
    ]),
  )
  const attemptedPageKeys = pageKeys.filter((pageKey) => animationFreezeOutcomes.has(pageKey))
  const succeededCaptures = attemptedPageKeys.filter((pageKey) => animationFreezeOutcomes.get(pageKey)).length
  const animationFreezeCoverage =
    attemptedPageKeys.length === 0 ? 'none' : attemptedPageKeys.length === pageKeys.length ? 'complete' : 'partial'
  const fontsReady = input.evidence.pages.every(
    (page) => page.health && !page.health.issues.some((issue) => issue.code === 'fonts-not-ready'),
  )
  const limitations = [...input.evidence.limitations]
  if (!input.toolVersion) limitations.push('tool-version-unavailable')

  return {
    schemaVersion: CAPTURE_MANIFEST_SCHEMA_VERSION,
    capturedAt: input.capturedAt,
    tool: { name: 'imprint', version: input.toolVersion || null },
    request: {
      schemaVersion: input.requestSchemaVersion || '1',
      viewports: input.viewports,
      maxPages: input.maxPages,
      pageDiscovery: input.pageDiscovery || 'auto',
      depth: input.depth || 'standard',
      accessMode: input.accessMode,
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      browser: {
        engine: 'chromium',
        product: browserProduct(input.environment.userAgent, input.executablePath),
        version: browserVersion(input.environment.userAgent),
        userAgent: input.environment.userAgent,
        headless: input.headless,
      },
      locale: input.environment.locale,
      languages: input.environment.languages,
      timezone: input.environment.timezone,
      colorScheme: input.environment.colorScheme,
      reducedMotion: input.environment.reducedMotion,
      deviceScaleFactor: input.environment.deviceScaleFactor,
      viewports: input.viewportEnvironments,
    },
    stabilization: {
      strategyVersion: '1',
      pageHealthRecorded: true,
      animationFreeze: {
        eligibleCaptures: pageKeys.length,
        attemptedCaptures: attemptedPageKeys.length,
        succeededCaptures,
        failedCaptures: attemptedPageKeys.length - succeededCaptures,
        coverage: animationFreezeCoverage,
      },
      fontsReady,
    },
    capture: {
      pageKeys,
      pages: {
        requested: input.pageCoverage.requested,
        discovered: input.pageCoverage.discovered,
        selected: input.pageCoverage.selected,
        analyzed: input.pageCoverage.analyzed,
      },
      expected: captureCoverage?.expected ?? input.evidence.pages.length,
      captured: captureCoverage?.captured ?? input.evidence.pages.length,
      status: captureCoverage?.status ?? input.evidence.coverage.pageCoverage,
      coverageLimitations: [...input.evidence.coverage.limitations],
    },
    limitations: [...new Set(limitations)],
  }
}
