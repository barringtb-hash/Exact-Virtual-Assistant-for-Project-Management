import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { DocTypeProvider } from './context/DocTypeContext.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DocTypeProvider>
      <App />
    </DocTypeProvider>
  </React.StrictMode>
)
