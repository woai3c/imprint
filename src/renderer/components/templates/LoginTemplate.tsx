export function LoginTemplate() {
  return (
    <div className="min-h-[600px] bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-sm mx-auto">
        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary mx-auto flex items-center justify-center mb-4">
              <span className="text-primary-foreground text-xl font-bold">A</span>
            </div>
            <h1 className="text-xl font-bold">欢迎回来</h1>
            <p className="text-sm text-muted-foreground mt-1">登录您的账户以继续</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">邮箱</label>
              <input
                type="email"
                placeholder="name@example.com"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">密码</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-primary" />
                记住我
              </label>
              <a className="text-sm text-primary hover:underline">忘记密码?</a>
            </div>

            <button className="w-full h-10 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
              登录
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              还没有账户? <a className="text-primary hover:underline">注册</a>
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center mb-3">或使用以下方式登录</p>
            <div className="grid grid-cols-2 gap-3">
              <button className="h-9 rounded-md border border-border bg-background text-sm hover:bg-accent transition-colors">
                Google
              </button>
              <button className="h-9 rounded-md border border-border bg-background text-sm hover:bg-accent transition-colors">
                GitHub
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
