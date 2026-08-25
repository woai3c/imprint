import { afterEach, describe, expect, it } from 'vitest'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { clearGeneratedAssetDirectories, removeGeneratedAssets } from '../../src/main/analysis-assets.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { force: true, recursive: true })),
  )
})

describe('analysis asset cleanup', () => {
  it('removes only files inside Imprint generated-asset directories', async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-assets-'))
    temporaryDirectories.push(userDataDir)
    const screenshot = path.join(userDataDir, 'screenshots', 'capture.png')
    const thumbnail = path.join(userDataDir, 'history-thumbnails', 'preview.jpg')
    const unrelated = path.join(userDataDir, 'keep.txt')
    await fs.mkdir(path.dirname(screenshot), { recursive: true })
    await fs.mkdir(path.dirname(thumbnail), { recursive: true })
    await Promise.all([
      fs.writeFile(screenshot, 'capture'),
      fs.writeFile(thumbnail, 'preview'),
      fs.writeFile(unrelated, 'keep'),
    ])

    await removeGeneratedAssets(userDataDir, [screenshot, thumbnail, unrelated])

    await expect(fs.stat(screenshot)).rejects.toThrow()
    await expect(fs.stat(thumbnail)).rejects.toThrow()
    await expect(fs.readFile(unrelated, 'utf8')).resolves.toBe('keep')
  })

  it('clears generated directories without removing other local data', async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imprint-assets-'))
    temporaryDirectories.push(userDataDir)
    await fs.mkdir(path.join(userDataDir, 'screenshots'), { recursive: true })
    await fs.writeFile(path.join(userDataDir, 'screenshots', 'capture.png'), 'capture')
    await fs.writeFile(path.join(userDataDir, 'settings.json'), '{}')

    await clearGeneratedAssetDirectories(userDataDir)

    await expect(fs.stat(path.join(userDataDir, 'screenshots'))).rejects.toThrow()
    await expect(fs.readFile(path.join(userDataDir, 'settings.json'), 'utf8')).resolves.toBe('{}')
  })
})
