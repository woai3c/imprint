import { ArrowRight, GitCompareArrows, X } from 'lucide-react'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import type { AnalysisRecord } from '../../shared/ipc-contract'
import { laterRecordsFor } from '../lib/comparison-record-selection.js'
import { loadComparisonRecords, peekComparisonRecords } from '../lib/comparison-records-cache.js'
import { formatLocalDateTime } from '../lib/date-time'
import { Button } from './ui/Button'

interface CaptureComparisonPickerDialogProps {
  busy: boolean
  initialEarlierId?: string
  initialLaterId?: string
  onCompare: (earlier: AnalysisRecord, later: AnalysisRecord) => Promise<void>
  onClose: () => void
}

export function CaptureComparisonPickerDialog({
  busy,
  initialEarlierId,
  initialLaterId,
  onCompare,
  onClose,
}: CaptureComparisonPickerDialogProps) {
  const { t } = useTranslation()
  const initialRecords = peekComparisonRecords()
  const initialPair = initialRecords
    ? (selectedPair(initialRecords, initialEarlierId, initialLaterId) ?? defaultPair(initialRecords))
    : null
  const [records, setRecords] = useState<AnalysisRecord[]>(initialRecords ?? [])
  const [earlierId, setEarlierId] = useState(initialPair?.earlier.id ?? '')
  const [laterId, setLaterId] = useState(initialPair?.later.id ?? '')
  const [loading, setLoading] = useState(initialRecords === null)
  const [loadFailed, setLoadFailed] = useState(false)

  const earlierCandidates = useMemo(
    () => records.filter((record) => laterRecordsFor(record, records).length > 0),
    [records],
  )
  const selectedEarlier = records.find((record) => record.id === earlierId) ?? null
  const laterCandidates = useMemo(
    () => (selectedEarlier ? laterRecordsFor(selectedEarlier, records) : []),
    [records, selectedEarlier],
  )
  const selectedLater = laterCandidates.find((record) => record.id === laterId) ?? null

  useEffect(() => {
    let cancelled = false
    loadComparisonRecords()
      .then((nextRecords) => {
        if (cancelled) return
        setRecords(nextRecords)
        const pair = selectedPair(nextRecords, initialEarlierId, initialLaterId) ?? defaultPair(nextRecords)
        setEarlierId(pair?.earlier.id ?? '')
        setLaterId(pair?.later.id ?? '')
        setLoadFailed(false)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [initialEarlierId, initialLaterId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onClose])

  const selectEarlier = (nextEarlierId: string) => {
    const nextEarlier = records.find((record) => record.id === nextEarlierId) ?? null
    const nextLaterRecords = nextEarlier ? laterRecordsFor(nextEarlier, records) : []
    setEarlierId(nextEarlierId)
    setLaterId(nextLaterRecords[0]?.id ?? '')
  }

  return createPortal(
    <div
      data-testid="comparison-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
    >
      <section
        data-testid="comparison-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="comparison-picker-title"
        className="ui-enter flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <GitCompareArrows size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="comparison-picker-title" className="text-base font-semibold">
              {t('history.comparisonPicker.title')}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('history.comparisonPicker.description')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('common.close')}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {loading ? (
            <p className="flex h-40 items-center justify-center text-sm text-muted-foreground" role="status">
              {t('history.comparisonPicker.loading')}
            </p>
          ) : loadFailed ? (
            <p className="flex h-40 items-center justify-center text-sm text-destructive" role="alert">
              {t('history.comparisonPicker.loadFailed')}
            </p>
          ) : earlierCandidates.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <p className="text-sm font-medium">{t('history.comparisonPicker.emptyTitle')}</p>
              <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                {t('history.comparisonPicker.emptyDescription')}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                {t('history.comparisonPicker.comparabilityNote')}
              </p>
              <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-start">
                <CaptureSelector
                  kind="earlier"
                  label={t('history.comparisonPicker.earlierLabel')}
                  records={earlierCandidates}
                  selectedId={earlierId}
                  selected={selectedEarlier}
                  onChange={selectEarlier}
                />
                <ArrowRight className="mt-24 hidden text-muted-foreground md:block" size={18} aria-hidden="true" />
                <CaptureSelector
                  kind="later"
                  label={t('history.comparisonPicker.laterLabel')}
                  records={laterCandidates}
                  selectedId={laterId}
                  selected={selectedLater}
                  onChange={setLaterId}
                />
              </div>
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-background px-5 py-3">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            data-testid="comparison-picker-submit"
            loading={busy}
            disabled={!selectedEarlier || !selectedLater}
            onClick={() => {
              if (selectedEarlier && selectedLater) void onCompare(selectedEarlier, selectedLater)
            }}
          >
            {!busy && <GitCompareArrows size={16} aria-hidden="true" />}
            {t('history.comparisonPicker.compare')}
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

function CaptureSelector({
  kind,
  label,
  records,
  selectedId,
  selected,
  onChange,
}: {
  kind: 'earlier' | 'later'
  label: string
  records: AnalysisRecord[]
  selectedId: string
  selected: AnalysisRecord | null
  onChange: (id: string) => void
}) {
  const { t, i18n } = useTranslation()

  return (
    <div className="min-w-0 rounded-lg border border-border bg-card/30 p-4">
      <label htmlFor={`comparison-${kind}`} className="text-sm font-semibold">
        {label}
      </label>
      <select
        id={`comparison-${kind}`}
        data-testid={`comparison-picker-${kind}`}
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {records.map((record) => (
          <option key={record.id} value={record.id}>
            {optionLabel(record, i18n.language)}
          </option>
        ))}
      </select>
      {selected && (
        <div className="mt-3 min-w-0 rounded-md border border-border/70 bg-background p-3">
          <p className="truncate text-sm font-medium">{selected.site_name}</p>
          <p className="mt-1 break-all text-xs text-muted-foreground">{selected.url}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatLocalDateTime(selected.created_at, i18n.language)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('history.comparisonPicker.captureMeta', {
              count: selected.pages_analyzed,
              viewports: formatViewports(selected.viewports, t),
            })}
          </p>
        </div>
      )}
    </div>
  )
}

function defaultPair(records: AnalysisRecord[]): { earlier: AnalysisRecord; later: AnalysisRecord } | null {
  for (const earlier of records) {
    const [later] = laterRecordsFor(earlier, records)
    if (later) return { earlier, later }
  }
  return null
}

function selectedPair(
  records: AnalysisRecord[],
  earlierId?: string,
  laterId?: string,
): { earlier: AnalysisRecord; later: AnalysisRecord } | null {
  if (!earlierId || !laterId) return null
  const earlier = records.find((record) => record.id === earlierId)
  if (!earlier) return null
  const later = laterRecordsFor(earlier, records).find((record) => record.id === laterId)
  return later ? { earlier, later } : null
}

function optionLabel(record: AnalysisRecord, language: string): string {
  return `${record.site_name} · ${formatLocalDateTime(record.created_at, language)}`
}

function formatViewports(viewports: string, t: ReturnType<typeof useTranslation>['t']): string {
  try {
    const parsed = JSON.parse(viewports) as unknown
    if (!Array.isArray(parsed)) return viewports
    return parsed
      .filter((viewport): viewport is string => typeof viewport === 'string')
      .map((viewport) => t(`analyze.viewports.${viewport}`, { defaultValue: viewport }))
      .join(' · ')
  } catch {
    return viewports
  }
}
