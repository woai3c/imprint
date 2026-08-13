import { Clock3, LayoutTemplate, Moon, Palette, ScanSearch, Settings, Sun } from 'lucide-react'

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'

import { isMacOS } from '../lib/platform'
import { normalizeLanguage } from '../lib/preferences'
import { useSkinStore } from '../stores/skin-store'
import { AppFeedback } from './AppFeedback'

const navItems = [
  { to: '/', labelKey: 'nav.analyze', icon: ScanSearch },
  { to: '/themes', labelKey: 'nav.themes', icon: Palette },
  { to: '/templates', labelKey: 'nav.templates', icon: LayoutTemplate },
  { to: '/history', labelKey: 'nav.history', icon: Clock3 },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `app-nav-link flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
    isActive
      ? 'bg-sidebar-accent font-medium text-foreground'
      : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
  }`

export function Layout() {
  const { t, i18n } = useTranslation()
  const colorMode = useSkinStore((state) => state.colorMode)
  const setColorMode = useSkinStore((state) => state.setColorMode)
  const supportsColorModeToggle = useSkinStore((state) => state.currentThemeId === 'default')
  const macOS = isMacOS()

  useEffect(() => {
    document.title = t('app.name')
  }, [i18n.language, t])

  const toggleLanguage = () => {
    const next = normalizeLanguage(i18n.resolvedLanguage || i18n.language) === 'zh-CN' ? 'en' : 'zh-CN'
    void i18n.changeLanguage(next)
  }

  const toggleColorMode = () => {
    setColorMode(colorMode === 'light' ? 'dark' : 'light')
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <AppFeedback />
      <aside className="app-sidebar bg-sidebar text-sidebar-foreground border-r border-border flex flex-col">
        {macOS && <div className="h-8 app-drag-region shrink-0" />}

        <nav className="flex-1 space-y-0.5 px-2 pt-3">
          {navItems.map(({ to, labelKey, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass}>
              <Icon size={16} aria-hidden="true" />
              <span>{t(labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border/60 px-2 pb-3 pt-2">
          <NavLink to="/settings" className={navLinkClass}>
            <Settings size={16} aria-hidden="true" />
            <span>{t('nav.settings')}</span>
          </NavLink>
        </div>
      </aside>

      <div className="app-workspace flex-1 flex flex-col overflow-hidden">
        <header
          className={`app-topbar h-8 flex items-center justify-end pr-4 shrink-0 border-b border-border ${
            macOS ? 'app-drag-region' : ''
          }`}
        >
          <div className="app-no-drag flex items-center gap-3">
            {supportsColorModeToggle && (
              <button
                type="button"
                onClick={toggleColorMode}
                title={t(colorMode === 'light' ? 'app.switchToDark' : 'app.switchToLight')}
                aria-label={t(colorMode === 'light' ? 'app.switchToDark' : 'app.switchToLight')}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {colorMode === 'light' ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            )}
            <button
              type="button"
              onClick={toggleLanguage}
              title={t('app.switchLanguage')}
              aria-label={t('app.switchLanguage')}
              className="flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {t('app.languageSwitchTarget')}
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
