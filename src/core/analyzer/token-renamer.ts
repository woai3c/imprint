import { normalizeColorValue } from './color-cluster.js'
import type { DesignToken } from './types.js'

const COLOR_TOKEN_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const RESERVED_TOKEN_NAMES = new Set(['constructor', 'prototype'])

export interface ColorRenameProposal {
  tokenId: string
  name: string
}

export type ColorRenameRejectionReason =
  'unknown-token' | 'duplicate-token' | 'invalid-name' | 'existing-name' | 'duplicate-name' | 'role-mismatch'

export interface RejectedColorRename {
  proposal: ColorRenameProposal
  reason: ColorRenameRejectionReason
}

export interface ColorRenameValidation {
  accepted: ColorRenameProposal[]
  rejected: RejectedColorRename[]
}

function isValidTokenName(name: string): boolean {
  return name.length <= 64 && COLOR_TOKEN_NAME_PATTERN.test(name) && !RESERVED_TOKEN_NAMES.has(name)
}

type ObservedRole = 'text' | 'link' | 'background' | 'border' | 'action' | 'accent' | 'status'

const ROLE_SOURCE_PATTERNS: ReadonlyArray<[RegExp, ObservedRole]> = [
  [/^usage:(?:primaryActionColor|actionColor|selectedColor)$/, 'action'],
  [/^usage:linkColor$/, 'link'],
  [/^usage:textColor$/, 'text'],
  [/^usage:(?:bgColor|bgArea)$/, 'background'],
  [/^usage:(?:structuralBorderColor|borderColor)$/, 'border'],
  [/^usage:(?:accentColor|brandTokenColor)$/, 'accent'],
  [/^usage:statusColor$/, 'status'],
]

// A name prefix must describe a role the color was actually observed in. The naming prompt
// includes usage stats, but the model can still ignore them (e.g. naming a 588x text color
// "action-primary"), so clear contradictions are rejected deterministically.
const PREFIX_COMPATIBLE_ROLES: Record<string, readonly ObservedRole[]> = {
  text: ['text', 'link'],
  link: ['link', 'text'],
  surface: ['background'],
  border: ['border'],
  action: ['action'],
  accent: ['accent', 'action'],
  success: ['status'],
}

const USAGE_CATEGORY_ROLES: Record<string, ObservedRole> = {
  primaryActionColor: 'action',
  actionColor: 'action',
  selectedColor: 'action',
  linkColor: 'link',
  textColor: 'text',
  bgColor: 'background',
  bgArea: 'background',
  structuralBorderColor: 'border',
  borderColor: 'border',
  accentColor: 'accent',
  brandTokenColor: 'accent',
  statusColor: 'status',
}

// Palette tokens match every usage category, so evidence sources are a union in which a single
// incidental match (one black button) looks as strong as the dominant role (588x body text).
// Per-category usage counts identify the dominant role instead. Usage keys carry raw computed
// values (rgb(...)) while token values are normalized hex, so both sides are normalized.
function dominantObservedRole(
  tokens: Pick<DesignToken, 'colors' | 'usageCount'>,
  tokenId: string,
): ObservedRole | null {
  const value = tokens.colors[tokenId]
  const usageCount = tokens.usageCount
  if (!value || !usageCount) return null
  const normalized = normalizeColorValue(value)
  if (!normalized) return null
  const counts = new Map<ObservedRole, number>()
  for (const [key, count] of Object.entries(usageCount)) {
    if (!Number.isFinite(count) || count <= 0) continue
    const separator = key.indexOf(':')
    if (separator <= 0) continue
    const role = USAGE_CATEGORY_ROLES[key.slice(0, separator)]
    if (!role || normalizeColorValue(key.slice(separator + 1)) !== normalized) continue
    counts.set(role, (counts.get(role) || 0) + count)
  }
  let dominant: ObservedRole | null = null
  let dominantCount = 0
  for (const [role, count] of counts) {
    if (count > dominantCount) {
      dominant = role
      dominantCount = count
    }
  }
  return dominant
}

function conflictsWithObservedRole(
  tokens: Pick<DesignToken, 'colors' | 'evidence' | 'usageCount'>,
  tokenId: string,
  name: string,
): boolean {
  const compatible = PREFIX_COMPATIBLE_ROLES[name.split('-', 1)[0]]
  if (!compatible) return false
  const dominant = dominantObservedRole(tokens, tokenId)
  if (dominant) return !compatible.includes(dominant)
  const sources = tokens.evidence?.[`colors.${tokenId}`]?.sources
  if (!sources) return false
  const roles = new Set(
    sources
      .map((source) => ROLE_SOURCE_PATTERNS.find(([pattern]) => pattern.test(source))?.[1])
      .filter((role): role is ObservedRole => Boolean(role)),
  )
  if (roles.size === 0) return false
  return ![...roles].some((role) => compatible.includes(role))
}

export function validateColorRenames(
  tokens: Pick<DesignToken, 'colors' | 'evidence' | 'usageCount'>,
  proposals: readonly ColorRenameProposal[],
): ColorRenameValidation {
  const existingNames = new Set(Object.keys(tokens.colors))
  const proposedTokenIds = new Set<string>()
  const proposedNames = new Set<string>()
  const accepted: ColorRenameProposal[] = []
  const rejected: RejectedColorRename[] = []

  for (const proposal of proposals) {
    const tokenId = proposal.tokenId.trim()
    const name = proposal.name.trim()
    const normalized = { tokenId, name }

    if (!existingNames.has(tokenId)) {
      rejected.push({ proposal: normalized, reason: 'unknown-token' })
      continue
    }
    if (proposedTokenIds.has(tokenId)) {
      rejected.push({ proposal: normalized, reason: 'duplicate-token' })
      continue
    }
    proposedTokenIds.add(tokenId)

    if (name === tokenId) continue
    if (!isValidTokenName(name)) {
      rejected.push({ proposal: normalized, reason: 'invalid-name' })
      continue
    }
    if (existingNames.has(name)) {
      rejected.push({ proposal: normalized, reason: 'existing-name' })
      continue
    }
    if (proposedNames.has(name)) {
      rejected.push({ proposal: normalized, reason: 'duplicate-name' })
      continue
    }
    if (conflictsWithObservedRole(tokens, tokenId, name)) {
      rejected.push({ proposal: normalized, reason: 'role-mismatch' })
      continue
    }

    proposedNames.add(name)
    accepted.push(normalized)
  }

  return { accepted, rejected }
}

/**
 * Returns a copy of the tokens with accepted color renames applied to the color map and to
 * `colors.*` keys in the evidence map. Invalid or colliding proposals are skipped.
 */
export function applyColorRenames(
  tokens: DesignToken,
  renames: readonly ColorRenameProposal[],
): { tokens: DesignToken; applied: ColorRenameProposal[] } {
  const { accepted } = validateColorRenames(tokens, renames)
  if (accepted.length === 0) return { tokens, applied: [] }
  const renameMap = new Map(accepted.map((item) => [item.tokenId, item.name]))
  const colors = Object.fromEntries(
    Object.entries(tokens.colors).map(([name, value]) => [renameMap.get(name) || name, value]),
  )
  const evidence = tokens.evidence
    ? Object.fromEntries(
        Object.entries(tokens.evidence).map(([key, value]) => {
          const match = /^colors\.(.+)$/.exec(key)
          return [match ? `colors.${renameMap.get(match[1]) || match[1]}` : key, value]
        }),
      )
    : undefined
  return {
    tokens: { ...tokens, colors, ...(evidence ? { evidence } : {}) },
    applied: [...accepted],
  }
}
