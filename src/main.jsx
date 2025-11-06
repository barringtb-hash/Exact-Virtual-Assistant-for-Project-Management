import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AppBoundary } from './AppErrorBoundary'
import './index.css'
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </React.StrictMode>
)

;(() => {
  const selector = '[data-testid="app-ready"]'
  if (!document.querySelector(selector)) {
    const marker = document.createElement('div')
    marker.setAttribute('data-testid', 'app-ready')
    marker.hidden = true
    document.body.appendChild(marker)
  }
})()
