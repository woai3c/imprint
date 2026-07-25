/**
 * E-commerce template - a product listing page.
 * All styling uses CSS variables so theme switching works instantly.
 */
export function EcommerceTemplate() {
  const products = [
    { name: '极简台灯', price: '¥299', tag: '新品' },
    { name: '无线充电器', price: '¥159', tag: '热销' },
    { name: '机械键盘', price: '¥899', tag: '' },
    { name: '降噪耳机', price: '¥1,499', tag: '限时' },
    { name: '便携音箱', price: '¥399', tag: '' },
    { name: '智能手表', price: '¥2,299', tag: '新品' },
  ]

  return (
    <div className="min-h-[600px] bg-background text-foreground">
      {/* Header */}
      <header className="h-16 border-b border-border flex items-center px-8 bg-card">
        <span className="text-xl font-bold">Shop</span>
        <div className="ml-8 flex gap-6">
          {['全部', '电子', '家居', '配件'].map((cat) => (
            <span key={cat} className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">
              {cat}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="h-9 w-60 rounded-md border border-input bg-background px-3 flex items-center">
            <span className="text-sm text-muted-foreground">搜索商品...</span>
          </div>
          <button className="relative">
            <span className="text-sm">购物车</span>
            <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
              3
            </span>
          </button>
        </div>
      </header>

      {/* Product grid */}
      <div className="p-8">
        <h2 className="text-xl font-bold mb-6">精选商品</h2>
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
                    加入购物车
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
