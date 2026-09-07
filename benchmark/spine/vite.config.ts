import { defineConfig } from 'vite'
import { resolve } from 'path'

// Multi-page build: one entry per comparison target. Every page loads the SAME
// skeleton asset (shared/spec.ts) and runs the SAME bench protocol — the only
// variable between pages is the spine runtime / renderer.
//
// Aliasing policy: @rasenjs/* packages resolve to their built dist output
// (measure the real published artifacts, same as the canvas2d benchmark).
// The npm dependency version of the workspace packages (file: links) is only
// used by tooling; vite resolves source imports through the alias below.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true }
    },
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        'official-webgl': resolve(__dirname, 'official-webgl.html'),
        'official-canvas': resolve(__dirname, 'official-canvas.html'),
        pixi: resolve(__dirname, 'pixi.html'),
        'rasen-webgl': resolve(__dirname, 'rasen-webgl.html'),
        'rasen-canvas': resolve(__dirname, 'rasen-canvas.html')
      }
    }
  },
  server: { port: 5177, strictPort: true },
  preview: { port: 5177, strictPort: true },
  resolve: {
    alias: [
      { find: '@rasenjs/dom/jsx-runtime', replacement: resolve(__dirname, '../../packages/dom/dist/jsx-runtime.js') },
      { find: '@rasenjs/dom/jsx-dev-runtime', replacement: resolve(__dirname, '../../packages/dom/dist/jsx-runtime.js') },
      { find: '@rasenjs/core', replacement: resolve(__dirname, '../../packages/core/dist') },
      { find: '@rasenjs/reactive-vue', replacement: resolve(__dirname, '../../packages/reactive-vue/dist') },
      { find: '@rasenjs/assets', replacement: resolve(__dirname, '../../packages/assets/dist') },
      { find: '@rasenjs/canvas-2d', replacement: resolve(__dirname, '../../packages/canvas-2d/dist') },
      { find: '@rasenjs/webgl', replacement: resolve(__dirname, '../../packages/webgl/dist') },
      { find: '@rasenjs/dom', replacement: resolve(__dirname, '../../packages/dom/dist') }
    ]
  }
})
