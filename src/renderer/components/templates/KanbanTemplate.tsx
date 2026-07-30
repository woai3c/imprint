import { useTranslation } from 'react-i18next'

export function KanbanTemplate() {
  const { t } = useTranslation()
  const card = (key: string, tags: string[], priority: 'high' | 'medium' | 'low') => ({
    title: t(`templates.examples.kanban.cards.${key}`),
    tags: tags.map((tag) => t(`templates.examples.kanban.tags.${tag}`)),
    priority,
    priorityLabel: t(`templates.examples.kanban.priorities.${priority}`),
  })
  const columns = [
    {
      title: t('templates.examples.kanban.columns.todo'),
      color: 'bg-muted-foreground',
      cards: [
        card('homepage', ['design'], 'high'),
        card('apiDocs', ['docs'], 'medium'),
        card('feedback', ['product'], 'low'),
      ],
    },
    {
      title: t('templates.examples.kanban.columns.progress'),
      color: 'bg-primary',
      cards: [card('login', ['development', 'backend'], 'high'), card('database', ['development'], 'medium')],
    },
    {
      title: t('templates.examples.kanban.columns.testing'),
      color: 'bg-accent-foreground',
      cards: [card('payment', ['qa'], 'high')],
    },
    {
      title: t('templates.examples.kanban.columns.done'),
      color: 'bg-primary',
      cards: [card('initialization', ['development'], 'low'), card('review', ['product'], 'medium')],
    },
  ]

  return (
    <div className="min-h-[600px] bg-background text-foreground">
      <header className="h-14 border-b border-border flex items-center px-6 bg-card">
        <h1 className="text-lg font-bold">{t('templates.examples.kanban.title')}</h1>
        <div className="ml-auto flex items-center gap-3">
          <button className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium">
            + {t('templates.examples.kanban.newTask')}
          </button>
        </div>
      </header>

      <div className="p-6 flex gap-5 overflow-x-auto">
        {columns.map((column) => (
          <div key={column.title} className="w-64 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
              <h3 className="text-sm font-semibold">{column.title}</h3>
              <span className="text-xs text-muted-foreground ml-auto">{column.cards.length}</span>
            </div>

            <div className="space-y-2.5">
              {column.cards.map((card) => (
                <div
                  key={card.title}
                  className="bg-card border border-border rounded-lg p-3 hover:border-primary/30 transition-colors cursor-pointer"
                >
                  <p className="text-sm font-medium mb-2">{card.title}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {card.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                    <span
                      className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${
                        card.priority === 'high'
                          ? 'bg-destructive/10 text-destructive'
                          : card.priority === 'medium'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {card.priorityLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
