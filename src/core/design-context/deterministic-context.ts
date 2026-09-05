import { validateEvidenceTokenReferences } from '../design-evidence/token-reference.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { generateAgentContextBundle } from './agent-context.js'
import {
  buildDeterministicClaimCatalog,
  materializeDesignProfile,
  validateDesignClaimCatalog,
} from './claim-catalog.js'
import { validateDesignProfileTokenReferences, validateDesignTransferSemantics } from './profile-integrity.js'
import { generateReconstructionBrief } from './reconstruction-brief.js'
import { buildDesignTransferGrammar } from './transfer-grammar.js'
import type { AgentContextBundle, DesignProfile, ValidationReport } from './types.js'
import { createValidationRecipe, validateRecipe } from './validation-recipe.js'

export interface DeterministicDesignContext {
  profile: DesignProfile
  reconstructionBrief: string | null
  agentContext: AgentContextBundle
  validationReport: ValidationReport
}

/** Builds the complete program-owned design context from captured evidence. */
export function createDeterministicDesignContext(
  evidence: DesignEvidence,
  language: 'en' | 'zh-CN',
): DeterministicDesignContext {
  if (language !== 'en' && language !== 'zh-CN') {
    throw new Error('Unsupported deterministic design context language')
  }
  const tokenIntegrity = validateEvidenceTokenReferences(evidence)
  if (!tokenIntegrity.valid) {
    throw new Error(`Design Evidence token reference integrity failed: ${tokenIntegrity.errors.slice(0, 8).join('; ')}`)
  }
  // Design Evidence owns the positional token catalog used by every claim reference.
  // Never resolve those references against the broader all-capture token result.
  const tokens = evidence.tokens
  const catalog = buildDeterministicClaimCatalog(evidence, language)
  const integrity = validateDesignClaimCatalog(catalog, evidence)
  if (!integrity.valid) {
    throw new Error(`Deterministic claim catalog integrity failed: ${integrity.errors.slice(0, 8).join('; ')}`)
  }

  const profile = materializeDesignProfile(catalog)
  profile.transferGrammar = buildDesignTransferGrammar(profile, evidence, tokens)
  const ruleIntegrity = validateDesignTransferSemantics(profile)
  if (!ruleIntegrity.valid) throw new Error(`Transfer grammar integrity failed: ${ruleIntegrity.errors.join('; ')}`)
  const profileIntegrity = validateDesignProfileTokenReferences(profile, tokens, evidence)
  if (!profileIntegrity.valid) {
    throw new Error(
      `Design Profile token reference integrity failed: ${profileIntegrity.errors.slice(0, 8).join('; ')}`,
    )
  }
  const reconstructionBrief = generateReconstructionBrief(profile, evidence, tokens)
  const validationReport = validateRecipe(createValidationRecipe('workflow', profile, tokens), profile, tokens)

  return {
    profile,
    reconstructionBrief,
    agentContext: generateAgentContextBundle('Create a new page or component', evidence, profile),
    validationReport,
  }
}
