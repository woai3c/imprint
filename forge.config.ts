import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { VitePlugin } from '@electron-forge/plugin-vite'
import type { ForgeConfig } from '@electron-forge/shared-types'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for a signed release build`)
  return value
}

const macOSSigningEnabled = process.platform === 'darwin' && process.env.IMPRINT_MACOS_SIGNING === 'true'
const windowsSigningEnabled = process.platform === 'win32' && process.env.IMPRINT_WINDOWS_SIGNING === 'true'

const appleSigningIdentity = macOSSigningEnabled ? requireEnv('APPLE_SIGNING_IDENTITY') : undefined
const appleApiKey = macOSSigningEnabled ? requireEnv('APPLE_API_KEY') : undefined
const appleApiKeyId = macOSSigningEnabled ? requireEnv('APPLE_API_KEY_ID') : undefined
const appleApiIssuer = macOSSigningEnabled ? requireEnv('APPLE_API_ISSUER') : undefined
const windowsCertificateFile = windowsSigningEnabled ? requireEnv('WINDOWS_CERTIFICATE_FILE') : undefined
const windowsCertificatePassword = windowsSigningEnabled ? requireEnv('WINDOWS_CERTIFICATE_PASSWORD') : undefined

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: 'com.woai3c.imprint',
    appCategoryType: 'public.app-category.developer-tools',
    asar: true,
    extraResource: ['assets/icons'],
    icon: 'assets/icons/icon',
    name: 'Imprint',
    executableName: 'imprint',
    win32metadata: {
      CompanyName: 'woai3c',
      FileDescription: 'Extract and export reusable UI design systems',
      InternalName: 'Imprint',
      ProductName: 'Imprint',
    },
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
