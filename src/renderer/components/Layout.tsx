import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', labelKey: 'nav.analyze' },
  { to: '/themes', labelKey: 'nav.themes' },
  { to: '/templates', labelKey: 'nav.templates' },
  { to: '/history', labelKey: 'nav.history' },
  { to: '/settings', labelKey: 'nav.settings' },
]

export function Layout() {
  const { t, i18n } = useTranslation()

  const toggleLanguage = () => {
    const next = i18n.language === 'zh-CN' ? 'en' : 'zh-CN'
    i18n.changeLanguage(next)
    localStorage.setItem('language', next)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-48 bg-sidebar text-sidebar-foreground border-r border-border flex flex-col">
        <div className="h-8 app-drag-region" />

        <div className="px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight">{t('app.name')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('app.tagline')}</p>
        </div>

        <nav className="flex-1 px-2 py-2 space-y-0.5">
          {navItems.map(({ to, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
                }`
              }
            >
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-border flex justify-end">
          <button
            onClick={toggleLanguage}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {i18n.language === 'zh-CN' ? 'EN' : '中'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
