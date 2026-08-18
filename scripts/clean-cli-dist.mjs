import fs from 'node:fs'
import path from 'node:path'

const outputDirectory = path.resolve(import.meta.dirname, '..', 'dist')

fs.rmSync(outputDirectory, { recursive: true, force: true })
fs.mkdirSync(outputDirectory, { recursive: true })
fs.writeFileSync(path.join(outputDirectory, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`)
