import { useTranslation } from 'react-i18next'

export function AnalyticsTemplate() {
  const { t } = useTranslation()
  const metrics = [
    { key: 'views', value: '284,523', change: '+12.5%', up: true },
    { key: 'visitors', value: '45,678', change: '+8.2%', up: true },
    { key: 'bounce', value: '32.1%', change: '-2.3%', up: false },
    { key: 'duration', value: '4m 23s', change: '+15.7%', up: true },
  ].map(({ key, ...metric }) => ({ label: t(`templates.examples.analytics.metrics.${key}`), ...metric }))
  const sources = [
    { key: 'search', percent: 42, color: 'bg-primary' },
    { key: 'direct', percent: 28, color: 'bg-accent-foreground' },
    { key: 'social', percent: 18, color: 'bg-muted-foreground' },
    { key: 'referral', percent: 12, color: 'bg-border' },
  ].map(({ key, ...source }) => ({ name: t(`templates.examples.analytics.sources.${key}`), ...source }))

  return (
    <div className="min-h-[600px] bg-background text-foreground">
      <header className="h-14 border-b border-border flex items-center px-6 bg-card">
        <h1 className="text-lg font-bold">{t('templates.examples.analytics.title')}</h1>
        <div className="ml-auto flex items-center gap-3">
          <select className="h-8 px-3 rounded-md border border-input bg-background text-xs">
            <option>{t('templates.examples.analytics.ranges.seven')}</option>
            <option>{t('templates.examples.analytics.ranges.thirty')}</option>
            <option>{t('templates.examples.analytics.ranges.ninety')}</option>
          </select>
        </div>
      </header>

      <div className="p-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          {metrics.map((metric) => (
            <div key={metric.label} className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="text-xl font-bold mt-1">{metric.value}</p>
              <p className={`text-xs mt-1 ${metric.up ? 'text-primary' : 'text-destructive'}`}>{metric.change}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="col-span-2 bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-4">{t('templates.examples.analytics.trend')}</h3>
            <div className="h-48 flex items-end gap-2">
              {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/70 hover:bg-primary transition-colors"
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {t('templates.examples.analytics.month', { month: i + 1 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-4">{t('templates.examples.analytics.trafficSources')}</h3>
            <div className="space-y-3">
              {sources.map((item) => (
                <div key={item.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.percent}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('templates.examples.analytics.topPages')}</h3>
            <button className="text-xs text-primary hover:underline">
              {t('templates.examples.analytics.viewAll')}
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['page', 'views', 'bounce', 'duration'].map((key) => (
                  <th key={key} className="px-4 py-2.5 text-left text-xs text-muted-foreground font-medium">
                    {t(`templates.examples.analytics.table.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { page: '/home', views: '45,230', bounce: '28%', duration: '5m 12s' },
                { page: '/products', views: '32,100', bounce: '35%', duration: '3m 45s' },
                { page: '/blog/react-tips', views: '18,950', bounce: '22%', duration: '7m 30s' },
                { page: '/pricing', views: '12,340', bounce: '41%', duration: '2m 18s' },
              ].map((row) => (
                <tr key={row.page} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-sm font-mono text-primary">{row.page}</td>
                  <td className="px-4 py-2.5 text-sm">{row.views}</td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{row.bounce}</td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{row.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
