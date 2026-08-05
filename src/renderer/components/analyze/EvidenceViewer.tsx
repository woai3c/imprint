import { useState } from 'react'

import { resolveEvidenceOpen } from '../../lib/evidence-resolution'
import { getPageScreenshots, getScreenshotUrl } from '../../lib/page-screenshots'
import type { AnalysisResultData } from '../../stores/analysis-store'
import { EvidenceDetailCard, type EvidenceDetailData } from './EvidenceDetailCard'
import { ScreenshotLightbox } from './ScreenshotLightbox'

interface EvidenceHighlight {
  imageIndex: number
  rect: { x: number; y: number; width: number; height: number }
  label: string
}

export interface EvidenceViewerController {
  evidenceDetail: EvidenceDetailData | null
  lightboxCrop: string | null
  lightboxHighlight: EvidenceHighlight | null
  lightboxIndex: number | null
  closeEvidenceDetail: () => void
  closeLightbox: () => void
  openEvidence: (evidenceId: string) => void
  openLightbox: (index: number) => void
  selectLightboxIndex: (index: number) => void
}

export function useEvidenceViewer(
  result: AnalysisResultData | null,
  translateField: (key: string) => string,
): EvidenceViewerController {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [lightboxCrop, setLightboxCrop] = useState<string | null>(null)
  const [lightboxHighlight, setLightboxHighlight] = useState<EvidenceHighlight | null>(null)
  const [evidenceDetail, setEvidenceDetail] = useState<EvidenceDetailData | null>(null)

  const openEvidence = (evidenceId: string) => {
    if (!result?.designEvidence) return
    const resolution = resolveEvidenceOpen(result.designEvidence, getPageScreenshots(result), evidenceId)
    if (resolution.type === 'lightbox') {
      setEvidenceDetail(null)
      setLightboxCrop(resolution.target.cropPath ? getScreenshotUrl(resolution.target.cropPath) : null)
      setLightboxHighlight(resolution.target)
      setLightboxIndex(resolution.target.imageIndex)
      return
    }
    setEvidenceDetail({
      ...resolution.detail,
      fields: resolution.detail.fields.map((field) => ({
        label: translateField(field.key),
        value: field.value,
      })),
    })
  }

  const openLightbox = (index: number) => {
    setLightboxCrop(null)
    setLightboxIndex(index)
  }

  const selectLightboxIndex = (index: number) => {
    setLightboxIndex(index)
    if (lightboxHighlight?.imageIndex !== index) setLightboxHighlight(null)
  }

  const closeLightbox = () => {
    setLightboxIndex(null)
    setLightboxHighlight(null)
    setLightboxCrop(null)
  }

  return {
    evidenceDetail,
    lightboxCrop,
    lightboxHighlight,
    lightboxIndex,
    closeEvidenceDetail: () => setEvidenceDetail(null),
    closeLightbox,
    openEvidence,
    openLightbox,
    selectLightboxIndex,
  }
}

export function EvidenceViewer({
  result,
  controller,
}: {
  result: AnalysisResultData | null
  controller: EvidenceViewerController
}) {
  const { evidenceDetail, lightboxCrop, lightboxHighlight, lightboxIndex } = controller
  return (
    <>
      {evidenceDetail && lightboxIndex === null && (
        <EvidenceDetailCard detail={evidenceDetail} onClose={controller.closeEvidenceDetail} />
      )}
      {lightboxIndex !== null && result && (
        <ScreenshotLightbox
          images={[
            ...(lightboxCrop ? [lightboxCrop] : []),
            ...getPageScreenshots(result).map((screenshot) => getScreenshotUrl(screenshot.path)),
          ]}
          index={lightboxIndex}
          highlight={
            lightboxHighlight?.imageIndex === lightboxIndex
              ? { rect: lightboxHighlight.rect, label: lightboxHighlight.label }
              : undefined
          }
          onIndexChange={controller.selectLightboxIndex}
          onClose={controller.closeLightbox}
        />
      )}
    </>
  )
}
