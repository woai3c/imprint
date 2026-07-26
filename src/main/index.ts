import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { BrowserWindow, Menu, Tray, app, nativeImage, net, protocol } from 'electron'

import { isLinux, isMacOS, isWindows } from '../shared/platform.js'
import { initDatabase } from './database.js'
import { registerIpcHandlers } from './ipc.js'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

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

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
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

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'imprint-file',
      privileges: { bypassCSP: true, stream: true, supportFetchAPI: true },
    },
  ])

  app.on('second-instance', showMainWindow)
  app.on('before-quit', () => {
    isQuitting = true
  })

  app.whenReady().then(() => {
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
