import { createHash } from 'node:crypto'

import type { DesignEvidence } from '../design-evidence/types.js'
import { buildAnalysisDigest } from './analysis-digest.js'
import { restrictEvidencePackageImages, selectEvidencePackage } from './evidence-selector.js'
import { prepareAnalysisDigestPackageForPrompt } from './prompt.js'
import type { IntelligenceInputMode } from './types.js'

export function createEvidenceFingerprint(
  evidence: DesignEvidence,
  inputMode: IntelligenceInputMode,
  provider: string,
  model: string,
  selectedImageIds?: Iterable<string>,
  promptVersion = '1',
  profileSchemaVersion = '1',
  language: 'en' | 'zh-CN' = 'en',
): string {
  let evidencePackage = selectEvidencePackage(evidence, inputMode)
  if (inputMode === 'multimodal' && selectedImageIds) {
    evidencePackage = restrictEvidencePackageImages(evidencePackage, selectedImageIds)
  }
  const digest = prepareAnalysisDigestPackageForPrompt(buildAnalysisDigest(evidence, evidencePackage)).digest
  const selectedImages = new Set(evidencePackage.imageIds)
  const images =
    inputMode === 'multimodal'
      ? evidence.pages.flatMap((page) =>
          page.images
            .filter((image) => selectedImages.has(image.id))
            .map((image) => ({
              id: image.id,
              version: image.aiSummary?.version || 'raw',
              contentHash: image.aiSummary?.contentHash || image.contentHash || '',
              width: image.aiSummary?.width || image.width,
              height: image.aiSummary?.height || image.height,
              bytes: image.aiSummary?.bytes,
            })),
        )
      : []
  return createHash('sha256')
    .update(
      JSON.stringify({
        inputMode,
        digest,
        images,
        provider,
        model,
        language,
        promptVersion,
        profileSchemaVersion,
      }),
    )
    .digest('hex')
}
