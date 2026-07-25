export function SettingsTemplate() {
  return (
    <div className="min-h-[600px] bg-background text-foreground">
      <header className="h-14 border-b border-border flex items-center px-6 bg-card">
        <h1 className="text-lg font-bold">设置</h1>
      </header>

      <div className="max-w-2xl mx-auto py-8 px-6 space-y-8">
        <section>
          <h2 className="text-base font-semibold mb-4">个人信息</h2>
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">A</span>
              </div>
              <div>
                <p className="font-medium">Admin User</p>
                <p className="text-sm text-muted-foreground">admin@example.com</p>
              </div>
              <button className="ml-auto text-sm text-primary hover:underline">更换头像</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">姓名</label>
                <input
                  defaultValue="Admin User"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">邮箱</label>
                <input
                  defaultValue="admin@example.com"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-4">通知设置</h2>
          <div className="bg-card border border-border rounded-lg divide-y divide-border">
            {[
              { label: '邮件通知', desc: '接收重要更新和通知', enabled: true },
              { label: '推送通知', desc: '浏览器推送消息', enabled: false },
              { label: '周报摘要', desc: '每周一发送活动摘要', enabled: true },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <div
                  className={`w-9 h-5 rounded-full relative transition-colors ${
                    item.enabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-background shadow transition-transform ${
                      item.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-4">危险区域</h2>
          <div className="bg-card border border-destructive/30 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">删除账户</p>
                <p className="text-xs text-muted-foreground">永久删除您的账户和所有数据</p>
              </div>
              <button className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                删除账户
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
