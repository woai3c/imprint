export function KanbanTemplate() {
  return (
    <div className="min-h-[600px] bg-background text-foreground">
      <header className="h-14 border-b border-border flex items-center px-6 bg-card">
        <h1 className="text-lg font-bold">项目看板</h1>
        <div className="ml-auto flex items-center gap-3">
          <button className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium">
            + 新建任务
          </button>
        </div>
      </header>

      <div className="p-6 flex gap-5 overflow-x-auto">
        {[
          {
            title: '待办',
            color: 'bg-muted-foreground',
            cards: [
              { title: '设计首页原型', tags: ['设计'], priority: '高' },
              { title: '编写 API 文档', tags: ['文档'], priority: '中' },
              { title: '用户反馈收集', tags: ['产品'], priority: '低' },
            ],
          },
          {
            title: '进行中',
            color: 'bg-primary',
            cards: [
              { title: '实现登录功能', tags: ['开发', '后端'], priority: '高' },
              { title: '优化数据库查询', tags: ['开发'], priority: '中' },
            ],
          },
          {
            title: '测试中',
            color: 'bg-accent-foreground',
            cards: [{ title: '支付流程测试', tags: ['QA'], priority: '高' }],
          },
          {
            title: '已完成',
            color: 'bg-primary',
            cards: [
              { title: '项目初始化', tags: ['开发'], priority: '低' },
              { title: '需求评审', tags: ['产品'], priority: '中' },
            ],
          },
        ].map((column) => (
          <div key={column.title} className="w-64 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
              <h3 className="text-sm font-semibold">{column.title}</h3>
              <span className="text-xs text-muted-foreground ml-auto">{column.cards.length}</span>
            </div>

            <div className="space-y-2.5">
              {column.cards.map((card) => (
                <div
                  key={card.title}
                  className="bg-card border border-border rounded-lg p-3 hover:border-primary/30 transition-colors cursor-pointer"
                >
                  <p className="text-sm font-medium mb-2">{card.title}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {card.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ml-auto ${
                        card.priority === '高'
                          ? 'bg-destructive/10 text-destructive'
                          : card.priority === '中'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {card.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
