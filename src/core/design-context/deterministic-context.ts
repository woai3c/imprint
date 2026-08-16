import type { DesignToken } from '../analyzer/types.js'
import type { DesignEvidence } from '../design-evidence/types.js'
import { generateAgentContextBundle } from './agent-context.js'
import {
  buildDeterministicClaimCatalog,
  materializeDesignProfile,
  validateDesignClaimCatalog,
} from './claim-catalog.js'
import { generateReconstructionBrief } from './reconstruction-brief.js'
import { DESIGN_PROFILE_SCHEMA_VERSION } from './types.js'
import type { AgentContextBundle, AnalysisTiming, DesignContextMeta, DesignProfile, ValidationReport } from './types.js'
import { createValidationRecipe, validateRecipe } from './validation-recipe.js'

export interface DeterministicDesignContext {
  profile: DesignProfile
  meta: DesignContextMeta
  reconstructionBrief: string | null
  agentContext: AgentContextBundle
  validationReport: ValidationReport
}

/** Builds the complete program-owned design context from captured evidence. */
export function createDeterministicDesignContext(
  evidence: DesignEvidence,
  tokens: DesignToken,
  language: 'en' | 'zh-CN',
  timing?: AnalysisTiming,
): DeterministicDesignContext {
  const catalog = buildDeterministicClaimCatalog(evidence, language, 'structural-only')
  const integrity = validateDesignClaimCatalog(catalog, evidence)
  if (!integrity.valid) {
    throw new Error(`Deterministic claim catalog integrity failed: ${integrity.errors.slice(0, 8).join('; ')}`)
  }

  const profile = materializeDesignProfile(catalog)
  const meta: DesignContextMeta = {
    status: 'complete',
    capabilityLevel: 'evidence-only',
    inputMode: 'structural-only',
    schemaVersion: DESIGN_PROFILE_SCHEMA_VERSION,
    ...(timing ? { timing } : {}),
  }
  const reconstructionBrief = generateReconstructionBrief(profile, evidence, tokens, meta)
  const validationReport = validateRecipe(
    createValidationRecipe('workflow', profile, tokens),
    profile,
    tokens,
    meta.capabilityLevel,
  )

  return {
    profile,
    meta,
    reconstructionBrief,
    agentContext: generateAgentContextBundle('Create a new page or component', meta.capabilityLevel, evidence, profile),
    validationReport,
  }
}
