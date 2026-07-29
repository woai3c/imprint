import type { Page } from 'playwright-core'

export async function discoverSubPages(page: Page, baseUrl: string, max: number): Promise<string[]> {
  const origin = new URL(baseUrl).origin
  const links: string[] = await page.evaluate((orig: string) => {
    const anchors = Array.from(
      document.querySelectorAll('nav a, header a, [role="navigation"] a, .nav a, .sidebar a, a'),
    )
    const hrefs = anchors
      .map((anchor) => anchor.getAttribute('href'))
      .filter(Boolean)
      .map((href) => {
        try {
          return new URL(href!, orig).href
        } catch {
          return null
        }
      })
      .filter((href): href is string => href !== null && href.startsWith(orig))
      .filter(
        (href) =>
          !href.includes('#') &&
          !href.includes('logout') &&
          !href.includes('signout') &&
          !href.includes('/api/') &&
          !href.includes('/auth/') &&
          !href.endsWith('.pdf') &&
          !href.endsWith('.zip'),
      )
    return [...new Set(hrefs)]
  }, origin)

  return links.filter((link) => link !== baseUrl && link !== baseUrl + '/').slice(0, max)
}
