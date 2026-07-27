import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const SESSION_METADATA_FILE = 'imprint-session.json'
const SESSION_MIGRATION_MARKER = '.sessions-v1-migrated'

interface SessionMetadata {
  origin: string
  hostname: string
  createdAt: string
  updatedAt: string
}

export interface ManagedBrowserSession {
  id: string
  origin: string
  hostname: string
  createdAt: string
  updatedAt: string
}

function getProfilesRoot(dataDir: string): string {
  return path.resolve(dataDir, 'browser-profiles')
}

export function getManagedProfileDir(dataDir: string, url: string): string {
  const parsed = new URL(url)
  const readableHost =
    parsed.hostname
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '-')
      .slice(0, 80) || 'site'
  const originHash = createHash('sha256').update(parsed.origin).digest('hex').slice(0, 12)
  return path.join(getProfilesRoot(dataDir), `${readableHost}-${originHash}`)
}

export function hasManagedProfile(dataDir: string, url: string): boolean {
  return fs.existsSync(getManagedProfileDir(dataDir, url))
}

export function markManagedSession(dataDir: string, url: string): void {
  try {
    const parsed = new URL(url)
    const profileDir = getManagedProfileDir(dataDir, url)
    const metadataPath = path.join(profileDir, SESSION_METADATA_FILE)
    const now = new Date().toISOString()
    let createdAt = now

    if (fs.existsSync(metadataPath)) {
      const existing = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Partial<SessionMetadata>
      if (typeof existing.createdAt === 'string') createdAt = existing.createdAt
    }

    fs.mkdirSync(profileDir, { recursive: true })
    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          origin: parsed.origin,
          hostname: parsed.hostname,
          createdAt,
          updatedAt: now,
        } satisfies SessionMetadata,
        null,
        2,
      ),
      'utf8',
    )
  } catch {
    // Session metadata must never make an otherwise successful analysis fail.
  }
}

export function migrateLegacyManagedSessions(dataDir: string): void {
  const profilesRoot = getProfilesRoot(dataDir)
  const migrationMarker = path.join(profilesRoot, SESSION_MIGRATION_MARKER)
  if (fs.existsSync(migrationMarker)) return

  try {
    fs.mkdirSync(profilesRoot, { recursive: true })
    for (const entry of fs.readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue

      const profileDir = path.join(profilesRoot, entry.name)
      const metadataPath = path.join(profileDir, SESSION_METADATA_FILE)
      if (fs.existsSync(metadataPath)) continue

      const fallbackHostname = entry.name.replace(/-[a-f0-9]{12}$/i, '')
      const date = fs.statSync(profileDir).mtime.toISOString()
      fs.writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            origin: fallbackHostname,
            hostname: fallbackHostname,
            createdAt: date,
            updatedAt: date,
          } satisfies SessionMetadata,
          null,
          2,
        ),
        'utf8',
      )
    }
    fs.writeFileSync(migrationMarker, new Date().toISOString(), 'utf8')
  } catch {
    // A migration failure must not prevent analysis or app startup.
  }
}

export function listManagedSessions(dataDir: string): ManagedBrowserSession[] {
  const profilesRoot = getProfilesRoot(dataDir)
  if (!fs.existsSync(profilesRoot)) return []

  return fs
    .readdirSync(profilesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry): ManagedBrowserSession | null => {
      const profileDir = path.join(profilesRoot, entry.name)
      const metadataPath = path.join(profileDir, SESSION_METADATA_FILE)
      const fallbackHostname = entry.name.replace(/-[a-f0-9]{12}$/i, '')

      try {
        const fallbackDate = fs.statSync(profileDir).mtime.toISOString()
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Partial<SessionMetadata>
        return {
          id: entry.name,
          origin: typeof metadata.origin === 'string' ? metadata.origin : fallbackHostname,
          hostname: typeof metadata.hostname === 'string' ? metadata.hostname : fallbackHostname,
          createdAt: typeof metadata.createdAt === 'string' ? metadata.createdAt : fallbackDate,
          updatedAt: typeof metadata.updatedAt === 'string' ? metadata.updatedAt : fallbackDate,
        }
      } catch {
        return null
      }
    })
    .filter((session): session is ManagedBrowserSession => session !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function resolveProfileForRemoval(dataDir: string, id: string): string {
  if (!id || path.basename(id) !== id) throw new Error('Invalid browser session id')

  const profilesRoot = getProfilesRoot(dataDir)
  const profileDir = path.resolve(profilesRoot, id)
  if (path.dirname(profileDir) !== profilesRoot) throw new Error('Browser session is outside the profiles directory')
  return profileDir
}

export function removeManagedSession(dataDir: string, id: string): boolean {
  const profileDir = resolveProfileForRemoval(dataDir, id)
  if (!fs.existsSync(profileDir)) return false
  fs.rmSync(profileDir, { force: true, recursive: true })
  return true
}

export function removeAllManagedSessions(dataDir: string): number {
  const sessions = listManagedSessions(dataDir)
  for (const session of sessions) removeManagedSession(dataDir, session.id)
  return sessions.length
}
