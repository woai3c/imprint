import React from 'react'
import ReactDOM from 'react-dom/client'

import { App } from './App'
import './i18n'
import { initThemePreference } from './lib/theme-preference'
import { initColorMode, preloadThemeBackdrops } from './stores/skin-store'
import './styles/globals.css'

initColorMode()
initThemePreference()
preloadThemeBackdrops()

// Forward uncaught renderer errors to the main-process log file.
window.addEventListener('error', (event) => {
  window.electronAPI.logEvent('error', `${event.message} (${event.filename}:${event.lineno})`)
})
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? (event.reason.stack ?? event.reason.message) : String(event.reason)
  window.electronAPI.logEvent('error', `unhandledrejection: ${reason}`)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
