export function AnalyticsTemplate() {
  return (
    <div className="min-h-[600px] bg-background text-foreground">
      <header className="h-14 border-b border-border flex items-center px-6 bg-card">
        <h1 className="text-lg font-bold">数据分析</h1>
        <div className="ml-auto flex items-center gap-3">
          <select className="h-8 px-3 rounded-md border border-input bg-background text-xs">
            <option>最近 7 天</option>
            <option>最近 30 天</option>
            <option>最近 90 天</option>
          </select>
        </div>
      </header>

      <div className="p-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: '页面访问量', value: '284,523', change: '+12.5%', up: true },
            { label: '独立访客', value: '45,678', change: '+8.2%', up: true },
            { label: '跳出率', value: '32.1%', change: '-2.3%', up: false },
            { label: '平均停留', value: '4m 23s', change: '+15.7%', up: true },
          ].map((metric) => (
            <div key={metric.label} className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="text-xl font-bold mt-1">{metric.value}</p>
              <p className={`text-xs mt-1 ${metric.up ? 'text-primary' : 'text-destructive'}`}>{metric.change}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="col-span-2 bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-4">流量趋势</h3>
            <div className="h-48 flex items-end gap-2">
              {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/70 hover:bg-primary transition-colors"
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-[9px] text-muted-foreground">{i + 1}月</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-4">流量来源</h3>
            <div className="space-y-3">
              {[
                { source: '搜索引擎', percent: 42, color: 'bg-primary' },
                { source: '直接访问', percent: 28, color: 'bg-accent-foreground' },
                { source: '社交媒体', percent: 18, color: 'bg-muted-foreground' },
                { source: '外部链接', percent: 12, color: 'bg-border' },
              ].map((item) => (
                <div key={item.source}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs">{item.source}</span>
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
            <h3 className="text-sm font-semibold">热门页面</h3>
            <button className="text-xs text-primary hover:underline">查看全部</button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['页面', '访问量', '跳出率', '平均停留'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs text-muted-foreground font-medium">
                    {h}
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
