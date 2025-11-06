import React from "react"
import { createRoot } from "react-dom/client"
import App from "./App.jsx"
import { AppBoundary } from "./AppErrorBoundary"
import SyncDeveloperPanel from "./ui/SyncDeveloperPanel.tsx"
import { isCypress } from "./utils/env.ts"
import "./index.css"

const shouldRenderSyncDevtools = import.meta.env.DEV || isCypress()

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppBoundary>
      <>
        <App />
        {shouldRenderSyncDevtools ? <SyncDeveloperPanel /> : null}
      </>
    </AppBoundary>
  </React.StrictMode>
)
