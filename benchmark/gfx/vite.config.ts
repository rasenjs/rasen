import { defineConfig } from 'vite'
import { resolve } from 'path'

// Single-page build for the gfx renderer safety net (golden lock + GL probe).
// Aliasing policy matches benchmark/spine: @rasenjs/* resolve to built dist —
// we measure the real artifacts, and the golden lock validates exactly what
// ships.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    minify: false,
    rollupOptions: {
      input: {
        scenes: resolve(__dirname, 'scenes.html'),
        ab: resolve(__dirname, 'ab.html')
      }
    }
  },
  server: { port: 5178, strictPort: true },
  preview: { port: 5178, strictPort: true },
  resolve: {
    alias: [
      { find: '@rasenjs/core', replacement: resolve(__dirname, '../../packages/core/dist') },
      { find: '@rasenjs/reactive-vue', replacement: resolve(__dirname, '../../packages/reactive-vue/dist') },
      { find: '@rasenjs/gfx', replacement: resolve(__dirname, '../../packages/gfx/dist') }
    ]
  }
})
