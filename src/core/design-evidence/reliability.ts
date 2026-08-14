interface OverflowGeometry {
  horizontalOverflow?: boolean
  viewportWidth?: number
  contentWidth?: number
}

const SEVERE_OVERFLOW_MIN_PX = 64
const SEVERE_OVERFLOW_RATIO = 2.5

/**
 * Large page-level overflow makes viewport-to-viewport geometry incomparable. Keep the
 * capture as limitation evidence, but do not use its layout details as reusable design facts.
 */
export function hasSevereHorizontalOverflow(page: OverflowGeometry): boolean {
  if (!page.horizontalOverflow || !page.viewportWidth || !page.contentWidth) return false
  return (
    page.contentWidth - page.viewportWidth >= SEVERE_OVERFLOW_MIN_PX &&
    page.contentWidth / page.viewportWidth >= SEVERE_OVERFLOW_RATIO
  )
}
