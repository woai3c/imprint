export const ROLE_CANDIDATE_RULES = {
  nativeActionSelector: 'button, input[type="button"], input[type="submit"], [role="button"]',
  broadActionSelector: 'button, input[type="button"], input[type="submit"], [role="button"], a[href]',
  nativeStatusSelector: '[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])',
  actionTokenPattern: '(?:^|[\\s_-])(?:btn|button|cta|pill|action|primary|secondary)(?:$|[\\s_-])',
  primaryActionPattern:
    '(?:(?:^|[\\s_-])(?:primary|cta|submit|confirm|purchase|checkout|continue)(?:$|[\\s_-])|确认|提交|继续|购买)',
  destructiveActionPattern:
    '(?:(?:^|[\\s_-])(?:error|danger|destructive|delete|remove|invalid)(?:$|[\\s_-])|删除|危险|错误)',
  directStatusPattern:
    '(?:(?:^|[\\s_-])(?:status|success|successful|warning|warn|error|danger|destructive|delete|remove|healthy|health|ok|invalid)(?:$|[\\s_-])|删除|危险|错误|警告)',
  statusSubjectPattern: '(?:^|[\\s_-])(?:delta|trend|change)(?:$|[\\s_-])',
  statusDirectionPattern: '(?:^|[\\s_-])(?:up|down|positive|negative|increase|decrease|gain|loss)(?:$|[\\s_-])',
  positiveStatusPattern:
    '(?:(?:^|[\\s_-])(?:success|successful|healthy|health|ok|up|positive|increase|gain)(?:$|[\\s_-])|成功|正常|健康)',
  warningStatusPattern: '(?:(?:^|[\\s_-])(?:warning|warn)(?:$|[\\s_-])|警告)',
  negativeStatusPattern:
    '(?:(?:^|[\\s_-])(?:error|danger|destructive|delete|remove|invalid|down|negative|decrease|loss)(?:$|[\\s_-])|删除|危险|错误)',
  deepCardScanLimit: 1200,
} as const

export interface RoleCandidateSnapshot {
  tagName: string
  role?: string
  type?: string
  href?: string
  className?: string
  id?: string
  dataVariant?: string
  dataIntent?: string
  dataState?: string
  dataStatus?: string
  ariaLive?: string
  ariaLabel?: string
  value?: string
  text?: string
  backgroundColor?: string
  color?: string
  borderWidth?: number
  width?: number
  height?: number
  paddingInline?: number
  paddingBlock?: number
  closestCandidateTagName?: string
  isCandidateRoot: boolean
}

export interface ClassifiedRoleCandidate {
  elementKind: 'button' | 'anchor' | 'input' | 'role-button' | 'status'
  role: 'action' | 'primary-action' | 'destructive-action' | 'status'
  statusKind?: 'status' | 'delta'
  statusIntent?: 'positive' | 'warning' | 'negative' | 'neutral'
}

function candidateContext(candidate: RoleCandidateSnapshot, includeText = false): string {
  return [
    candidate.className,
    candidate.id,
    candidate.dataVariant,
    candidate.dataIntent,
    candidate.dataState,
    candidate.dataStatus,
    candidate.ariaLabel,
    candidate.type,
    candidate.value,
    includeText ? candidate.text : undefined,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function statusIntent(context: string): ClassifiedRoleCandidate['statusIntent'] {
  if (new RegExp(ROLE_CANDIDATE_RULES.positiveStatusPattern, 'i').test(context)) {
    return 'positive'
  }
  if (new RegExp(ROLE_CANDIDATE_RULES.warningStatusPattern, 'i').test(context)) return 'warning'
  if (new RegExp(ROLE_CANDIDATE_RULES.negativeStatusPattern, 'i').test(context)) {
    return 'negative'
  }
  return 'neutral'
}

function hasPaintedFill(value: string | undefined): boolean {
  if (!value) return false
  return !/^(?:transparent|rgba?\([^)]*(?:,|\/)\s*0(?:\.0+)?\s*\))$/i.test(value.trim())
}

export function classifyRoleCandidate(candidate: RoleCandidateSnapshot): ClassifiedRoleCandidate | null {
  if (!candidate.isCandidateRoot) return null
  const tagName = candidate.tagName.toLowerCase()
  const statusContext = candidateContext(candidate)
  const actionContext = candidateContext(candidate, true)
  const nativeButton = tagName === 'button'
  const inputButton = tagName === 'input' && ['button', 'submit'].includes(candidate.type || '')
  const roleButton = candidate.role === 'button'
  const anchor = tagName === 'a' && Boolean(candidate.href)
  const actionRoot = nativeButton || inputButton || roleButton || anchor
  const directStatus = new RegExp(ROLE_CANDIDATE_RULES.directStatusPattern, 'i').test(statusContext)
  const boundedTrend =
    new RegExp(ROLE_CANDIDATE_RULES.statusSubjectPattern, 'i').test(statusContext) &&
    new RegExp(ROLE_CANDIDATE_RULES.statusDirectionPattern, 'i').test(statusContext)
  const nativeStatus =
    ['status', 'alert'].includes(candidate.role || '') || Boolean(candidate.ariaLive && candidate.ariaLive !== 'off')
  // Interactive roots remain actions even when a framework adds aria-live. The live
  // region describes announcements from the control, not the control's semantic role.
  if (!actionRoot && (nativeStatus || directStatus || boundedTrend)) {
    return {
      elementKind: 'status',
      role: 'status',
      statusKind: boundedTrend ? 'delta' : 'status',
      statusIntent: statusIntent(actionContext),
    }
  }

  if (!nativeButton && !inputButton && !roleButton && !anchor) return null

  if (anchor) {
    const actionHint = new RegExp(ROLE_CANDIDATE_RULES.actionTokenPattern, 'i').test(actionContext)
    const paintedBoundary = hasPaintedFill(candidate.backgroundColor) || (candidate.borderWidth || 0) > 0
    const controlGeometry =
      (candidate.width || 0) >= 44 &&
      (candidate.height || 0) >= 28 &&
      ((candidate.paddingInline || 0) >= 8 || (candidate.paddingBlock || 0) >= 6)
    if (!(actionHint && (paintedBoundary || controlGeometry))) return null
  }

  const elementKind: ClassifiedRoleCandidate['elementKind'] = anchor
    ? 'anchor'
    : inputButton
      ? 'input'
      : roleButton && !nativeButton
        ? 'role-button'
        : 'button'
  const primary = new RegExp(ROLE_CANDIDATE_RULES.primaryActionPattern, 'i').test(actionContext)
  const destructive = new RegExp(ROLE_CANDIDATE_RULES.destructiveActionPattern, 'i').test(actionContext)
  return { elementKind, role: primary ? 'primary-action' : destructive ? 'destructive-action' : 'action' }
}
