/**
 * Landing page template - a modern product homepage.
 * All styling uses CSS variables so theme switching works instantly.
 */
import { useTranslation } from 'react-i18next'

export function LandingTemplate() {
  const { t } = useTranslation()
  const navigation = ['product', 'pricing', 'docs', 'blog'].map((key) =>
    t(`templates.examples.landing.navigation.${key}`),
  )
  const features = ['extract', 'export', 'preview'].map((key) => ({
    title: t(`templates.examples.landing.features.${key}.title`),
    description: t(`templates.examples.landing.features.${key}.description`),
  }))

  return (
    <div className="min-h-[600px] bg-background text-foreground">
      {/* Navigation */}
      <nav className="h-16 border-b border-border flex items-center px-8 bg-card">
        <span className="text-xl font-bold text-primary">{t('templates.examples.landing.brand')}</span>
        <div className="ml-auto flex items-center gap-6">
          {navigation.map((item) => (
            <span key={item} className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">
              {item}
            </span>
          ))}
          <button className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
            {t('templates.examples.landing.getStarted')}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-8 py-20 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold leading-tight">
          {t('templates.examples.landing.hero.title')}
          <br />
          <span className="text-primary">{t('templates.examples.landing.hero.highlight')}</span>
        </h1>
        <p className="text-lg text-muted-foreground mt-4 max-w-xl mx-auto">
          {t('templates.examples.landing.hero.description')}
        </p>
        <div className="flex gap-3 justify-center mt-8">
          <button className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium">
            {t('templates.examples.landing.hero.primaryAction')}
          </button>
          <button className="px-6 py-3 rounded-lg border border-border text-foreground font-medium">
            {t('templates.examples.landing.hero.secondaryAction')}
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="px-8 py-16 bg-secondary/50">
        <h2 className="text-2xl font-bold text-center mb-10">{t('templates.examples.landing.featuresTitle')}</h2>
        <div className="grid grid-cols-3 gap-6 max-w-4xl mx-auto">
          {features.map((feature) => (
            <div key={feature.title} className="bg-card border border-border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <div className="w-5 h-5 rounded bg-primary" />
              </div>
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 py-16 text-center">
        <h2 className="text-2xl font-bold">{t('templates.examples.landing.cta.title')}</h2>
        <p className="text-muted-foreground mt-2">{t('templates.examples.landing.cta.description')}</p>
        <button className="mt-6 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-medium">
          {t('templates.examples.landing.cta.action')}
        </button>
      </section>
    </div>
  )
}
