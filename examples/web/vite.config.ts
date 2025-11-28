import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    dedupe: ['@rasenjs/core']
  },
  optimizeDeps: {
    exclude: ['@rasenjs/core', '@rasenjs/dom', '@rasenjs/canvas-2d']
  },
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
