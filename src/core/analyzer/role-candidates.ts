export const ROLE_CANDIDATE_RULES = {
  nativeActionSelector:
    'button, input[type="button" i], input[type="submit" i], input[type="image" i], [role="button"]',
  broadActionSelector:
    'button, input[type="button" i], input[type="submit" i], input[type="image" i], [role="button"], a[href]',
  formSubmitterSelector:
    'button:not([type="button" i]):not([type="reset" i]), input[type="submit" i], input[type="image" i]',
  nativeStatusSelector: '[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])',
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
  formAssociated?: boolean
  /** Enabled visible submit-capable controls associated with the same form. */
  formSubmitterCount?: number
  isCandidateRoot: boolean
}

export interface ClassifiedRoleCandidate {
  elementKind: 'button' | 'anchor' | 'input' | 'role-button' | 'status'
  role: 'action' | 'primary-action' | 'destructive-action' | 'status'
  statusKind?: 'status' | 'delta'
  statusIntent?: 'positive' | 'warning' | 'negative' | 'neutral'
}

function hasPaintedFill(value: string | undefined): boolean {
  if (!value) return false
  return !/^(?:transparent|rgba?\([^)]*(?:,|\/)\s*0(?:\.0+)?\s*\))$/i.test(value.trim())
}

export function classifyRoleCandidate(candidate: RoleCandidateSnapshot): ClassifiedRoleCandidate | null {
  if (!candidate.isCandidateRoot) return null
  const tagName = candidate.tagName.toLowerCase()
  const candidateType = candidate.type?.toLowerCase()
  const nativeButton = tagName === 'button'
  const inputButton = tagName === 'input' && ['button', 'submit', 'image'].includes(candidateType || '')
  const roleButton = candidate.role === 'button'
  const anchor = tagName === 'a' && Boolean(candidate.href)
  const actionRoot = nativeButton || inputButton || roleButton || anchor
  const nativeStatus =
    ['status', 'alert'].includes(candidate.role || '') || Boolean(candidate.ariaLive && candidate.ariaLive !== 'off')
  // Interactive roots remain actions even when a framework adds aria-live. The live
  // region describes announcements from the control, not the control's semantic role.
  if (!actionRoot && nativeStatus) {
    return {
      elementKind: 'status',
      role: 'status',
      statusKind: 'status',
      statusIntent: 'neutral',
    }
  }

  if (!nativeButton && !inputButton && !roleButton && !anchor) return null

  if (anchor) {
    const paintedBoundary = hasPaintedFill(candidate.backgroundColor) || (candidate.borderWidth || 0) > 0
    const controlGeometry =
      (candidate.width || 0) >= 44 &&
      (candidate.height || 0) >= 28 &&
      ((candidate.paddingInline || 0) >= 8 || (candidate.paddingBlock || 0) >= 6)
    if (!(paintedBoundary || controlGeometry)) return null
  }

  const elementKind: ClassifiedRoleCandidate['elementKind'] = anchor
    ? 'anchor'
    : inputButton
      ? 'input'
      : roleButton && !nativeButton
        ? 'role-button'
        : 'button'
  const submitCapable =
    (inputButton && ['submit', 'image'].includes(candidateType || '')) ||
    (nativeButton && candidate.formAssociated === true && candidateType !== 'button' && candidateType !== 'reset')
  const primary = submitCapable && candidate.formAssociated === true && candidate.formSubmitterCount === 1
  return { elementKind, role: primary ? 'primary-action' : 'action' }
}
