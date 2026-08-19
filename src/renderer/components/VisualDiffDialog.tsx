import { Loader2, X } from 'lucide-react'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import type { ComparisonVisualPair } from '../../shared/ipc-contract'
import { getScreenshotUrl } from '../lib/page-screenshots'
import { type VisualDiffRegion, createVisualDiff, fitVisualDiffPreview } from '../lib/visual-diff'

interface VisualDiffDialogProps {
  pairs: ComparisonVisualPair[]
  onClose: () => void
}

interface RenderedDiff {
  reference: Uint8ClampedArray
  target: Uint8ClampedArray
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
}

type VisualDiffError = 'load-failed' | 'width-mismatch'

const MAX_PREVIEW_WIDTH = 1200
const MAX_PREVIEW_PIXELS = 4_000_000

async function loadScreenshot(path: string): Promise<ImageBitmap> {
  const response = await fetch(getScreenshotUrl(path))
  if (!response.ok) throw new Error('Screenshot could not be loaded')
  return createImageBitmap(await response.blob())
}

function screenshotPixels(bitmap: ImageBitmap, width: number, height: number, scale: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable')
  context.drawImage(bitmap, 0, 0, width, bitmap.height * scale)
  return context.getImageData(0, 0, width, height)
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
  const referenceCanvas = useRef<HTMLCanvasElement>(null)
  const targetCanvas = useRef<HTMLCanvasElement>(null)
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

    Promise.all([loadScreenshot(pair.reference.path), loadScreenshot(pair.target.path)])
      .then(([reference, target]) => {
        try {
          if (reference.width !== target.width) {
            if (!cancelled) setError('width-mismatch')
            return
          }
          const geometry = fitVisualDiffPreview(
            reference.width,
            reference.height,
            target.width,
            target.height,
            MAX_PREVIEW_WIDTH,
            MAX_PREVIEW_PIXELS,
          )
          const { width, referenceHeight, targetHeight, scale } = geometry
          const referencePixels = screenshotPixels(reference, width, referenceHeight, scale)
          const targetPixels = screenshotPixels(target, width, targetHeight, scale)
          const diff = createVisualDiff(
            { width, height: referenceHeight, data: referencePixels.data },
            { width, height: targetHeight, data: targetPixels.data },
          )
          if (!cancelled) {
            setRendered({
              ...diff,
              reference: new Uint8ClampedArray(referencePixels.data),
              target: new Uint8ClampedArray(targetPixels.data),
              width,
              referenceHeight,
              targetHeight,
              originalReferenceWidth: reference.width,
              originalReferenceHeight: reference.height,
              originalTargetWidth: target.width,
              originalTargetHeight: target.height,
              scaled: geometry.scaled,
            })
          }
        } finally {
          reference.close()
          target.close()
        }
      })
      .catch(() => {
        if (!cancelled) setError('load-failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [pair])

  useEffect(() => {
    if (!rendered || !referenceCanvas.current || !targetCanvas.current) return
    referenceCanvas.current.width = rendered.width
    referenceCanvas.current.height = rendered.referenceHeight
    targetCanvas.current.width = rendered.width
    targetCanvas.current.height = rendered.targetHeight
    referenceCanvas.current
      .getContext('2d')
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(rendered.reference), rendered.width, rendered.referenceHeight),
        0,
        0,
      )
    targetCanvas.current
      .getContext('2d')
      ?.putImageData(new ImageData(new Uint8ClampedArray(rendered.target), rendered.width, rendered.targetHeight), 0, 0)
  }, [rendered])

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
            <span className="ml-auto shrink-0 text-muted-foreground">
              {t('history.referenceComparison.visualDiff.dimensions', {
                referenceWidth: rendered.originalReferenceWidth,
                referenceHeight: rendered.originalReferenceHeight,
                targetWidth: rendered.originalTargetWidth,
                targetHeight: rendered.originalTargetHeight,
              })}
            </span>
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
            <div className="mx-auto min-w-[720px] max-w-[1600px]">
              <div className="sticky top-0 z-10 grid grid-cols-2 gap-3 pb-2">
                <div className="rounded-md border border-border bg-background/95 px-3 py-2 text-xs font-medium shadow-sm">
                  {t('history.referenceComparison.reference')}
                </div>
                <div className="rounded-md border border-border bg-background/95 px-3 py-2 text-xs font-medium shadow-sm">
                  {t('history.referenceComparison.target')}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="overflow-hidden rounded-lg border border-border bg-warning/10">
                  <div className="relative">
                    <canvas ref={referenceCanvas} data-testid="visual-diff-reference" className="block h-auto w-full" />
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
                    <canvas ref={targetCanvas} data-testid="visual-diff-target" className="block h-auto w-full" />
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
