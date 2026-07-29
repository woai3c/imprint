import fs from 'node:fs'

import { isLinux, isMacOS, isWindows } from '../../shared/platform.js'

export function findBrowser(): string | undefined {
  if (isWindows(process.platform)) {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    for (const browserPath of paths) {
      if (fs.existsSync(browserPath)) return browserPath
    }
  }

  if (isMacOS(process.platform)) {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]
    for (const browserPath of paths) {
      if (fs.existsSync(browserPath)) return browserPath
    }
  }

  if (isLinux(process.platform)) {
    const paths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ]
    for (const browserPath of paths) {
      if (fs.existsSync(browserPath)) return browserPath
    }
  }

  return undefined
}
