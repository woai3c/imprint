import { Moon, Sun } from 'lucide-react'

import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'

import { isMacOS } from '../lib/platform'
import { useSkinStore } from '../stores/skin-store'
import { AppFeedback } from './AppFeedback'
import { LogoMark } from './LogoMark'

const navItems = [
  { to: '/', labelKey: 'nav.analyze' },
  { to: '/themes', labelKey: 'nav.themes' },
  { to: '/templates', labelKey: 'nav.templates' },
  { to: '/history', labelKey: 'nav.history' },
  { to: '/settings', labelKey: 'nav.settings' },
]

export function Layout() {
  const { t, i18n } = useTranslation()
  const { colorMode, setColorMode, currentThemeId } = useSkinStore()
  const macOS = isMacOS()

  const toggleLanguage = () => {
    const next = i18n.language === 'zh-CN' ? 'en' : 'zh-CN'
    i18n.changeLanguage(next)
    localStorage.setItem('language', next)
  }

  const toggleColorMode = () => {
    setColorMode(colorMode === 'light' ? 'dark' : 'light')
  }

  const isDarkToggleDisabled = currentThemeId !== 'default'

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <AppFeedback />
      <aside className="app-sidebar bg-sidebar text-sidebar-foreground border-r border-border flex flex-col">
        {macOS && <div className="h-8 app-drag-region shrink-0" />}

        <div className="app-brand px-4 py-3">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-8 shrink-0 text-foreground" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight">{t('app.name')}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{t('app.tagline')}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-2 space-y-0.5">
          {navItems.map(({ to, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `app-nav-link block px-3 py-2 rounded-md text-sm transition-colors ${
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
      </aside>

      <div className="app-workspace flex-1 flex flex-col overflow-hidden">
        <header
          className={`app-topbar h-8 flex items-center justify-end pr-4 shrink-0 border-b border-border ${
            macOS ? 'app-drag-region' : ''
          }`}
        >
          <div className="app-no-drag flex items-center gap-3">
            <button
              type="button"
              onClick={toggleColorMode}
              disabled={isDarkToggleDisabled}
              title={
                isDarkToggleDisabled
                  ? t('app.darkToggleDisabled')
                  : t(colorMode === 'light' ? 'app.switchToDark' : 'app.switchToLight')
              }
              aria-label={
                isDarkToggleDisabled
                  ? t('app.darkToggleDisabled')
                  : t(colorMode === 'light' ? 'app.switchToDark' : 'app.switchToLight')
              }
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            >
              {colorMode === 'light' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              type="button"
              onClick={toggleLanguage}
              title={t('app.switchLanguage')}
              aria-label={t('app.switchLanguage')}
              className="flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {i18n.language === 'zh-CN' ? 'EN' : '中'}
            </button>
          </div>
        </header>

        <main className="app-content flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
