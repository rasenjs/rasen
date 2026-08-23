import { defineConfig } from 'vite'
import { resolve } from 'path'
import { rasenCompile } from '@rasenjs/compiler'

// Isolated benchmark preview for Rasen (render-function, built dist packages).
// Each preview has its own package.json + vite config to avoid cross-pollution.
export default defineConfig({
  base: './',
  plugins: [rasenCompile.vite()],
  server: {
    port: 5174,
    strictPort: true
  },
  preview: {
    port: 5174,
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
  },
  resolve: {
    alias: {
      // Use the pre-built dist packages (not source) so the benchmark measures
      // the real published output. Build them first via `yarn workspace <pkg> build`.
      '@rasenjs/core': resolve(__dirname, '../../packages/core/dist'),
      '@rasenjs/dom': resolve(__dirname, '../../packages/dom/dist'),
      '@rasenjs/reactive-vue': resolve(__dirname, '../../packages/reactive-vue/dist'),
      '@rasenjs/reactive-signals': resolve(__dirname, '../../packages/reactive-signals/dist')
    }
  }
})
