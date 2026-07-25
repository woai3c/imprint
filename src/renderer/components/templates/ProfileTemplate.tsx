export function ProfileTemplate() {
  return (
    <div className="min-h-[600px] bg-background text-foreground">
      <div className="h-32 bg-primary/10" />

      <div className="max-w-3xl mx-auto px-6 -mt-16">
        <div className="flex items-end gap-4 mb-6">
          <div className="w-24 h-24 rounded-full bg-primary border-4 border-background flex items-center justify-center">
            <span className="text-primary-foreground text-2xl font-bold">U</span>
          </div>
          <div className="pb-2">
            <h1 className="text-xl font-bold">张三</h1>
            <p className="text-sm text-muted-foreground">全栈开发工程师 · 北京</p>
          </div>
          <button className="ml-auto mb-2 px-4 py-2 rounded-md border border-border text-sm hover:bg-accent transition-colors">
            编辑资料
          </button>
        </div>

        <div className="flex gap-6 border-b border-border mb-6">
          {['动态', '文章', '项目', '收藏'].map((tab, i) => (
            <button
              key={tab}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                i === 0
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: '文章', value: '42' },
            { label: '关注者', value: '1,289' },
            { label: '关注中', value: '186' },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-lg p-4 text-center">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {[
            { title: '构建高性能 React 应用', time: '2 小时前', likes: 128 },
            { title: 'TypeScript 5.0 新特性解读', time: '1 天前', likes: 256 },
            { title: '从零搭建设计系统', time: '3 天前', likes: 89 },
          ].map((post) => (
            <div key={post.title} className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-medium">{post.title}</h3>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-xs text-muted-foreground">{post.time}</span>
                <span className="text-xs text-muted-foreground">♡ {post.likes}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
