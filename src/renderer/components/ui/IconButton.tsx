import type { LucideIcon } from 'lucide-react'

import type { ButtonHTMLAttributes } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  iconSize?: number
}

export function IconButton({ icon: Icon, label, iconSize = 14, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      <Icon size={iconSize} aria-hidden="true" />
    </button>
  )
}
