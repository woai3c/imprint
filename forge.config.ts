import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerZIP } from '@electron-forge/maker-zip'
import { VitePlugin } from '@electron-forge/plugin-vite'
import type { ForgeConfig } from '@electron-forge/shared-types'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for a signed release build`)
  return value
}

const macOSSigningEnabled = process.platform === 'darwin' && process.env.IMPRINT_MACOS_SIGNING === 'true'

const appleSigningIdentity = macOSSigningEnabled ? requireEnv('APPLE_SIGNING_IDENTITY') : ''
const appleApiKey = macOSSigningEnabled ? requireEnv('APPLE_API_KEY') : ''
const appleApiKeyId = macOSSigningEnabled ? requireEnv('APPLE_API_KEY_ID') : ''
const appleApiIssuer = macOSSigningEnabled ? requireEnv('APPLE_API_ISSUER') : ''

// The Vite plugin packages only its build output, so externalized modules and
// their runtime dependencies must be copied into the app explicitly.
const packagedRuntimePackages = ['better-sqlite3', 'bindings', 'file-uri-to-path', 'playwright-core']

function getHeadlessBrowserResources(): string[] {
  if (process.platform !== 'darwin') return []

  const playwrightRoot = path.dirname(require.resolve('playwright-core/package.json'))
  const browsers = JSON.parse(fs.readFileSync(path.join(playwrightRoot, 'browsers.json'), 'utf8')) as {
    browsers: Array<{ name: string; revision: string }>
  }
  const revision = browsers.browsers.find((browser) => browser.name === 'chromium-headless-shell')?.revision
  if (!revision) throw new Error('Playwright does not declare a Chromium Headless Shell revision')

  const configuredRoot = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()
  const cacheRoot =
    configuredRoot && configuredRoot !== '0'
      ? path.resolve(configuredRoot)
      : path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
  const resourcePath = path.join(cacheRoot, `chromium_headless_shell-${revision}`)
  if (!fs.existsSync(resourcePath)) {
    throw new Error(`Chromium Headless Shell is missing at ${resourcePath}. Run pnpm browser:install first.`)
  }

  return [resourcePath]
}

function copyPackagedRuntimePackages(
  buildPath: string,
  _electronVersion: string,
  _platform: string,
  _arch: string,
  callback: (err?: Error | null) => void,
) {
  try {
    const appNodeModules = path.join(buildPath, 'node_modules')
    for (const mod of packagedRuntimePackages) {
      const src = path.dirname(require.resolve(`${mod}/package.json`))
      const dest = path.join(appNodeModules, mod)
      fs.cpSync(src, dest, { recursive: true, dereference: true })
    }
    callback()
  } catch (err) {
    callback(err as Error)
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: 'com.woai3c.imprint',
    appCategoryType: 'public.app-category.developer-tools',
    asar: {
      unpack: '**/*.node',
    },
    extraResource: ['assets/icons', 'assets/theme-backgrounds', ...getHeadlessBrowserResources()],
    icon: 'assets/icons/icon',
    name: 'Imprint',
    executableName: 'imprint',
    win32metadata: {
      CompanyName: 'woai3c',
      FileDescription: 'Extract and export reusable UI design systems',
      InternalName: 'Imprint',
      ProductName: 'Imprint',
    },
    afterCopy: [copyPackagedRuntimePackages],
    ...(macOSSigningEnabled
      ? {
          osxSign: {
            identity: appleSigningIdentity,
          },
          osxNotarize: {
            appleApiKey,
            appleApiKeyId,
            appleApiIssuer,
          },
        }
      : {}),
  },
  makers: [
    new MakerZIP({}, ['win32']),
    new MakerDMG({
      icon: 'assets/icons/icon.icns',
      name: 'Imprint',
      ...(macOSSigningEnabled
        ? {
            additionalDMGOptions: {
              'code-sign': {
                'signing-identity': appleSigningIdentity,
              },
            },
          }
        : {}),
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/main/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
}

export default config
