import React from "react"
import { createRoot } from "react-dom/client"
import App from "./App.jsx"
import { AppBoundary } from "./AppErrorBoundary"
import SyncDeveloperPanel from "./ui/SyncDeveloperPanel.tsx"
import { isCypress, isDevEnvironment } from "./utils/env.ts"
import "./index.css"

const shouldRenderSyncDevtools = isDevEnvironment() || isCypress()

const targetId = "root"
let container = document.getElementById(targetId)

if (!container) {
  container = document.createElement("div")
  container.id = targetId
  document.body.appendChild(container)
}

createRoot(container).render(
  <React.StrictMode>
    <AppBoundary>
      <>
        <App />
        {shouldRenderSyncDevtools ? <SyncDeveloperPanel /> : null}
      </>
    </AppBoundary>
  </React.StrictMode>
)

const ensureAppReadyBeacon = () => {
  try {
    if (document.querySelector('[data-testid="app-ready"]')) {
      return
    }

    const beacon = document.createElement("div")
    beacon.setAttribute("data-testid", "app-ready")
    beacon.style.display = "none"

    const appendBeacon = () => {
      if (document.querySelector('[data-testid="app-ready"]')) {
        return
      }
      if (document.body) {
        document.body.appendChild(beacon)
      }
    }

    if (typeof queueMicrotask === "function") {
      queueMicrotask(appendBeacon)
    } else {
      setTimeout(appendBeacon, 0)
    }
  } catch (error) {
    // Swallow errors to avoid interfering with production startup.
  }
}

ensureAppReadyBeacon()
