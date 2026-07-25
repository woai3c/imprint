/**
 * Landing page template - a modern product homepage.
 * All styling uses CSS variables so theme switching works instantly.
 */
export function LandingTemplate() {
  return (
    <div className="min-h-[600px] bg-background text-foreground">
      {/* Navigation */}
      <nav className="h-16 border-b border-border flex items-center px-8 bg-card">
        <span className="text-xl font-bold text-primary">Brand</span>
        <div className="ml-auto flex items-center gap-6">
          {['产品', '定价', '文档', '博客'].map((item) => (
            <span key={item} className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">
              {item}
            </span>
          ))}
          <button className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
            开始使用
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-8 py-20 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold leading-tight">
          构建更好的产品
          <br />
          <span className="text-primary">从设计开始</span>
        </h1>
        <p className="text-lg text-muted-foreground mt-4 max-w-xl mx-auto">
          一站式设计系统提取工具，帮助你快速复用优秀网站的设计语言，让 AI 更好地理解你的设计意图。
        </p>
        <div className="flex gap-3 justify-center mt-8">
          <button className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium">免费开始</button>
          <button className="px-6 py-3 rounded-lg border border-border text-foreground font-medium">查看演示</button>
        </div>
      </section>

      {/* Features */}
      <section className="px-8 py-16 bg-secondary/50">
        <h2 className="text-2xl font-bold text-center mb-10">核心特性</h2>
        <div className="grid grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            { title: '一键提取', desc: '输入 URL 即可提取完整设计系统' },
            { title: '多格式导出', desc: 'CSS 变量、Tailwind、JSON 令牌' },
            { title: '实时预览', desc: '即时查看主题切换效果' },
          ].map((feature) => (
            <div key={feature.title} className="bg-card border border-border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <div className="w-5 h-5 rounded bg-primary" />
              </div>
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 py-16 text-center">
        <h2 className="text-2xl font-bold">准备好了吗？</h2>
        <p className="text-muted-foreground mt-2">免费开源，无需注册</p>
        <button className="mt-6 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-medium">立即下载</button>
      </section>
    </div>
  )
}
