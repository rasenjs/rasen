import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: './index.html',
        shapes: './shapes.html',
        paths: './paths.html',
        transforms: './transforms.html',
        text: './text.html',
        advanced: './advanced.html',
        performance: './performance.html'
      }
    }
  },
  resolve: {
    alias: {
      '@rasenjs/core': resolve(__dirname, '../../packages/core/src'),
      '@rasenjs/dom': resolve(__dirname, '../../packages/dom/src'),
      '@rasenjs/canvas-2d': resolve(__dirname, '../../packages/canvas-2d/src'),
      '@rasenjs/reactive-vue': resolve(__dirname, '../../packages/reactive-vue/src')
    }
  }
})
