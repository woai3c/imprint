import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { VitePlugin } from '@electron-forge/plugin-vite'
import type { ForgeConfig } from '@electron-forge/shared-types'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: ['assets/icons'],
    icon: 'assets/icons/icon',
    name: 'Imprint',
    executableName: 'imprint',
  },
  makers: [
    new MakerSquirrel({
      name: 'imprint',
      setupIcon: 'assets/icons/icon.ico',
    }),
    new MakerDMG({
      icon: 'assets/icons/icon.icns',
      name: 'imprint',
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
