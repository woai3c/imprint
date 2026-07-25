export function ChatTemplate() {
  return (
    <div className="min-h-[600px] bg-background text-foreground flex">
      <aside className="w-64 border-r border-border bg-sidebar p-3">
        <div className="mb-3">
          <input
            placeholder="搜索对话..."
            className="w-full h-8 px-3 rounded-md border border-input bg-background text-xs placeholder:text-muted-foreground"
          />
        </div>
        <div className="space-y-1">
          {[
            { name: '产品组', msg: '明天开会讨论需求', time: '10:30', unread: 3, active: true },
            { name: '张三', msg: '文档已经更新了', time: '09:15', unread: 0, active: false },
            { name: '设计团队', msg: '[图片]', time: '昨天', unread: 0, active: false },
            { name: '李四', msg: '收到，谢谢！', time: '昨天', unread: 0, active: false },
            { name: '客户支持', msg: '工单已处理', time: '周一', unread: 0, active: false },
          ].map((chat) => (
            <div
              key={chat.name}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                chat.active ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-muted-foreground">{chat.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{chat.name}</span>
                  <span className="text-[10px] text-muted-foreground">{chat.time}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{chat.msg}</p>
              </div>
              {chat.unread > 0 && (
                <span className="w-4.5 h-4.5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                  {chat.unread}
                </span>
              )}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border flex items-center px-5 bg-card">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mr-3">
            <span className="text-xs font-medium text-muted-foreground">产</span>
          </div>
          <div>
            <p className="text-sm font-medium">产品组</p>
            <p className="text-[10px] text-muted-foreground">5 位成员</p>
          </div>
        </header>

        <div className="flex-1 p-5 space-y-4 overflow-auto">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-muted shrink-0 flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground">张</span>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">张三 · 10:28</p>
              <div className="bg-secondary rounded-lg rounded-tl-none px-3 py-2 max-w-xs">
                <p className="text-sm">大家好，明天下午 2 点开会，讨论 Q3 的需求规划</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-muted shrink-0 flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground">李</span>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">李四 · 10:29</p>
              <div className="bg-secondary rounded-lg rounded-tl-none px-3 py-2 max-w-xs">
                <p className="text-sm">收到，我准备一下用户调研数据</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 text-right">你 · 10:30</p>
              <div className="bg-primary text-primary-foreground rounded-lg rounded-tr-none px-3 py-2 max-w-xs">
                <p className="text-sm">好的，我把上次的 PRD 文档更新一下带过去</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border bg-card">
          <div className="flex gap-3">
            <input
              placeholder="输入消息..."
              className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground"
            />
            <button className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">发送</button>
          </div>
        </div>
      </div>
    </div>
  )
}
