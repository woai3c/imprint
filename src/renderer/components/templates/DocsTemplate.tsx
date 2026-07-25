export function DocsTemplate() {
  return (
    <div className="min-h-[600px] bg-background text-foreground flex">
      <aside className="w-56 border-r border-border bg-sidebar p-4">
        <h2 className="text-sm font-bold mb-3">文档</h2>
        <nav className="space-y-0.5">
          {[
            { title: '快速开始', active: false, items: ['安装', '配置', '第一个项目'] },
            { title: '核心概念', active: true, items: ['组件', '状态管理', '路由'] },
            { title: 'API 参考', active: false, items: ['Hooks', '工具函数', '类型定义'] },
          ].map((section) => (
            <div key={section.title} className="mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-2">
                {section.title}
              </p>
              {section.items.map((item, i) => (
                <div
                  key={item}
                  className={`px-2 py-1.5 rounded text-sm transition-colors ${
                    section.active && i === 0
                      ? 'bg-sidebar-accent text-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                  }`}
                >
                  {item}
                </div>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-8 max-w-3xl">
        <div className="mb-6">
          <p className="text-xs text-muted-foreground mb-1">核心概念</p>
          <h1 className="text-2xl font-bold">组件</h1>
        </div>

        <div className="prose-sm space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            组件是构建用户界面的基本单元。每个组件封装了一段可复用的 UI 逻辑，
            可以接受参数（props）并返回描述屏幕内容的元素。
          </p>

          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-2 font-medium">示例代码</p>
            <pre className="text-xs font-mono bg-secondary rounded p-3 overflow-x-auto">
              <code>{`function Button({ children, variant }) {
  return (
    <button className={variant}>
      {children}
    </button>
  )
}`}</code>
            </pre>
          </div>

          <h2 className="text-lg font-semibold pt-4">组件属性</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            通过 props 传递数据给子组件。Props 是只读的，组件不能修改自身的 props。
          </p>

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary">
                  <th className="px-4 py-2 text-left font-medium">属性</th>
                  <th className="px-4 py-2 text-left font-medium">类型</th>
                  <th className="px-4 py-2 text-left font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { prop: 'children', type: 'ReactNode', desc: '子元素内容' },
                  { prop: 'variant', type: 'string', desc: '样式变体' },
                  { prop: 'disabled', type: 'boolean', desc: '是否禁用' },
                ].map((row) => (
                  <tr key={row.prop} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs text-primary">{row.prop}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{row.type}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-border">
            <span className="text-xs text-muted-foreground">上一篇: 路由</span>
            <span className="flex-1" />
            <span className="text-xs text-primary">下一篇: 状态管理 →</span>
          </div>
        </div>
      </main>

      <aside className="w-44 border-l border-border p-4 hidden xl:block">
        <p className="text-xs font-semibold text-muted-foreground mb-2">目录</p>
        <nav className="space-y-1">
          {['组件', '组件属性', '生命周期', '事件处理'].map((item, i) => (
            <a
              key={item}
              className={`block text-xs py-1 transition-colors ${
                i === 0 ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item}
            </a>
          ))}
        </nav>
      </aside>
    </div>
  )
}
