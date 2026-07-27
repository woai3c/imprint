import React from 'react'
import ReactDOM from 'react-dom/client'

import { App } from './App'
import './i18n'
import { initThemePreference } from './lib/theme-preference'
import { initColorMode } from './stores/skin-store'
import './styles/globals.css'

initColorMode()
initThemePreference()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
