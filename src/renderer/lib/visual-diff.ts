export interface VisualDiffImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface VisualDiffRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface VisualDiffResult {
  referenceRegions: VisualDiffRegion[]
  targetRegions: VisualDiffRegion[]
  changedPixels: number
  alignment: 'top' | 'height-shift'
}

export interface VisualDiffPreviewGeometry {
  width: number
  referenceHeight: number
  targetHeight: number
  scale: number
  scaled: boolean
}

interface HeightAlignment {
  taller: 'reference' | 'target'
  split: number
  delta: number
}

const COLOR_DELTA_THRESHOLD = 18
const TOTAL_DELTA_THRESHOLD = 30
const ALIGNMENT_SAMPLE_STEP = 4
const REGION_TILE_SIZE = 12

export function fitVisualDiffPreview(
  referenceWidth: number,
  referenceHeight: number,
  targetWidth: number,
  targetHeight: number,
  maximumWidth: number,
  maximumPixels: number,
): VisualDiffPreviewGeometry {
  if (
    ![referenceWidth, referenceHeight, targetWidth, targetHeight, maximumWidth, maximumPixels].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    throw new Error('Preview dimensions are invalid')
  }
  if (referenceWidth !== targetWidth) throw new Error('Screenshot widths do not match')
  const proposedScale = Math.min(
    1,
    maximumWidth / referenceWidth,
    Math.sqrt(maximumPixels / (referenceWidth * Math.max(referenceHeight, targetHeight))),
  )
  const width = Math.max(1, Math.floor(referenceWidth * proposedScale))
  // Derive every destination dimension from the same effective scale. Independently
  // rounding each height would stretch captures by slightly different amounts and
  // turn unchanged text into false pixel differences on long pages.
  const scale = width / referenceWidth
  return {
    width,
    referenceHeight: Math.max(1, Math.floor(referenceHeight * scale)),
    targetHeight: Math.max(1, Math.floor(targetHeight * scale)),
    scale,
    scaled: scale < 1,
  }
}

function isChanged(
  reference: Uint8ClampedArray,
  referenceOffset: number,
  target: Uint8ClampedArray,
  targetOffset: number,
) {
  const red = Math.abs(reference[referenceOffset] - target[targetOffset])
  const green = Math.abs(reference[referenceOffset + 1] - target[targetOffset + 1])
  const blue = Math.abs(reference[referenceOffset + 2] - target[targetOffset + 2])
  const alpha = Math.abs(reference[referenceOffset + 3] - target[targetOffset + 3])
  return (
    Math.max(red, green, blue, alpha) >= COLOR_DELTA_THRESHOLD && red + green + blue + alpha >= TOTAL_DELTA_THRESHOLD
  )
}

function assertImage(image: VisualDiffImage, label: string): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0) {
    throw new Error(`${label} image dimensions are invalid`)
  }
  if (image.data.length !== image.width * image.height * 4) {
    throw new Error(`${label} image data does not match its dimensions`)
  }
}

function rowDifference(
  reference: VisualDiffImage,
  referenceY: number,
  target: VisualDiffImage,
  targetY: number,
): number {
  let changed = 0
  for (let x = 0; x < reference.width; x += ALIGNMENT_SAMPLE_STEP) {
    const referenceOffset = (referenceY * reference.width + x) * 4
    const targetOffset = (targetY * target.width + x) * 4
    if (isChanged(reference.data, referenceOffset, target.data, targetOffset)) changed += 1
  }
  return changed
}

function findHeightAlignment(reference: VisualDiffImage, target: VisualDiffImage): HeightAlignment | null {
  if (reference.height === target.height) return null
  const taller = reference.height > target.height ? 'reference' : 'target'
  const shorterHeight = Math.min(reference.height, target.height)
  const delta = Math.abs(reference.height - target.height)
  const topCosts = new Float64Array(shorterHeight)
  const shiftedCosts = new Float64Array(shorterHeight)

  for (let y = 0; y < shorterHeight; y += 1) {
    topCosts[y] = rowDifference(reference, y, target, y)
    shiftedCosts[y] =
      taller === 'reference'
        ? rowDifference(reference, y + delta, target, y)
        : rowDifference(reference, y, target, y + delta)
  }

  const prefixTop = new Float64Array(shorterHeight + 1)
  const suffixShifted = new Float64Array(shorterHeight + 1)
  for (let y = 0; y < shorterHeight; y += 1) prefixTop[y + 1] = prefixTop[y] + topCosts[y]
  for (let y = shorterHeight - 1; y >= 0; y -= 1) suffixShifted[y] = suffixShifted[y + 1] + shiftedCosts[y]

  const minimumSpan = Math.min(16, Math.max(2, Math.floor(shorterHeight / 8)))
  let split = -1
  let bestCost = Number.POSITIVE_INFINITY
  for (let candidate = minimumSpan; candidate <= shorterHeight - minimumSpan; candidate += 1) {
    const cost = prefixTop[candidate] + suffixShifted[candidate]
    if (cost < bestCost) {
      bestCost = cost
      split = candidate
    }
  }
  if (split < 0) return null

  const samplesPerRow = Math.ceil(reference.width / ALIGNMENT_SAMPLE_STEP)
  const topAlignedCost = prefixTop[shorterHeight]
  const prefixRatio = prefixTop[split] / Math.max(1, split * samplesPerRow)
  const suffixRatio = suffixShifted[split] / Math.max(1, (shorterHeight - split) * samplesPerRow)
  if (bestCost >= topAlignedCost * 0.65 || prefixRatio > 0.08 || suffixRatio > 0.12) return null
  return { taller, split, delta }
}

function markDifferentPixels(
  reference: VisualDiffImage,
  referenceMask: Uint8Array,
  referenceY: number,
  target: VisualDiffImage,
  targetMask: Uint8Array,
  targetY: number,
): number {
  let changed = 0
  for (let x = 0; x < reference.width; x += 1) {
    const referencePixel = referenceY * reference.width + x
    const targetPixel = targetY * target.width + x
    if (!isChanged(reference.data, referencePixel * 4, target.data, targetPixel * 4)) continue
    referenceMask[referencePixel] = 1
    targetMask[targetPixel] = 1
    changed += 1
  }
  return changed
}

function markRows(mask: Uint8Array, width: number, start: number, end: number): void {
  mask.fill(1, start * width, end * width)
}

function regionsFromMask(mask: Uint8Array, width: number, height: number): VisualDiffRegion[] {
  const columns = Math.ceil(width / REGION_TILE_SIZE)
  const rows = Math.ceil(height / REGION_TILE_SIZE)
  const counts = new Uint16Array(columns * rows)
  let firstPixel = -1
  let lastPixel = -1
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel] === 0) continue
    if (firstPixel < 0) firstPixel = pixel
    lastPixel = pixel
    const x = pixel % width
    const y = Math.floor(pixel / width)
    counts[Math.floor(y / REGION_TILE_SIZE) * columns + Math.floor(x / REGION_TILE_SIZE)] += 1
  }
  if (firstPixel < 0) return []

  const active = new Uint8Array(counts.length)
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tileWidth = Math.min(REGION_TILE_SIZE, width - column * REGION_TILE_SIZE)
      const tileHeight = Math.min(REGION_TILE_SIZE, height - row * REGION_TILE_SIZE)
      const threshold = Math.max(4, Math.ceil(tileWidth * tileHeight * 0.04))
      if (counts[row * columns + column] >= threshold) active[row * columns + column] = 1
    }
  }

  const visited = new Uint8Array(active.length)
  const regions: VisualDiffRegion[] = []
  for (let start = 0; start < active.length; start += 1) {
    if (!active[start] || visited[start]) continue
    const queue = [start]
    visited[start] = 1
    let minimumColumn = start % columns
    let maximumColumn = minimumColumn
    let minimumRow = Math.floor(start / columns)
    let maximumRow = minimumRow
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]
      const column = current % columns
      const row = Math.floor(current / columns)
      minimumColumn = Math.min(minimumColumn, column)
      maximumColumn = Math.max(maximumColumn, column)
      minimumRow = Math.min(minimumRow, row)
      maximumRow = Math.max(maximumRow, row)
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          const nextColumn = column + columnOffset
          const nextRow = row + rowOffset
          if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue
          const next = nextRow * columns + nextColumn
          if (!active[next] || visited[next]) continue
          visited[next] = 1
          queue.push(next)
        }
      }
    }
    const padding = 3
    const x = Math.max(0, minimumColumn * REGION_TILE_SIZE - padding)
    const y = Math.max(0, minimumRow * REGION_TILE_SIZE - padding)
    const right = Math.min(width, (maximumColumn + 1) * REGION_TILE_SIZE + padding)
    const bottom = Math.min(height, (maximumRow + 1) * REGION_TILE_SIZE + padding)
    regions.push({ x, y, width: right - x, height: bottom - y })
  }

  if (regions.length > 0) return regions
  const firstY = Math.floor(firstPixel / width)
  const lastY = Math.floor(lastPixel / width)
  return [{ x: 0, y: firstY, width, height: lastY - firstY + 1 }]
}

export function createVisualDiff(reference: VisualDiffImage, target: VisualDiffImage): VisualDiffResult {
  assertImage(reference, 'Reference')
  assertImage(target, 'Target')
  if (reference.width !== target.width) throw new Error('Screenshot widths do not match')

  const referenceMask = new Uint8Array(reference.width * reference.height)
  const targetMask = new Uint8Array(target.width * target.height)
  const alignment = findHeightAlignment(reference, target)
  let changedPixels = 0

  if (alignment) {
    const shorterHeight = Math.min(reference.height, target.height)
    for (let y = 0; y < shorterHeight; y += 1) {
      const referenceY = alignment.taller === 'reference' && y >= alignment.split ? y + alignment.delta : y
      const targetY = alignment.taller === 'target' && y >= alignment.split ? y + alignment.delta : y
      changedPixels += markDifferentPixels(reference, referenceMask, referenceY, target, targetMask, targetY)
    }
    if (alignment.taller === 'reference') {
      markRows(referenceMask, reference.width, alignment.split, alignment.split + alignment.delta)
      changedPixels += alignment.delta * reference.width
    } else {
      markRows(targetMask, target.width, alignment.split, alignment.split + alignment.delta)
      changedPixels += alignment.delta * target.width
    }
  } else {
    const overlapHeight = Math.min(reference.height, target.height)
    for (let y = 0; y < overlapHeight; y += 1) {
      changedPixels += markDifferentPixels(reference, referenceMask, y, target, targetMask, y)
    }
    if (reference.height > overlapHeight) {
      markRows(referenceMask, reference.width, overlapHeight, reference.height)
      changedPixels += (reference.height - overlapHeight) * reference.width
    }
    if (target.height > overlapHeight) {
      markRows(targetMask, target.width, overlapHeight, target.height)
      changedPixels += (target.height - overlapHeight) * target.width
    }
  }

  const referenceRegions = regionsFromMask(referenceMask, reference.width, reference.height)
  const targetRegions = regionsFromMask(targetMask, target.width, target.height)
  if (alignment) {
    const markerHeight = Math.min(REGION_TILE_SIZE, alignment.taller === 'reference' ? target.height : reference.height)
    const marker = {
      x: 0,
      y: Math.max(0, alignment.split - Math.floor(markerHeight / 2)),
      width: reference.width,
      height: markerHeight,
    }
    if (alignment.taller === 'reference') targetRegions.push(marker)
    else referenceRegions.push(marker)
  }

  return {
    referenceRegions,
    targetRegions,
    changedPixels,
    alignment: alignment ? 'height-shift' : 'top',
  }
}
