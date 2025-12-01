import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    },
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
      '@rasenjs/core': resolve(__dirname, '../../packages/core/src'),
      '@rasenjs/dom': resolve(__dirname, '../../packages/dom/src'),
      '@rasenjs/reactive-vue': resolve(__dirname, '../../packages/reactive-vue/src')
    }
  }
})
