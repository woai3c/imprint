import { X } from 'lucide-react'

import { useTranslation } from 'react-i18next'

export interface EvidenceDetailField {
  label: string
  value: string
}

export interface EvidenceDetailData {
  id: string
  kind: string
  fields: EvidenceDetailField[]
}

export function EvidenceDetailCard({ detail, onClose }: { detail: EvidenceDetailData; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      data-testid="evidence-detail-card"
      role="status"
      className="fixed right-6 bottom-6 z-50 w-80 rounded-xl border border-border bg-background p-4 shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('analyze.evidenceDetail.title')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(`analyze.evidenceDetail.kinds.${detail.kind}`, t('analyze.evidenceDetail.kinds.unknown'))}
          </p>
        </div>
        <button
          type="button"
          data-testid="evidence-detail-close"
          aria-label={t('analyze.evidenceDetail.close')}
          onClick={onClose}
          className="inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={14} />
        </button>
      </div>
      <p className="mt-2 font-mono text-[10px] break-all text-muted-foreground">{detail.id}</p>
      {detail.fields.length > 0 && (
        <dl className="mt-2 space-y-1">
          {detail.fields.map((field) => (
            <div key={field.label} className="flex gap-2 text-xs">
              <dt className="shrink-0 text-muted-foreground">{field.label}</dt>
              <dd className="min-w-0 break-words">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-[10px] leading-4 text-muted-foreground">{t('analyze.evidenceDetail.noRegion')}</p>
    </div>
  )
}
