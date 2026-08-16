import fs from 'node:fs'
import path from 'node:path'

const outputDirectory = path.resolve(import.meta.dirname, '..', 'dist')

fs.rmSync(outputDirectory, { recursive: true, force: true })
