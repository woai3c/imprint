import type { DesignToken } from './types.js'

const COLOR_TOKEN_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const RESERVED_TOKEN_NAMES = new Set(['constructor', 'prototype'])

export interface ColorRenameProposal {
  tokenId: string
  name: string
}

export type ColorRenameRejectionReason =
  'unknown-token' | 'duplicate-token' | 'invalid-name' | 'existing-name' | 'duplicate-name'

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

export function validateColorRenames(
  tokens: Pick<DesignToken, 'colors'>,
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

    proposedNames.add(name)
    accepted.push(normalized)
  }

  return { accepted, rejected }
}
