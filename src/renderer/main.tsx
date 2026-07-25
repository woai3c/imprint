import React from 'react'
import ReactDOM from 'react-dom/client'

import { App } from './App'
import './i18n'
import { initColorMode } from './stores/skin-store'
import './styles/globals.css'

initColorMode()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
