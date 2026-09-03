const MAX_IDENTITY_CODE_POINTS = 120

const GENERIC_IDENTITY_PATTERNS = [
  /^(?:home|homepage)$/i,
  /^(?:首页|主页)$/u,
  /^(?:log\s*in|sign\s*in)$/i,
  /^403(?:\s+forbidden)?$/i,
  /^access denied$/i,
  /^error(?:\s+\d{3})?$/i,
]

const INTERSTITIAL_IDENTITY_PATTERNS = [
  /\bjust a moment\b/i,
  /\bchecking your browser\b/i,
  /\bcaptcha\b/i,
  /\bhuman verification\b/i,
]

const BLOCKED_HEALTH_ISSUES = new Set(['auth-wall', 'captcha', 'error-page', 'rate-limited', 'unexpected-navigation'])

const LEADING_NOTIFICATION_PATTERNS = [
  /^(?:\(|（|\[|【)\s*(?:\d+\s*(?:条)?(?:新)?消息|(?:\d+\s+)?new\s+messages?|未读|unread)\s*(?:\)|）|\]|】)\s*/iu,
  /^\(\s*\d+\s*\)\s+(?=\S)/u,
]

const TITLE_SEGMENT_SEPARATOR = /\s+(?:[-–—|·•])\s+/u

export interface PageIdentityMetadata {
  applicationName?: string
  openGraphSiteName?: string
  title?: string
  pageHealth?: {
    status?: string
    issueCodes?: readonly string[]
  }
}

export function sanitizePageIdentity(value: string | undefined): string | undefined {
  if (!value) return undefined
  let singleLine = value
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  let previous = ''
  while (singleLine !== previous) {
    previous = singleLine
    for (const pattern of LEADING_NOTIFICATION_PATTERNS) singleLine = singleLine.replace(pattern, '').trim()
  }
  if (!singleLine) return undefined
  return [...singleLine].slice(0, MAX_IDENTITY_CODE_POINTS).join('').trim() || undefined
}

export function isMeaningfulPageIdentity(value: string | undefined): value is string {
  const cleaned = sanitizePageIdentity(value)
  if (!cleaned) return false
  return ![...GENERIC_IDENTITY_PATTERNS, ...INTERSTITIAL_IDENTITY_PATTERNS].some((pattern) => pattern.test(cleaned))
}

function healthAllowsIdentity(pageHealth: PageIdentityMetadata['pageHealth']): boolean {
  if (!pageHealth) return true
  if (pageHealth.status === 'unusable') return false
  return !(pageHealth.issueCodes || []).some((code) => BLOCKED_HEALTH_ISSUES.has(code))
}

function siteNameFromGenericTitle(title: string | undefined): string | undefined {
  if (!title) return undefined
  const segments = title
    .split(TITLE_SEGMENT_SEPARATOR)
    .map((segment) => sanitizePageIdentity(segment))
    .filter((segment): segment is string => Boolean(segment))
  if (segments.length < 2) return undefined
  const meaningful = segments.filter((segment) => isMeaningfulPageIdentity(segment))
  return meaningful.length === 1 && meaningful.length < segments.length ? meaningful[0] : undefined
}

export function pageIdentityFromMetadata(metadata: PageIdentityMetadata): { siteName?: string; title?: string } {
  if (!healthAllowsIdentity(metadata.pageHealth)) return {}
  const applicationName = sanitizePageIdentity(metadata.applicationName)
  const openGraphSiteName = sanitizePageIdentity(metadata.openGraphSiteName)
  const title = sanitizePageIdentity(metadata.title)
  const siteName = isMeaningfulPageIdentity(applicationName)
    ? applicationName
    : isMeaningfulPageIdentity(openGraphSiteName)
      ? openGraphSiteName
      : siteNameFromGenericTitle(title)
  return {
    ...(siteName ? { siteName } : {}),
    ...(isMeaningfulPageIdentity(title) ? { title } : {}),
  }
}

export function resolveDesignSystemName(input: { url?: string; siteName?: string; title?: string }): string {
  const siteName = sanitizePageIdentity(input.siteName)
  if (isMeaningfulPageIdentity(siteName)) return siteName
  const title = sanitizePageIdentity(input.title)
  const titleSiteName = siteNameFromGenericTitle(title)
  if (titleSiteName) return titleSiteName
  if (isMeaningfulPageIdentity(title)) return title
  if (input.url) {
    try {
      const hostname = new URL(input.url).hostname.replace(/^www\./, '')
      if (hostname) return `${hostname} Design System`
    } catch {
      // Fall through to the stable fallback.
    }
  }
  return 'Extracted Design System'
}
