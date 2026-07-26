import { Info } from 'lucide-react'

import { useId } from 'react'

export function InfoTip({ text, align = 'left' }: { text: string; align?: 'left' | 'right' }) {
  const tooltipId = useId()

  return (
    <span className="group/info relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={text}
        aria-describedby={tooltipId}
        className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info size={14} aria-hidden="true" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-50 mt-1.5 w-80 rounded-lg border border-border bg-foreground px-3 py-2 text-xs font-normal leading-5 text-background opacity-0 shadow-md transition-opacity group-hover/info:visible group-hover/info:opacity-100 group-focus-within/info:visible group-focus-within/info:opacity-100 ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        {text}
      </span>
    </span>
  )
}
