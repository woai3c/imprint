/**
 * Blog template - a clean article listing page.
 * All styling uses CSS variables so theme switching works instantly.
 */
export function BlogTemplate() {
  const posts = [
    {
      title: '如何构建可扩展的设计系统',
      date: '2026-07-20',
      tag: '设计',
      excerpt: '设计系统不仅是颜色和字体的集合，更是团队协作的基础设施...',
    },
    {
      title: 'Tailwind CSS v4 完全指南',
      date: '2026-07-15',
      tag: '前端',
      excerpt: 'Tailwind v4 带来了革命性的 CSS-first 架构，让设计令牌管理变得前所未有的简单...',
    },
    {
      title: 'AI 驱动的 UI 开发工作流',
      date: '2026-07-10',
      tag: 'AI',
      excerpt: '通过提取设计系统并交给 AI，你可以实现快速的 UI 开发迭代...',
    },
  ]

  return (
    <div className="min-h-[600px] bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border py-6 px-8">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">Dev Blog</h1>
          <nav className="flex gap-5">
            {['文章', '教程', '关于'].map((item) => (
              <span key={item} className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">
                {item}
              </span>
            ))}
          </nav>
        </div>
      </header>

      {/* Posts */}
      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="space-y-8">
          {posts.map((post) => (
            <article key={post.title} className="pb-8 border-b border-border last:border-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {post.tag}
                </span>
                <span className="text-xs text-muted-foreground">{post.date}</span>
              </div>
              <h2 className="text-xl font-bold hover:text-primary cursor-pointer transition-colors">{post.title}</h2>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{post.excerpt}</p>
              <span className="text-primary text-sm font-medium mt-3 inline-block cursor-pointer">阅读更多 →</span>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
