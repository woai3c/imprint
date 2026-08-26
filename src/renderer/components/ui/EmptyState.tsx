import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  hint?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, hint, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="max-w-md text-center">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {hint && <p className="mt-3 text-xs text-muted-foreground">{hint}</p>}
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </div>
  )
}
