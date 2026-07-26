import { useTranslation } from 'react-i18next'

export function LoginTemplate() {
  const { t } = useTranslation()

  return (
    <div className="min-h-[600px] bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-sm mx-auto">
        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary mx-auto flex items-center justify-center mb-4">
              <span className="text-primary-foreground text-xl font-bold">A</span>
            </div>
            <h1 className="text-xl font-bold">{t('templates.examples.login.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t('templates.examples.login.description')}</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">{t('templates.examples.login.email')}</label>
              <input
                type="email"
                placeholder="name@example.com"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">{t('templates.examples.login.password')}</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-primary" />
                {t('templates.examples.login.remember')}
              </label>
              <a className="text-sm text-primary hover:underline">{t('templates.examples.login.forgot')}</a>
            </div>

            <button className="w-full h-10 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
              {t('templates.examples.login.submit')}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('templates.examples.login.noAccount')}{' '}
              <a className="text-primary hover:underline">{t('templates.examples.login.signUp')}</a>
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center mb-3">
              {t('templates.examples.login.alternatives')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button className="h-9 rounded-md border border-border bg-background text-sm hover:bg-accent transition-colors">
                Google
              </button>
              <button className="h-9 rounded-md border border-border bg-background text-sm hover:bg-accent transition-colors">
                GitHub
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
