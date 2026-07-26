/**
 * Blog template - a clean article listing page.
 * All styling uses CSS variables so theme switching works instantly.
 */
import { useTranslation } from 'react-i18next'

export function BlogTemplate() {
  const { t } = useTranslation()
  const posts = [
    { key: 'designSystem', date: '2026-07-20' },
    { key: 'tailwind', date: '2026-07-15' },
    { key: 'aiWorkflow', date: '2026-07-10' },
  ].map(({ key, date }) => ({
    title: t(`templates.examples.blog.posts.${key}.title`),
    tag: t(`templates.examples.blog.posts.${key}.tag`),
    excerpt: t(`templates.examples.blog.posts.${key}.excerpt`),
    date,
  }))
  const navigation = ['articles', 'tutorials', 'about'].map((key) => t(`templates.examples.blog.navigation.${key}`))

  return (
    <div className="min-h-[600px] bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border py-6 px-8">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">{t('templates.examples.blog.title')}</h1>
          <nav className="flex gap-5">
            {navigation.map((item) => (
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
              <span className="text-primary text-sm font-medium mt-3 inline-block cursor-pointer">
                {t('templates.examples.blog.readMore')} →
              </span>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
