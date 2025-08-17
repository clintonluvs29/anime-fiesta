import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'terser', // Explicitly enable terser
    terserOptions: {
      compress: {
        drop_console: true, // Remove console logs in production
        drop_debugger: true // Remove debugger statements
      }
    }
  }
})