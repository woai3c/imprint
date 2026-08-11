export function formatLocalDateTime(value: string, language: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  if (language.startsWith('zh')) {
    const pad = (part: number) => String(part).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}
