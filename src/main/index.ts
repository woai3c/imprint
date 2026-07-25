import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { BrowserWindow, app, net, protocol } from 'electron'

import { initDatabase } from './database.js'
import { registerIpcHandlers } from './ipc.js'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

let mainWindow: BrowserWindow | null = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'imprint-file',
    privileges: { bypassCSP: true, stream: true, supportFetchAPI: true },
  },
])

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Imprint',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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
}

app.whenReady().then(() => {
  protocol.handle('imprint-file', (request) => {
    let filePath = decodeURIComponent(new URL(request.url).pathname)
    if (process.platform === 'win32' && filePath.startsWith('/')) {
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
