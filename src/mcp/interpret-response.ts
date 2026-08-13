import type { AnalysisTiming } from '../core/analyzer/types.js'
import type { DesignEvidence } from '../core/design-evidence/types.js'
import {
  generateReconstructionBrief,
  getReconstructionBriefEligibility,
  reconstructionBriefUnavailableMessage,
} from '../core/design-intelligence/reconstruction-brief.js'
import type { DesignIntelligenceMeta, DesignProfile } from '../core/design-intelligence/types.js'

export function buildInterpretResponse(
  profile: DesignProfile,
  interpretation: DesignIntelligenceMeta,
  evidence: DesignEvidence,
  includeBrief: boolean,
  analysisTiming?: AnalysisTiming,
) {
  const response: {
    profile: DesignProfile
    interpretation: DesignIntelligenceMeta
    analysisTiming?: AnalysisTiming
    reconstructionBrief?: string
    reconstructionBriefUnavailable?: string
  } = {
    profile,
    interpretation,
    ...(analysisTiming ? { analysisTiming } : {}),
  }

  if (!includeBrief) return response
  const eligibility = getReconstructionBriefEligibility(profile, interpretation)
  if (!eligibility.eligible) {
    response.reconstructionBriefUnavailable = reconstructionBriefUnavailableMessage(eligibility.reason)
    return response
  }
  const brief = generateReconstructionBrief(profile, evidence, evidence.tokens, interpretation)
  if (brief) response.reconstructionBrief = brief
  return response
}
