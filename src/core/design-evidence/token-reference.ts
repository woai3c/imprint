import type { DesignToken } from '../analyzer/types.js'
import type { DesignEvidence } from './types.js'

const TOKEN_ARRAYS = (tokens: DesignToken): Record<string, readonly string[]> => ({
  'typography.font-family': tokens.typography.fontFamilies,
  'typography.font-stack': tokens.typography.fontStacks,
  'typography.font-size': tokens.typography.fontSizes,
  'typography.font-weight': tokens.typography.fontWeights,
  'typography.line-height': tokens.typography.lineHeights,
  'typography.letter-spacing': tokens.typography.letterSpacings,
  spacing: tokens.spacing,
  radius: tokens.radii,
  shadow: tokens.shadows,
  border: tokens.borders,
  'z-index': tokens.zIndices,
  transition: tokens.transitions,
})

/** Resolves the evidence-package token reference format against one explicit token catalog. */
export function resolveDesignTokenRef(tokens: DesignToken, ref: string): string | null {
  const colorName = /^color\.(.+)$/.exec(ref)?.[1]
  if (colorName) return tokens.colors[colorName] ?? null

  const dot = ref.lastIndexOf('.')
  if (dot <= 0) return null
  const index = Number.parseInt(ref.slice(dot + 1), 10)
  if (!Number.isInteger(index) || index < 1) return null
  return TOKEN_ARRAYS(tokens)[ref.slice(0, dot)]?.[index - 1] ?? null
}

export interface EvidenceTokenReferenceIntegrity {
  valid: boolean
  errors: string[]
}

/**
 * Token references are positional within the catalog embedded in Design Evidence.
 * Validate that persisted or reconstructed evidence never contains a dangling reference.
 */
export function validateEvidenceTokenReferences(evidence: DesignEvidence): EvidenceTokenReferenceIntegrity {
  const errors: string[] = []
  const owners = [
    ...evidence.sections.map((owner) => ({ kind: 'section', id: owner.id, refs: owner.tokenRefs })),
    ...evidence.components.map((owner) => ({ kind: 'component', id: owner.id, refs: owner.tokenRefs })),
    ...evidence.layoutNodes.map((owner) => ({ kind: 'layout', id: owner.id, refs: owner.tokenRefs })),
  ]
  for (const owner of owners) {
    for (const ref of owner.refs) {
      if (resolveDesignTokenRef(evidence.tokens, ref) === null) {
        errors.push(`${owner.kind}.${owner.id}:unresolved-token-ref(${ref})`)
      }
    }
  }
  return { valid: errors.length === 0, errors }
}
