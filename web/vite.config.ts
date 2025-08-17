// web/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../web/dist', // Explicit output directory
    emptyOutDir: true
  },
  base: '/', // Ensure correct base path
  server: {
    // ... your existing server config
  }
})