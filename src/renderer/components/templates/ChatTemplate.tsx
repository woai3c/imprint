import { useTranslation } from 'react-i18next'

export function ChatTemplate() {
  const { t } = useTranslation()
  const conversations = [
    { key: 'product', time: '10:30', unread: 3, active: true },
    { key: 'alex', time: '09:15', unread: 0, active: false },
    { key: 'design', time: t('templates.examples.chat.time.yesterday'), unread: 0, active: false },
    { key: 'sam', time: t('templates.examples.chat.time.yesterday'), unread: 0, active: false },
    { key: 'support', time: t('templates.examples.chat.time.monday'), unread: 0, active: false },
  ].map(({ key, ...conversation }) => ({
    name: t(`templates.examples.chat.conversations.${key}.name`),
    message: t(`templates.examples.chat.conversations.${key}.message`),
    ...conversation,
  }))
  const groupName = t('templates.examples.chat.groupName')
  const firstSender = t('templates.examples.chat.messages.first.sender')
  const secondSender = t('templates.examples.chat.messages.second.sender')

  return (
    <div className="min-h-[600px] bg-background text-foreground flex">
      <aside className="w-64 border-r border-border bg-sidebar p-3">
        <div className="mb-3">
          <input
            placeholder={t('templates.examples.chat.search')}
            className="w-full h-8 px-3 rounded-md border border-input bg-background text-xs placeholder:text-muted-foreground"
          />
        </div>
        <div className="space-y-1">
          {conversations.map((chat) => (
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
                  <span className="text-[11px] text-muted-foreground">{chat.time}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{chat.message}</p>
              </div>
              {chat.unread > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
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
            <span className="text-xs font-medium text-muted-foreground">{groupName[0]}</span>
          </div>
          <div>
            <p className="text-sm font-medium">{groupName}</p>
            <p className="text-[11px] text-muted-foreground">
              {t('templates.examples.chat.members', { memberCount: 5 })}
            </p>
          </div>
        </header>

        <div className="flex-1 p-5 space-y-4 overflow-auto">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-muted shrink-0 flex items-center justify-center">
              <span className="text-[11px] text-muted-foreground">{firstSender[0]}</span>
            </div>
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">{firstSender} · 10:28</p>
              <div className="bg-secondary rounded-lg rounded-tl-none px-3 py-2 max-w-xs">
                <p className="text-sm">{t('templates.examples.chat.messages.first.body')}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-muted shrink-0 flex items-center justify-center">
              <span className="text-[11px] text-muted-foreground">{secondSender[0]}</span>
            </div>
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">{secondSender} · 10:29</p>
              <div className="bg-secondary rounded-lg rounded-tl-none px-3 py-2 max-w-xs">
                <p className="text-sm">{t('templates.examples.chat.messages.second.body')}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <div>
              <p className="mb-1 text-right text-[11px] text-muted-foreground">
                {t('templates.examples.chat.you')} · 10:30
              </p>
              <div className="bg-primary text-primary-foreground rounded-lg rounded-tr-none px-3 py-2 max-w-xs">
                <p className="text-sm">{t('templates.examples.chat.messages.mine')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border bg-card">
          <div className="flex gap-3">
            <input
              placeholder={t('templates.examples.chat.messagePlaceholder')}
              className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground"
            />
            <button className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">
              {t('templates.examples.chat.send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
