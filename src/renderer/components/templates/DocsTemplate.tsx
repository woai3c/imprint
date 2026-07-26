import { useTranslation } from 'react-i18next'

export function DocsTemplate() {
  const { t } = useTranslation()
  const sections = [
    { key: 'gettingStarted', items: ['install', 'configure', 'firstProject'], active: false },
    { key: 'concepts', items: ['components', 'state', 'routing'], active: true },
    { key: 'api', items: ['hooks', 'utilities', 'types'], active: false },
  ].map(({ key, items, active }) => ({
    title: t(`templates.examples.docs.navigation.${key}.title`),
    items: items.map((item) => t(`templates.examples.docs.navigation.${key}.items.${item}`)),
    active,
  }))
  const propertyRows = ['children', 'variant', 'disabled'].map((key) => ({
    property: key,
    type: t(`templates.examples.docs.properties.rows.${key}.type`),
    description: t(`templates.examples.docs.properties.rows.${key}.description`),
  }))
  const tableOfContents = ['components', 'properties', 'lifecycle', 'events'].map((key) =>
    t(`templates.examples.docs.tableOfContents.${key}`),
  )

  return (
    <div className="min-h-[600px] bg-background text-foreground flex">
      <aside className="w-56 border-r border-border bg-sidebar p-4">
        <h2 className="text-sm font-bold mb-3">{t('templates.examples.docs.title')}</h2>
        <nav className="space-y-0.5">
          {sections.map((section) => (
            <div key={section.title} className="mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-2">
                {section.title}
              </p>
              {section.items.map((item, i) => (
                <div
                  key={item}
                  className={`px-2 py-1.5 rounded text-sm transition-colors ${
                    section.active && i === 0
                      ? 'bg-sidebar-accent text-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                  }`}
                >
                  {item}
                </div>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-8 max-w-3xl">
        <div className="mb-6">
          <p className="text-xs text-muted-foreground mb-1">{t('templates.examples.docs.breadcrumb')}</p>
          <h1 className="text-2xl font-bold">{t('templates.examples.docs.articleTitle')}</h1>
        </div>

        <div className="prose-sm space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{t('templates.examples.docs.introduction')}</p>

          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-2 font-medium">{t('templates.examples.docs.codeExample')}</p>
            <pre className="text-xs font-mono bg-secondary rounded p-3 overflow-x-auto">
              <code>{`function Button({ children, variant }) {
  return (
    <button className={variant}>
      {children}
    </button>
  )
}`}</code>
            </pre>
          </div>

          <h2 className="text-lg font-semibold pt-4">{t('templates.examples.docs.properties.title')}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t('templates.examples.docs.properties.description')}
          </p>

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary">
                  <th className="px-4 py-2 text-left font-medium">
                    {t('templates.examples.docs.properties.property')}
                  </th>
                  <th className="px-4 py-2 text-left font-medium">{t('templates.examples.docs.properties.type')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('templates.examples.docs.properties.details')}</th>
                </tr>
              </thead>
              <tbody>
                {propertyRows.map((row) => (
                  <tr key={row.property} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs text-primary">{row.property}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{row.type}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-border">
            <span className="text-xs text-muted-foreground">{t('templates.examples.docs.previous')}</span>
            <span className="flex-1" />
            <span className="text-xs text-primary">{t('templates.examples.docs.next')} →</span>
          </div>
        </div>
      </main>

      <aside className="w-44 border-l border-border p-4 hidden xl:block">
        <p className="text-xs font-semibold text-muted-foreground mb-2">{t('templates.examples.docs.contents')}</p>
        <nav className="space-y-1">
          {tableOfContents.map((item, i) => (
            <a
              key={item}
              className={`block text-xs py-1 transition-colors ${
                i === 0 ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item}
            </a>
          ))}
        </nav>
      </aside>
    </div>
  )
}
