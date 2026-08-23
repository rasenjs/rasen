import { defineConfig } from 'vite'

// Isolated benchmark preview for the native DOM (vanilla JS) implementation.
export default defineConfig({
  base: './',
  server: {
    port: 5179,
    strictPort: true
  },
  preview: {
    port: 5179,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
})
