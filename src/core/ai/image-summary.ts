import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { BrowserContext, Page } from 'playwright-core'

import type { DesignEvidence, EvidenceImage } from '../design-evidence/types.js'
import type { AiImageInput } from './provider.js'
import { mimeTypeForPath } from './provider.js'

export const AI_IMAGE_SUMMARY_VERSION = '2'
export const AI_IMAGE_MAX_WIDTH = 1600
export const AI_IMAGE_MAX_HEIGHT = 1600
export const AI_IMAGE_MAX_BYTES = 250 * 1024
export const AI_IMAGE_MAX_COUNT = 3
export const AI_IMAGE_FINGERPRINT_CANDIDATE_COUNT = 6
export const AI_VISUAL_TOKEN_BUDGET = 6_000

interface EncodedSummary {
  base64: string
  width: number
  height: number
}

function contentHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function summaryPath(image: EvidenceImage, sourceHash: string): string {
  return path.join(
    path.dirname(image.path),
    `${path.parse(image.path).name}.ai-v${AI_IMAGE_SUMMARY_VERSION}-${sourceHash.slice(0, 16)}.jpeg`,
  )
}

function validSummaryFile(image: EvidenceImage): boolean {
  const summary = image.aiSummary
  if (!summary || summary.version !== AI_IMAGE_SUMMARY_VERSION) return false
  if (
    summary.width < 1 ||
    summary.height < 1 ||
    summary.width > AI_IMAGE_MAX_WIDTH ||
    summary.height > AI_IMAGE_MAX_HEIGHT ||
    summary.bytes > AI_IMAGE_MAX_BYTES ||
    !fs.existsSync(summary.path)
  ) {
    return false
  }
  try {
    const buffer = fs.readFileSync(summary.path)
    return buffer.length === summary.bytes && contentHash(buffer) === summary.contentHash
  } catch {
    return false
  }
}

async function encodeSummary(page: Page, source: Buffer, mimeType: string): Promise<EncodedSummary | null> {
  return page.evaluate(
    async ({ base64, mimeType: inputMimeType, maxWidth, maxHeight, maxBytes }) => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      const bitmap = await createImageBitmap(new Blob([bytes], { type: inputMimeType }))
      const sourceWidth = bitmap.width
      const sourceHeight =
        bitmap.height / Math.max(bitmap.width, 1) > 2.5
          ? Math.min(bitmap.height, Math.round(bitmap.width * 1.5))
          : bitmap.height
      let dimensionScale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1)

      while (dimensionScale * Math.max(sourceWidth, sourceHeight) >= 96) {
        const width = Math.max(1, Math.round(sourceWidth * dimensionScale))
        const height = Math.max(1, Math.round(sourceHeight * dimensionScale))
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) return null
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(bitmap, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height)

        const sample = context.getImageData(0, 0, width, height).data
        const stride = Math.max(4, Math.floor(sample.length / 16_384 / 4) * 4)
        let minimum = 255
        let maximum = 0
        let total = 0
        let count = 0
        for (let offset = 0; offset < sample.length; offset += stride) {
          const luminance = (sample[offset] + sample[offset + 1] + sample[offset + 2]) / 3
          minimum = Math.min(minimum, luminance)
          maximum = Math.max(maximum, luminance)
          total += luminance
          count += 1
        }
        const average = total / Math.max(count, 1)
        if (maximum - minimum < 3 && (average < 5 || average > 250)) return null

        for (const quality of [0.78, 0.64, 0.5, 0.36, 0.24, 0.18]) {
          const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
          if (blob.size > maxBytes) continue
          const encoded = new Uint8Array(await blob.arrayBuffer())
          let encodedBinary = ''
          const chunkSize = 0x8000
          for (let offset = 0; offset < encoded.length; offset += chunkSize) {
            encodedBinary += String.fromCharCode(...encoded.subarray(offset, offset + chunkSize))
          }
          return { base64: btoa(encodedBinary), width, height }
        }
        dimensionScale *= 0.8
      }
      return null
    },
    {
      base64: source.toString('base64'),
      mimeType,
      maxWidth: AI_IMAGE_MAX_WIDTH,
      maxHeight: AI_IMAGE_MAX_HEIGHT,
      maxBytes: AI_IMAGE_MAX_BYTES,
    },
  )
}

async function computeVisualHash(page: Page, source: Buffer, mimeType: string): Promise<string | null> {
  return page.evaluate(
    async ({ base64, mimeType: inputMimeType }) => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      const bitmap = await createImageBitmap(new Blob([bytes], { type: inputMimeType }))
      const sourceHeight =
        bitmap.height / Math.max(bitmap.width, 1) > 2.5
          ? Math.min(bitmap.height, Math.round(bitmap.width * 1.5))
          : bitmap.height
      const canvas = new OffscreenCanvas(16, 12)
      const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
      if (!context) return null
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, 16, 12)
      context.drawImage(bitmap, 0, 0, bitmap.width, sourceHeight, 0, 0, 16, 12)
      const pixels = context.getImageData(0, 0, 16, 12).data
      let fingerprint = 'v1:'
      for (let index = 0; index < pixels.length; index += 4) {
        fingerprint += Math.round(pixels[index] / 17).toString(16)
        fingerprint += Math.round(pixels[index + 1] / 17).toString(16)
        fingerprint += Math.round(pixels[index + 2] / 17).toString(16)
      }
      return fingerprint
    },
    { base64: source.toString('base64'), mimeType },
  )
}

export async function prepareEvidenceImageFingerprints(
  context: BrowserContext,
  evidence: DesignEvidence,
  imageIds: readonly string[],
): Promise<string[]> {
  const selected = new Set(imageIds.slice(0, AI_IMAGE_FINGERPRINT_CANDIDATE_COUNT))
  const images = evidence.pages.flatMap((page) => page.images).filter((image) => selected.has(image.id))
  const prepared: string[] = []
  let page: Page | null = null
  try {
    for (const image of images) {
      if (/^v1:[0-9a-f]{576}$/i.test(image.visualHash || '')) {
        prepared.push(image.id)
        continue
      }
      if (!fs.existsSync(image.path)) continue
      if (!page) {
        page = await context.newPage()
        await page.setContent('<!doctype html><html><body></body></html>')
      }
      const source = fs.readFileSync(image.path)
      const visualHash = await computeVisualHash(page, source, mimeTypeForPath(image.path))
      if (!visualHash) continue
      image.visualHash = visualHash
      prepared.push(image.id)
    }
  } finally {
    await page?.close().catch(() => {})
  }
  return prepared
}

export async function prepareEvidenceImageSummaries(
  context: BrowserContext,
  evidence: DesignEvidence,
  imageIds: readonly string[],
): Promise<string[]> {
  const selected = new Set(imageIds.slice(0, AI_IMAGE_MAX_COUNT))
  const images = evidence.pages.flatMap((page) => page.images).filter((image) => selected.has(image.id))
  const prepared: string[] = []
  let page: Page | null = null
  try {
    for (const image of images) {
      if (validSummaryFile(image)) {
        prepared.push(image.id)
        continue
      }
      if (!fs.existsSync(image.path)) continue
      const source = fs.readFileSync(image.path)
      const sourceHash = image.contentHash || contentHash(source)
      const outputPath = summaryPath(image, sourceHash)
      if (!page) {
        page = await context.newPage()
        await page.setContent('<!doctype html><html><body></body></html>')
      }
      const encoded = await encodeSummary(page, source, mimeTypeForPath(image.path))
      if (!encoded) continue
      const buffer = Buffer.from(encoded.base64, 'base64')
      if (buffer.length > AI_IMAGE_MAX_BYTES) continue
      fs.writeFileSync(outputPath, buffer)
      image.aiSummary = {
        version: AI_IMAGE_SUMMARY_VERSION,
        path: outputPath,
        width: encoded.width,
        height: encoded.height,
        bytes: buffer.length,
        contentHash: contentHash(buffer),
      }
      prepared.push(image.id)
    }
  } finally {
    await page?.close().catch(() => {})
  }
  return prepared
}

export function loadEvidenceImageInputs(evidence: DesignEvidence, imageIds: readonly string[]): AiImageInput[] {
  const selected = new Set(imageIds.slice(0, AI_IMAGE_MAX_COUNT))
  return evidence.pages.flatMap((page) =>
    page.images.flatMap((image) => {
      if (!selected.has(image.id)) return []
      let sourcePath = image.path
      let expectedHash = image.contentHash
      if (validSummaryFile(image)) {
        sourcePath = image.aiSummary!.path
        expectedHash = image.aiSummary!.contentHash
      } else if (
        image.width > AI_IMAGE_MAX_WIDTH ||
        image.height > AI_IMAGE_MAX_HEIGHT ||
        !fs.existsSync(sourcePath) ||
        fs.statSync(sourcePath).size > AI_IMAGE_MAX_BYTES
      ) {
        return []
      }
      const buffer = fs.readFileSync(sourcePath)
      if (buffer.length > AI_IMAGE_MAX_BYTES || (expectedHash && contentHash(buffer) !== expectedHash)) return []
      const mimeType = mimeTypeForPath(sourcePath)
      return [{ name: `${image.id}.${mimeType.split('/')[1]}`, mimeType, base64: buffer.toString('base64') }]
    }),
  )
}

export function availableEvidenceImageIds(evidence: DesignEvidence, imageIds: readonly string[]): string[] {
  return loadEvidenceImageInputs(evidence, imageIds).map((image) => image.name.replace(/\.[^.]+$/, ''))
}

export function loadEvidenceImageFiles(
  evidence: DesignEvidence,
  imageIds: readonly string[],
): Array<{ name: string; sourcePath: string }> {
  const available = new Set(availableEvidenceImageIds(evidence, imageIds))
  return evidence.pages.flatMap((page) =>
    page.images.flatMap((image) => {
      if (!available.has(image.id)) return []
      const sourcePath = validSummaryFile(image) ? image.aiSummary!.path : image.path
      return [{ name: `${image.id}.${mimeTypeForPath(sourcePath).split('/')[1]}`, sourcePath }]
    }),
  )
}

export function estimateVisualTokens(width: number, height: number): number {
  return Math.max(1, Math.ceil((width * height) / 750))
}
