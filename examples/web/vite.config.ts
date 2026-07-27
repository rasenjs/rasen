import { defineConfig } from 'vite'
import { rasenHMR } from '@rasenjs/vite-plugin-rasen'

export default defineConfig({
  plugins: [rasenHMR()],
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
