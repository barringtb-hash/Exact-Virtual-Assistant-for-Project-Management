import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
  },
  // Note: node:fs/promises is dynamically imported in loadTemplateJson.js
  // only when not in browser context. Vite will show a warning but handles
  // this correctly by externalizing the module.
})
