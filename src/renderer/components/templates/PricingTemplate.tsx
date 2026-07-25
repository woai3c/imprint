export function PricingTemplate() {
  return (
    <div className="min-h-[600px] bg-background text-foreground py-12 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold">选择适合您的方案</h1>
          <p className="text-muted-foreground mt-2">简单透明的定价，无隐藏费用</p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {[
            {
              name: '免费版',
              price: '¥0',
              period: '永久免费',
              features: ['5 个项目', '基础分析', '社区支持', '1GB 存储'],
              cta: '开始使用',
              highlighted: false,
            },
            {
              name: '专业版',
              price: '¥99',
              period: '/月',
              features: ['无限项目', '高级分析', '优先支持', '100GB 存储', 'API 访问', '团队协作'],
              cta: '升级专业版',
              highlighted: true,
            },
            {
              name: '企业版',
              price: '¥399',
              period: '/月',
              features: ['一切专业版功能', '专属客户经理', 'SLA 保障', '无限存储', 'SSO 单点登录', '私有部署'],
              cta: '联系销售',
              highlighted: false,
            },
          ].map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl border p-6 flex flex-col ${
                plan.highlighted
                  ? 'border-primary ring-2 ring-primary/20 bg-card shadow-lg scale-105'
                  : 'border-border bg-card'
              }`}
            >
              {plan.highlighted && (
                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full w-fit mb-3">
                  最受欢迎
                </span>
              )}
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <span className="text-primary">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                className={`mt-6 w-full h-10 rounded-md font-medium text-sm transition-opacity hover:opacity-90 ${
                  plan.highlighted ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">所有方案均包含 14 天免费试用 · 随时取消</p>
        </div>
      </div>
    </div>
  )
}
