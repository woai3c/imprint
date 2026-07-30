interface TabItem {
  id: string
  label: string
}

interface TabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (id: string) => void
  testIdPrefix?: string
  trailing?: React.ReactNode
}

export function Tabs({ tabs, activeTab, onChange, testIdPrefix, trailing }: TabsProps) {
  return (
    <div className="flex items-center border-b border-border/60 bg-muted/40 px-3">
      <div role="tablist" className="flex min-w-0 items-center overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            data-testid={testIdPrefix ? `${testIdPrefix}-${tab.id}` : undefined}
            onClick={() => onChange(tab.id)}
            className={`shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {trailing && <div className="ml-auto flex shrink-0 items-center gap-1 pr-1">{trailing}</div>}
    </div>
  )
}
