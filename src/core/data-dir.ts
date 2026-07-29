import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function getDefaultDataDir(): string {
  const dataDir = path.join(os.homedir(), '.imprint')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  return dataDir
}
