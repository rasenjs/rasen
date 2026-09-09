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
    minify: false, // DEBUG: was 'terser'
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
      // Pin @vue/reactivity to the ROOT copy (3.5.25, the version
      // @rasenjs/reactive-vue uses). Without this, the direct
      // `import { shallowRef } from '@vue/reactivity'` in the bench pages
      // resolves to benchmark/node_modules (3.6.0-rc.5, hoisted from the
      // vapor benchmark's vue@3.6.0-rc.5) — a SECOND reactivity copy whose
      // refs the runtime's effects cannot track (each/spine silently never
      // mounts). Keep this alias in sync if the root version changes.
      { find: '@vue/reactivity', replacement: resolve(__dirname, '../../node_modules/@vue/reactivity') },
      { find: '@rasenjs/dom/jsx-runtime', replacement: resolve(__dirname, '../../packages/dom/dist/jsx-runtime.js') },
      { find: '@rasenjs/dom/jsx-dev-runtime', replacement: resolve(__dirname, '../../packages/dom/dist/jsx-runtime.js') },
      { find: '@rasenjs/core', replacement: resolve(__dirname, '../../packages/core/dist') },
      { find: '@rasenjs/reactive-vue', replacement: resolve(__dirname, '../../packages/reactive-vue/dist') },
      { find: '@rasenjs/assets', replacement: resolve(__dirname, '../../packages/assets/dist') },
      { find: '@rasenjs/canvas-2d', replacement: resolve(__dirname, '../../packages/canvas-2d/dist') },
      { find: '@rasenjs/gfx', replacement: resolve(__dirname, '../../packages/gfx/dist') },
      { find: '@rasenjs/dom', replacement: resolve(__dirname, '../../packages/dom/dist') }
    ]
  }
})
