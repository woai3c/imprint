/**
 * Dashboard template - a classic admin panel layout.
 * All styling uses CSS variables so theme switching works instantly.
 */
import { useTranslation } from 'react-i18next'

export function DashboardTemplate() {
  const { t } = useTranslation()
  const navigation = ['overview', 'users', 'orders', 'analytics', 'settings'].map((key) =>
    t(`templates.examples.dashboard.navigation.${key}`),
  )
  const stats = ['users', 'active', 'revenue', 'conversion'].map((key) => ({
    label: t(`templates.examples.dashboard.stats.${key}.label`),
    value: t(`templates.examples.dashboard.stats.${key}.value`),
  }))
  const orders = [
    { id: '#1001', customerKey: 'first', amountKey: 'first', statusKey: 'complete' },
    { id: '#1002', customerKey: 'second', amountKey: 'second', statusKey: 'processing' },
    { id: '#1003', customerKey: 'third', amountKey: 'third', statusKey: 'shipped' },
  ].map(({ id, customerKey, amountKey, statusKey }) => ({
    id,
    customer: t(`templates.examples.dashboard.customers.${customerKey}`),
    amount: t(`templates.examples.dashboard.amounts.${amountKey}`),
    status: t(`templates.examples.dashboard.statuses.${statusKey}`),
  }))

  return (
    <div className="min-h-[600px] bg-background text-foreground">
      {/* Top bar */}
      <header className="h-14 border-b border-border flex items-center px-6 bg-card">
        <h1 className="text-lg font-bold text-foreground">{t('templates.examples.dashboard.title')}</h1>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-sm text-muted-foreground">admin@example.com</span>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
            A
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-52 border-r border-border min-h-[550px] bg-sidebar p-4">
          <nav className="space-y-1">
            {navigation.map((item, i) => (
              <div
                key={item}
                className={`px-3 py-2 rounded-md text-sm ${
                  i === 0
                    ? 'bg-sidebar-accent text-foreground font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
              >
                {item}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 p-6">
          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-card border border-border rounded-lg">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">{t('templates.examples.dashboard.recentOrders')}</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {['order', 'customer', 'amount', 'status'].map((key) => (
                    <th key={key} className="px-4 py-3 text-left text-sm text-muted-foreground font-medium">
                      {t(`templates.examples.dashboard.table.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm">{row.id}</td>
                    <td className="px-4 py-3 text-sm">{row.customer}</td>
                    <td className="px-4 py-3 text-sm font-medium">{row.amount}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
