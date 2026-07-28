interface EmptyStateProps {
  title: string
  description: string
  hint?: string
  className?: string
}

export function EmptyState({ title, description, hint, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="max-w-md text-center">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {hint && <p className="mt-3 text-xs text-muted-foreground/60">{hint}</p>}
      </div>
    </div>
  )
}
