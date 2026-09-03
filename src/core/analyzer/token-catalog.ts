import type { DesignToken, TokenCandidateGroup } from './types.js'

export interface CanonicalTokenEntry {
  /** Stable public reference used by Design Evidence owners and cross-artifact projections. */
  id: string
  /** Legacy/internal evidence lookup path retained while stored v1 analyses remain readable. */
  evidencePath: string
  group: TokenCandidateGroup
  value: string
  role?: string
  index?: number
}

interface ArrayGroupDescriptor {
  group: Exclude<TokenCandidateGroup, 'colors'>
  publicPrefix: string
  evidencePrefix: string
  values: (tokens: DesignToken) => readonly string[]
}

const ARRAY_GROUPS: readonly ArrayGroupDescriptor[] = [
  {
    group: 'typography.fontFamilies',
    publicPrefix: 'typography.font-family',
    evidencePrefix: 'typography.fontFamilies',
    values: (tokens) => tokens.typography.fontFamilies,
  },
  {
    group: 'typography.fontStacks',
    publicPrefix: 'typography.font-stack',
    evidencePrefix: 'typography.fontStacks',
    values: (tokens) => tokens.typography.fontStacks,
  },
  {
    group: 'typography.fontSizes',
    publicPrefix: 'typography.font-size',
    evidencePrefix: 'typography.fontSizes',
    values: (tokens) => tokens.typography.fontSizes,
  },
  {
    group: 'typography.fontWeights',
    publicPrefix: 'typography.font-weight',
    evidencePrefix: 'typography.fontWeights',
    values: (tokens) => tokens.typography.fontWeights,
  },
  {
    group: 'typography.lineHeights',
    publicPrefix: 'typography.line-height',
    evidencePrefix: 'typography.lineHeights',
    values: (tokens) => tokens.typography.lineHeights,
  },
  {
    group: 'typography.letterSpacings',
    publicPrefix: 'typography.letter-spacing',
    evidencePrefix: 'typography.letterSpacings',
    values: (tokens) => tokens.typography.letterSpacings,
  },
  {
    group: 'spacing',
    publicPrefix: 'spacing',
    evidencePrefix: 'spacing',
    values: (tokens) => tokens.spacing,
  },
  {
    group: 'radii',
    publicPrefix: 'radius',
    evidencePrefix: 'radii',
    values: (tokens) => tokens.radii,
  },
  {
    group: 'shadows',
    publicPrefix: 'shadow',
    evidencePrefix: 'shadows',
    values: (tokens) => tokens.shadows,
  },
  {
    group: 'borders',
    publicPrefix: 'border',
    evidencePrefix: 'borders',
    values: (tokens) => tokens.borders,
  },
  {
    group: 'zIndices',
    publicPrefix: 'z-index',
    evidencePrefix: 'zIndices',
    values: (tokens) => tokens.zIndices,
  },
  {
    group: 'transitions',
    publicPrefix: 'transition',
    evidencePrefix: 'transitions',
    values: (tokens) => tokens.transitions,
  },
]

const ARRAY_GROUP_BY_NAME = new Map(ARRAY_GROUPS.map((descriptor) => [descriptor.group, descriptor]))

export function buildCanonicalTokenCatalog(tokens: DesignToken): CanonicalTokenEntry[] {
  const entries: CanonicalTokenEntry[] = Object.entries(tokens.colors).map(([role, value]) => ({
    id: `color.${role}`,
    evidencePath: `colors.${role}`,
    group: 'colors',
    role,
    value,
  }))

  for (const descriptor of ARRAY_GROUPS) {
    descriptor.values(tokens).forEach((value, index) => {
      entries.push({
        id: `${descriptor.publicPrefix}.${index + 1}`,
        evidencePath: `${descriptor.evidencePrefix}.${index}`,
        group: descriptor.group,
        index,
        value,
      })
    })
  }
  return entries
}

export function canonicalTokenEntriesForGroup(tokens: DesignToken, group: TokenCandidateGroup): CanonicalTokenEntry[] {
  return buildCanonicalTokenCatalog(tokens).filter((entry) => entry.group === group)
}

export function publicTokenRefForEvidencePath(path: string): string | null {
  const color = /^colors\.(.+)$/.exec(path)
  if (color) return `color.${color[1]}`
  for (const descriptor of ARRAY_GROUPS) {
    const match = new RegExp(`^${descriptor.evidencePrefix.replace('.', '\\.')}\\.(\\d+)$`).exec(path)
    if (match) return `${descriptor.publicPrefix}.${Number(match[1]) + 1}`
  }
  return null
}

export function evidencePathForPublicTokenRef(ref: string): string | null {
  const color = /^color\.(.+)$/.exec(ref)
  if (color) return `colors.${color[1]}`
  for (const descriptor of ARRAY_GROUPS) {
    const match = new RegExp(`^${descriptor.publicPrefix.replace('.', '\\.')}\\.(\\d+)$`).exec(ref)
    if (!match) continue
    const index = Number(match[1]) - 1
    return Number.isInteger(index) && index >= 0 ? `${descriptor.evidencePrefix}.${index}` : null
  }
  return null
}

export function tokenGroupValues(
  tokens: DesignToken,
  group: Exclude<TokenCandidateGroup, 'colors'>,
): readonly string[] {
  return ARRAY_GROUP_BY_NAME.get(group)?.values(tokens) || []
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36).padStart(7, '0')
}

/** Stable identity for a rejected observation; it never aliases a portable positional token reference. */
export function tokenCandidateId(
  group: TokenCandidateGroup,
  value: string,
  role = '',
  provenance = 'built-token',
): string {
  const groupSlug = group
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return `candidate.${groupSlug}.${stableHash(JSON.stringify([group, role, value.trim().toLowerCase(), provenance]))}`
}
