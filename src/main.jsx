import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AppBoundary } from './AppErrorBoundary'
import { isVoiceE2EModeActive } from './utils/e2eMode.js'
import './index.css'

const isVoiceE2EMode = typeof window !== 'undefined' ? isVoiceE2EModeActive(window) : false

if (typeof window !== 'undefined') {
  window.__appReady = false
}

if (typeof document !== 'undefined' && document.body) {
  if (isVoiceE2EMode) {
    document.body.classList.add('eva-e2e-mode')
    document.body.dataset.e2eReady = '0'
  } else {
    document.body.classList.remove('eva-e2e-mode')
    delete document.body.dataset.e2eReady
  }
}

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
