import { Loader2, Minus, Plus, X } from 'lucide-react'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import type { ComparisonVisualCapture, ComparisonVisualPair } from '../../shared/ipc-contract'
import { getScreenshotUrl } from '../lib/page-screenshots'
import { type VisualDiffRegion, createVisualDiff, fitVisualDiffPreview } from '../lib/visual-diff'

interface VisualDiffDialogProps {
  pairs: ComparisonVisualPair[]
  onClose: () => void
}

interface RenderedDiff {
  width: number
  referenceHeight: number
  targetHeight: number
  originalReferenceWidth: number
  originalReferenceHeight: number
  originalTargetWidth: number
  originalTargetHeight: number
  changedPixels: number
  referenceRegions: VisualDiffRegion[]
  targetRegions: VisualDiffRegion[]
  alignment: 'top' | 'height-shift'
  scaled: boolean
  referencePreviewUrl: string
  targetPreviewUrl: string
}

type VisualDiffError = 'load-failed' | 'width-mismatch'

const MAX_PREVIEW_WIDTH = 1200
const MAX_PREVIEW_PIXELS = 4_000_000
const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

interface LoadedScreenshot {
  blob: Blob
  width: number
  height: number
}

interface PreviewPixels {
  pixels: ImageData
  previewUrl: string
}

async function pngDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  const bytes = new Uint8Array(await blob.slice(0, 24).arrayBuffer())
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

async function loadScreenshot(capture: ComparisonVisualCapture): Promise<LoadedScreenshot> {
  const response = await fetch(getScreenshotUrl(capture.path))
  if (!response.ok) throw new Error('Screenshot could not be loaded')
  const blob = await response.blob()
  const storedWidth = Number.isFinite(capture.width) && Number(capture.width) > 0 ? Number(capture.width) : null
  const storedHeight = Number.isFinite(capture.height) && Number(capture.height) > 0 ? Number(capture.height) : null
  const encoded = storedWidth && storedHeight ? null : await pngDimensions(blob)
  const width = storedWidth || encoded?.width
  const height = storedHeight || encoded?.height
  if (!width || !height) throw new Error('Screenshot dimensions are unavailable')
  return { blob, width, height }
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Preview image could not be created'))),
      'image/png',
    )
  })
}

async function screenshotPixels(blob: Blob, width: number, height: number): Promise<PreviewPixels> {
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: 'high',
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error('Canvas is unavailable')
  }
  try {
    context.drawImage(bitmap, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height)
    const previewUrl = URL.createObjectURL(await canvasBlob(canvas))
    return { pixels, previewUrl }
  } finally {
    bitmap.close()
  }
}

function viewportLabelKey(viewport: string): string {
  return ['desktop', 'tablet', 'mobile'].includes(viewport) ? `analyze.viewports.${viewport}` : ''
}

export function VisualDiffDialog({ pairs, onClose }: VisualDiffDialogProps) {
  const { t } = useTranslation()
  const [pairIndex, setPairIndex] = useState(0)
  const [rendered, setRendered] = useState<RenderedDiff | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<VisualDiffError | null>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const pair = pairs[pairIndex]

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    const previewUrls: string[] = []

    Promise.all([loadScreenshot(pair.reference), loadScreenshot(pair.target)])
      .then(([reference, target]) => {
        if (reference.width !== target.width) {
          if (!cancelled) setError('width-mismatch')
          return null
        }
        return (async () => {
          const geometry = fitVisualDiffPreview(
            reference.width,
            reference.height,
            target.width,
            target.height,
            MAX_PREVIEW_WIDTH,
            MAX_PREVIEW_PIXELS,
          )
          const { width, referenceHeight, targetHeight } = geometry
          // Decode sequentially at the bounded preview size. Holding two original long-page bitmaps can otherwise
          // consume hundreds of megabytes before the comparison buffers are even allocated.
          const referencePreview = await screenshotPixels(reference.blob, width, referenceHeight)
          if (cancelled) {
            URL.revokeObjectURL(referencePreview.previewUrl)
            return
          }
          previewUrls.push(referencePreview.previewUrl)
          const targetPreview = await screenshotPixels(target.blob, width, targetHeight)
          if (cancelled) {
            URL.revokeObjectURL(targetPreview.previewUrl)
            return
          }
          previewUrls.push(targetPreview.previewUrl)
          const diff = createVisualDiff(
            { width, height: referenceHeight, data: referencePreview.pixels.data },
            { width, height: targetHeight, data: targetPreview.pixels.data },
          )
          if (!cancelled) {
            setRendered({
              ...diff,
              width,
              referenceHeight,
              targetHeight,
              originalReferenceWidth: reference.width,
              originalReferenceHeight: reference.height,
              originalTargetWidth: target.width,
              originalTargetHeight: target.height,
              scaled: geometry.scaled,
              referencePreviewUrl: referencePreview.previewUrl,
              targetPreviewUrl: targetPreview.previewUrl,
            })
          }
        })()
      })
      .catch(() => {
        for (const previewUrl of previewUrls) URL.revokeObjectURL(previewUrl)
        previewUrls.length = 0
        if (!cancelled) setError('load-failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      for (const previewUrl of previewUrls) URL.revokeObjectURL(previewUrl)
    }
  }, [pair])

  const translatedViewport = viewportLabelKey(pair.viewport) ? t(viewportLabelKey(pair.viewport)) : pair.viewport

  return createPortal(
    <div
      data-testid="visual-diff-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/55 p-5"
    >
      <section
        data-testid="visual-diff-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visual-diff-title"
        className="ui-enter flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="visual-diff-title" className="text-sm font-semibold">
              {t('history.referenceComparison.visualDiff.title')}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('history.referenceComparison.visualDiff.description')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card/30 px-5 py-3 text-xs">
          {pairs.length > 1 && (
            <label className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 font-medium">{t('history.referenceComparison.visualDiff.capture')}</span>
              <select
                value={pairIndex}
                onChange={(event) => {
                  setRendered(null)
                  setError(null)
                  setLoading(true)
                  setZoom(MIN_ZOOM)
                  setPairIndex(Number(event.target.value))
                }}
                className="h-8 max-w-lg rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {pairs.map((candidate, index) => {
                  const key = viewportLabelKey(candidate.viewport)
                  return (
                    <option key={`${candidate.reference.path}:${candidate.target.path}`} value={index}>
                      {candidate.url} · {key ? t(key) : candidate.viewport}
                    </option>
                  )
                })}
              </select>
            </label>
          )}
          <span className="min-w-0 truncate text-muted-foreground" title={pair.url}>
            {pair.url} · {translatedViewport}
          </span>
          {rendered && (
            <>
              <div
                role="group"
                aria-label={t('history.referenceComparison.visualDiff.zoomControls')}
                className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-border bg-background p-1"
              >
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))}
                  disabled={zoom <= MIN_ZOOM}
                  aria-label={t('history.referenceComparison.visualDiff.zoomOut')}
                  title={t('history.referenceComparison.visualDiff.zoomOut')}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Minus size={14} aria-hidden="true" />
                </button>
                <span
                  data-testid="visual-diff-zoom-level"
                  className="min-w-11 text-center tabular-nums text-foreground"
                >
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))}
                  disabled={zoom >= MAX_ZOOM}
                  aria-label={t('history.referenceComparison.visualDiff.zoomIn')}
                  title={t('history.referenceComparison.visualDiff.zoomIn')}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
              </div>
              <span className="shrink-0 text-muted-foreground">
                {t('history.referenceComparison.visualDiff.dimensions', {
                  referenceWidth: rendered.originalReferenceWidth,
                  referenceHeight: rendered.originalReferenceHeight,
                  targetWidth: rendered.originalTargetWidth,
                  targetHeight: rendered.originalTargetHeight,
                })}
              </span>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/25 p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              {t('history.referenceComparison.visualDiff.loading')}
            </div>
          ) : error ? (
            <div
              className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground"
              role="alert"
            >
              {t(`history.referenceComparison.visualDiff.errors.${error}`)}
            </div>
          ) : rendered ? (
            <div className="mx-auto min-w-[720px]" style={{ width: `${zoom * 100}%`, maxWidth: `${1600 * zoom}px` }}>
              <div className="grid grid-cols-2 gap-3">
                <div className="overflow-hidden rounded-lg border border-border bg-warning/10">
                  <div className="relative">
                    <img
                      src={rendered.referencePreviewUrl}
                      alt={t('history.referenceComparison.visualDiff.referenceImageAlt')}
                      data-testid="visual-diff-reference"
                      draggable={false}
                      className="block h-auto w-full"
                    />
                    <DiffRegions
                      regions={rendered.referenceRegions}
                      width={rendered.width}
                      height={rendered.referenceHeight}
                    />
                  </div>
                  {rendered.referenceHeight < rendered.targetHeight && (
                    <p className="p-3 text-center text-xs text-warning-strong">
                      {t('history.referenceComparison.visualDiff.imageEnds')}
                    </p>
                  )}
                </div>
                <div className="overflow-hidden rounded-lg border border-border bg-warning/10">
                  <div className="relative">
                    <img
                      src={rendered.targetPreviewUrl}
                      alt={t('history.referenceComparison.visualDiff.targetImageAlt')}
                      data-testid="visual-diff-target"
                      draggable={false}
                      className="block h-auto w-full"
                    />
                    <DiffRegions
                      regions={rendered.targetRegions}
                      width={rendered.width}
                      height={rendered.targetHeight}
                    />
                  </div>
                  {rendered.targetHeight < rendered.referenceHeight && (
                    <p className="p-3 text-center text-xs text-warning-strong">
                      {t('history.referenceComparison.visualDiff.imageEnds')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {rendered && (
          <footer className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-background px-5 py-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm border-2 border-[#e13448]" aria-hidden="true" />
              {t('history.referenceComparison.visualDiff.highlightLegend')}
            </span>
            {rendered.changedPixels === 0 && (
              <span className="font-medium text-foreground">
                {t('history.referenceComparison.visualDiff.noVisibleDifference')}
              </span>
            )}
            {rendered.alignment === 'height-shift' ? (
              <span className="font-medium text-warning-strong">
                {t('history.referenceComparison.visualDiff.heightAligned')}
              </span>
            ) : rendered.originalReferenceHeight !== rendered.originalTargetHeight ? (
              <span className="font-medium text-warning-strong">
                {t('history.referenceComparison.visualDiff.heightChanged')}
              </span>
            ) : null}
            {rendered.scaled && <span>{t('history.referenceComparison.visualDiff.scaled')}</span>}
          </footer>
        )}
      </section>
    </div>,
    document.body,
  )
}

function DiffRegions({ regions, width, height }: { regions: VisualDiffRegion[]; width: number; height: number }) {
  return regions.map((region, index) => (
    <span
      key={`${region.x}:${region.y}:${region.width}:${region.height}:${index}`}
      aria-hidden="true"
      className="pointer-events-none absolute rounded-sm border-2 border-[#e13448] bg-[#e13448]/5"
      style={{
        left: `${(region.x / width) * 100}%`,
        top: `${(region.y / height) * 100}%`,
        width: `${(region.width / width) * 100}%`,
        height: `${(region.height / height) * 100}%`,
      }}
    />
  ))
}
