import { useTranslation } from 'react-i18next'

export function PricingTemplate() {
  const { t } = useTranslation()
  const planKeys = ['free', 'pro', 'enterprise'] as const
  const plans = planKeys.map((key) => ({
    name: t(`templates.examples.pricing.plans.${key}.name`),
    price: t(`templates.examples.pricing.plans.${key}.price`),
    period: t(`templates.examples.pricing.plans.${key}.period`),
    features: [0, 1, 2, 3, 4, 5]
      .map((index) => t(`templates.examples.pricing.plans.${key}.features.${index}`, { defaultValue: '' }))
      .filter(Boolean),
    cta: t(`templates.examples.pricing.plans.${key}.cta`),
    highlighted: key === 'pro',
  }))

  return (
    <div className="min-h-[600px] bg-background text-foreground py-12 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold">{t('templates.examples.pricing.title')}</h1>
          <p className="text-muted-foreground mt-2">{t('templates.examples.pricing.description')}</p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl border p-6 flex flex-col ${
                plan.highlighted
                  ? 'border-primary ring-2 ring-primary/20 bg-card shadow-lg scale-105'
                  : 'border-border bg-card'
              }`}
            >
              {plan.highlighted && (
                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full w-fit mb-3">
                  {t('templates.examples.pricing.popular')}
                </span>
              )}
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <span className="text-primary">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                className={`mt-6 w-full h-10 rounded-md font-medium text-sm transition-opacity hover:opacity-90 ${
                  plan.highlighted ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">{t('templates.examples.pricing.footnote')}</p>
        </div>
      </div>
    </div>
  )
}
