/**
 * E-commerce template - a product listing page.
 * All styling uses CSS variables so theme switching works instantly.
 */
import { useTranslation } from 'react-i18next'

export function EcommerceTemplate() {
  const { t } = useTranslation()
  const products = ['lamp', 'charger', 'keyboard', 'headphones', 'speaker', 'watch'].map((key) => ({
    name: t(`templates.examples.ecommerce.products.${key}.name`),
    price: t(`templates.examples.ecommerce.products.${key}.price`),
    tag: t(`templates.examples.ecommerce.products.${key}.tag`),
  }))
  const categories = ['all', 'electronics', 'home', 'accessories'].map((key) =>
    t(`templates.examples.ecommerce.categories.${key}`),
  )

  return (
    <div className="min-h-[600px] bg-background text-foreground">
      {/* Header */}
      <header className="h-16 border-b border-border flex items-center px-8 bg-card">
        <span className="text-xl font-bold">{t('templates.examples.ecommerce.shop')}</span>
        <div className="ml-8 flex gap-6">
          {categories.map((cat) => (
            <span key={cat} className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">
              {cat}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="h-9 w-60 rounded-md border border-input bg-background px-3 flex items-center">
            <span className="text-sm text-muted-foreground">{t('templates.examples.ecommerce.search')}</span>
          </div>
          <button className="relative">
            <span className="text-sm">{t('templates.examples.ecommerce.cart')}</span>
            <span className="absolute -right-2 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              3
            </span>
          </button>
        </div>
      </header>

      {/* Product grid */}
      <div className="p-8">
        <h2 className="text-xl font-bold mb-6">{t('templates.examples.ecommerce.featured')}</h2>
        <div className="grid grid-cols-3 gap-5">
          {products.map((product) => (
            <div
              key={product.name}
              className="border border-border rounded-xl overflow-hidden bg-card group hover:shadow-lg transition-shadow"
            >
              {/* Image placeholder */}
              <div className="aspect-square bg-secondary flex items-center justify-center relative">
                <div className="w-20 h-20 rounded-2xl bg-muted" />
                {product.tag && (
                  <span className="absolute top-3 left-3 text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
                    {product.tag}
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-medium">{product.name}</h3>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-lg font-bold text-primary">{product.price}</span>
                  <button
                    className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium
                                     opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {t('templates.examples.ecommerce.addToCart')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
