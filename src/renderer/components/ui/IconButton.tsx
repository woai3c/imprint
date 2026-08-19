import type { LucideIcon } from 'lucide-react'

import { type ButtonHTMLAttributes, useId } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  iconSize?: number
  showTooltip?: boolean
}

export function IconButton({
  icon: Icon,
  label,
  iconSize = 14,
  showTooltip = false,
  className = '',
  ...rest
}: IconButtonProps) {
  const tooltipId = useId()

  return (
    <button
      type="button"
      title={showTooltip ? undefined : label}
      aria-label={label}
      aria-describedby={showTooltip ? tooltipId : undefined}
      className={`group/icon-button relative flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      <Icon size={iconSize} aria-hidden="true" />
      {showTooltip && (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none invisible absolute right-0 top-full z-60 mt-2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover/icon-button:visible group-hover/icon-button:opacity-100 group-focus-visible/icon-button:visible group-focus-visible/icon-button:opacity-100"
        >
          {label}
        </span>
      )}
    </button>
  )
}
