import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { BrowserWindow, Menu, Tray, app, nativeImage, net, protocol } from 'electron'

import { isLinux, isMacOS, isWindows } from '../shared/platform.js'
import { initDatabase } from './database.js'
import { registerIpcHandlers } from './ipc.js'
import { initLogger, log } from './logger.js'

app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,AutofillEnableAccountWalletStorage')

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const e2eUserDataDir = process.env.IMPRINT_E2E_USER_DATA_DIR
if (process.env.IMPRINT_E2E === '1' && e2eUserDataDir) {
  const resolvedE2eUserDataDir = path.resolve(e2eUserDataDir)
  app.setPath('userData', resolvedE2eUserDataDir)
  app.setPath('sessionData', path.join(resolvedE2eUserDataDir, 'session'))
}

initLogger()

function getIconPath(...segments: string[]) {
  const iconRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'icons')
    : path.join(process.cwd(), 'assets', 'icons')
  return path.join(iconRoot, ...segments)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Imprint',
    icon: getIconPath('icon.png'),
    titleBarStyle: isMacOS(process.platform) ? 'hiddenInset' : 'default',
    autoHideMenuBar: !isMacOS(process.platform),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isWindows(process.platform)) {
    mainWindow.on('session-end', () => {
      isQuitting = true
    })
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  if (!mainWindow) return

  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray() {
  if (tray) return

  const macOS = isMacOS(process.platform)
  const trayImage = macOS
    ? nativeImage.createFromPath(getIconPath('png', 'icon-32.png')).resize({ width: 16, height: 16 })
    : isWindows(process.platform)
      ? getIconPath('icon.ico')
      : getIconPath('png', 'icon-32.png')

  if (macOS && typeof trayImage !== 'string') trayImage.setTemplateImage(true)

  tray = new Tray(trayImage)
  const zhCN = app.getLocale().toLowerCase().startsWith('zh')
  tray.setToolTip(zhCN ? '印记' : 'Imprint')
  const contextMenu = Menu.buildFromTemplate([
    {
      label: zhCN ? '打开印记' : 'Open Imprint',
      click: showMainWindow,
    },
    { type: 'separator' },
    {
      label: zhCN ? '退出印记' : 'Quit Imprint',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.on('click', showMainWindow)
  tray.on('right-click', () => tray?.popUpContextMenu(contextMenu))

  if (isLinux(process.platform)) tray.setContextMenu(contextMenu)
}

const hasSingleInstanceLock = process.env.IMPRINT_E2E === '1' || app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'imprint-file',
      privileges: { bypassCSP: true, stream: true, supportFetchAPI: true },
    },
  ])

  app.on('second-instance', () => {
    log.info('app', 'second instance attempted, focusing existing window')
    showMainWindow()
  })
  app.on('before-quit', () => {
    isQuitting = true
    log.info('app', 'quitting')
  })

  app.whenReady().then(() => {
    log.info(
      'app',
      `ready: version=${app.getVersion()} platform=${process.platform} arch=${process.arch} packaged=${app.isPackaged}`,
    )
    if (isMacOS(process.platform)) app.dock.setIcon(getIconPath('png', 'icon-1024.png'))
    if (isWindows(process.platform)) app.setAppUserModelId('com.imprint.app')

    protocol.handle('imprint-file', (request) => {
      let filePath = decodeURIComponent(new URL(request.url).pathname)
      if (isWindows(process.platform) && filePath.startsWith('/')) {
        filePath = filePath.slice(1)
      }
      if (fs.existsSync(filePath)) {
        return net.fetch(pathToFileURL(filePath).toString())
      }
      return new Response('Not found', { status: 404 })
    })

    initDatabase()
    registerIpcHandlers()
    createWindow()
    createTray()

    app.on('activate', showMainWindow)
  })

  app.on('window-all-closed', () => {
    // Keep the process and tray entry alive until the user chooses Quit.
  })
}
