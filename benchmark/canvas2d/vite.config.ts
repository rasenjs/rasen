import { defineConfig } from 'vite'
import { resolve } from 'path'

// Multi-page build: one entry per comparison target. Every page renders the
// SAME scene spec (shared/spec.ts) with its own library — the only variable
// between pages is the rendering library itself.
// Rasen packages are aliased to their pre-built dist output so the benchmark
// measures the real published artifacts (same policy as the DOM benchmark).
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
        vanilla: resolve(__dirname, 'vanilla.html'),
        konva: resolve(__dirname, 'konva.html'),
        'konva-fast': resolve(__dirname, 'konva-fast.html'),
        fabric: resolve(__dirname, 'fabric.html'),
        'fabric-fast': resolve(__dirname, 'fabric-fast.html'),
        rasen: resolve(__dirname, 'rasen.html')
      }
    }
  },
  server: { port: 5175, strictPort: true },
  preview: { port: 5175, strictPort: true },
  resolve: {
    alias: {
      '@rasenjs/core': resolve(__dirname, '../../packages/core/dist'),
      '@rasenjs/dom': resolve(__dirname, '../../packages/dom/dist'),
      '@rasenjs/canvas-2d': resolve(__dirname, '../../packages/canvas-2d/dist'),
      '@rasenjs/reactive-vue': resolve(__dirname, '../../packages/reactive-vue/dist')
    }
  }
})
