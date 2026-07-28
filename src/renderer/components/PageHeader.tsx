interface PageHeaderProps {
  title: string
  description: string
  actions?: React.ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header flex items-start justify-between gap-6 px-8 pb-4 pt-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="app-no-drag shrink-0">{actions}</div>}
    </header>
  )
}
