import type { DesignToken } from '../analyzer/types.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { generateAgentContextBundle } from './agent-context.js'
import {
  buildDeterministicClaimCatalog,
  materializeDesignProfile,
  validateDesignClaimCatalog,
} from './claim-catalog.js'
import { generateReconstructionBrief } from './reconstruction-brief.js'
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
  tokens: DesignToken,
  language: 'en' | 'zh-CN',
): DeterministicDesignContext {
  const catalog = buildDeterministicClaimCatalog(evidence, language)
  const integrity = validateDesignClaimCatalog(catalog, evidence)
  if (!integrity.valid) {
    throw new Error(`Deterministic claim catalog integrity failed: ${integrity.errors.slice(0, 8).join('; ')}`)
  }

  const profile = materializeDesignProfile(catalog)
  const reconstructionBrief = generateReconstructionBrief(profile, evidence, tokens)
  const validationReport = validateRecipe(createValidationRecipe('workflow', profile, tokens), profile, tokens)

  return {
    profile,
    reconstructionBrief,
    agentContext: generateAgentContextBundle('Create a new page or component', evidence, profile),
    validationReport,
  }
}
