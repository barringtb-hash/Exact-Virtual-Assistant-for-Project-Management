import React from "react"
import { createRoot } from "react-dom/client"
import App from "./App.jsx"
import { AppBoundary } from "./AppErrorBoundary"
import SyncDeveloperPanel from "./ui/SyncDeveloperPanel.tsx"
import "./index.css"

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppBoundary>
      <>
        <App />
        <SyncDeveloperPanel />
      </>
    </AppBoundary>
  </React.StrictMode>
)
