/** Removes request-specific URL state so captures of the same page share one stable identity. */
export function pageIdentityUrl(value: string): string {
  try {
    const pageUrl = new URL(value)
    pageUrl.username = ''
    pageUrl.password = ''
    pageUrl.search = ''
    pageUrl.hash = ''
    return pageUrl.href
  } catch {
    return value.split(/[?#]/, 1)[0]
  }
}
