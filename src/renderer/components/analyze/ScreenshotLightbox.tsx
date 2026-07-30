import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react'

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ScreenshotLightboxProps {
  images: string[]
  index: number
  highlight?: {
    rect: { x: number; y: number; width: number; height: number }
    label: string
  }
  onIndexChange: (index: number) => void
  onClose: () => void
}

export function ScreenshotLightbox({ images, index, highlight, onIndexChange, onClose }: ScreenshotLightboxProps) {
  const { t } = useTranslation()
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const hasPrev = index > 0
  const hasNext = index < images.length - 1

  const [lastIndex, setLastIndex] = useState(index)
  if (lastIndex !== index) {
    setLastIndex(index)
    setDragging(false)
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
      else if (event.key === 'ArrowRight' && index < images.length - 1) onIndexChange(index + 1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [index, images.length, onClose, onIndexChange])

  const zoom = (delta: number) => {
    const nextScale = Math.min(5, Math.max(0.25, scale + delta))
    setScale(nextScale)
    if (nextScale <= 1) {
      dragRef.current = null
      setDragging(false)
      setOffset({ x: 0, y: 0 })
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scale <= 1) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    }
    setDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    })
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    setDragging(false)
  }

  const src = images[index]

  return (
    <div
      data-testid="analysis-screenshot-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('analyze.evidence.lightboxTitle')}
      className="fixed inset-0 z-200 flex items-center justify-center overflow-hidden bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      onWheel={(e) => {
        e.preventDefault()
        zoom(e.deltaY < 0 ? 0.25 : -0.25)
      }}
    >
      <button
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        onClick={onClose}
        aria-label={t('common.close')}
      >
        <X size={20} />
      </button>
      {hasPrev && (
        <button
          data-testid="analysis-screenshot-prev"
          className="absolute top-1/2 left-4 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation()
            onIndexChange(index - 1)
          }}
          aria-label={t('analyze.evidence.prevScreenshot')}
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {hasNext && (
        <button
          data-testid="analysis-screenshot-next"
          className="absolute top-1/2 right-4 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation()
            onIndexChange(index + 1)
          }}
          aria-label={t('analyze.evidence.nextScreenshot')}
        >
          <ChevronRight size={22} />
        </button>
      )}
      <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">
        <button
          data-testid="analysis-screenshot-zoom-out"
          aria-label={t('analyze.evidence.zoomOut')}
          className="rounded-full p-1 text-white transition-colors hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation()
            zoom(-0.25)
          }}
        >
          <Minus size={16} />
        </button>
        <span className="min-w-12 text-center text-xs text-white">{Math.round(scale * 100)}%</span>
        <button
          data-testid="analysis-screenshot-zoom-in"
          aria-label={t('analyze.evidence.zoomIn')}
          className="rounded-full p-1 text-white transition-colors hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation()
            zoom(0.25)
          }}
        >
          <Plus size={16} />
        </button>
        {images.length > 1 && (
          <span className="border-l border-white/20 pl-2 text-xs text-white/80">
            {t('analyze.evidence.counter', { current: index + 1, total: images.length })}
          </span>
        )}
        {scale > 1 && (
          <span className="border-l border-white/20 pl-2 text-xs text-white/80">{t('analyze.evidence.dragHint')}</span>
        )}
      </div>
      <div
        className={`relative touch-none select-none ${
          scale > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        } ${dragging ? '' : 'transition-transform duration-150'}`}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <img
          data-testid="analysis-screenshot-lightbox-image"
          src={src}
          alt={t('analyze.evidence.lightboxAlt')}
          draggable={false}
          className="block max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          onDragStart={(e) => e.preventDefault()}
        />
        {highlight && (
          <div
            data-testid="analysis-evidence-highlight"
            className="pointer-events-none absolute rounded border-2 border-amber-300 bg-amber-300/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.16)]"
            style={{
              left: `${highlight.rect.x * 100}%`,
              top: `${highlight.rect.y * 100}%`,
              width: `${highlight.rect.width * 100}%`,
              height: `${highlight.rect.height * 100}%`,
            }}
          >
            <span className="absolute -top-7 left-0 max-w-64 truncate rounded bg-amber-300 px-2 py-1 font-mono text-[10px] text-black">
              {highlight.label}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
