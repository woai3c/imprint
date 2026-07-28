import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { VitePlugin } from '@electron-forge/plugin-vite'
import type { ForgeConfig } from '@electron-forge/shared-types'

import fs from 'node:fs'
import path from 'node:path'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for a signed release build`)
  return value
}

const macOSSigningEnabled = process.platform === 'darwin' && process.env.IMPRINT_MACOS_SIGNING === 'true'
const windowsSigningEnabled = process.platform === 'win32' && process.env.IMPRINT_WINDOWS_SIGNING === 'true'

const appleSigningIdentity = macOSSigningEnabled ? requireEnv('APPLE_SIGNING_IDENTITY') : ''
const appleApiKey = macOSSigningEnabled ? requireEnv('APPLE_API_KEY') : ''
const appleApiKeyId = macOSSigningEnabled ? requireEnv('APPLE_API_KEY_ID') : ''
const appleApiIssuer = macOSSigningEnabled ? requireEnv('APPLE_API_ISSUER') : ''
const windowsCertificateFile = windowsSigningEnabled ? requireEnv('WINDOWS_CERTIFICATE_FILE') : ''
const windowsCertificatePassword = windowsSigningEnabled ? requireEnv('WINDOWS_CERTIFICATE_PASSWORD') : ''

const externalPackages = ['better-sqlite3', 'playwright-core']

function copyNativeModules(
  buildPath: string,
  _electronVersion: string,
  _platform: string,
  _arch: string,
  callback: (err?: Error | null) => void,
) {
  try {
    const appNodeModules = path.join(buildPath, 'node_modules')
    for (const mod of externalPackages) {
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
    extraResource: ['assets/icons', 'assets/theme-backgrounds'],
    icon: 'assets/icons/icon',
    name: 'Imprint',
    executableName: 'imprint',
    win32metadata: {
      CompanyName: 'woai3c',
      FileDescription: 'Extract and export reusable UI design systems',
      InternalName: 'Imprint',
      ProductName: 'Imprint',
    },
    afterCopy: [copyNativeModules],
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
    new MakerSquirrel({
      name: 'imprint',
      setupIcon: 'assets/icons/icon.ico',
      ...(windowsSigningEnabled
        ? {
            certificateFile: windowsCertificateFile,
            certificatePassword: windowsCertificatePassword,
          }
        : {}),
    }),
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
