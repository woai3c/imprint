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
    <div role="tablist" className="flex items-center border-b border-border/60 bg-muted/40 px-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          data-testid={testIdPrefix ? `${testIdPrefix}-${tab.id}` : undefined}
          onClick={() => onChange(tab.id)}
          className={`cursor-pointer border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </button>
      ))}
      {trailing && <div className="ml-auto flex items-center gap-1 pr-1">{trailing}</div>}
    </div>
  )
}
