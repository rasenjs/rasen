import { defineConfig } from 'vite'
import { resolve } from 'path'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  root: __dirname,
  plugins: [UnoCSS()],
  server: {
    port: 5191,
    strictPort: true
  },
  resolve: {
    alias: {
      // JSX runtime subpaths must resolve to source explicitly — the bare
      // '@rasenjs/dom' alias below is a prefix match and would otherwise
      // rewrite '@rasenjs/dom/jsx-dev-runtime' to a non-existent src path.
      '@rasenjs/dom/jsx-runtime': resolve(__dirname, '../../packages/dom/src/jsx-runtime.ts'),
      '@rasenjs/dom/jsx-dev-runtime': resolve(__dirname, '../../packages/dom/src/jsx-runtime.ts'),
      '@rasenjs/core': resolve(__dirname, '../../packages/core/src'),
      '@rasenjs/dom': resolve(__dirname, '../../packages/dom/src'),
      '@rasenjs/canvas-2d': resolve(__dirname, '../../packages/canvas-2d/src'),
      '@rasenjs/reactive-vue': resolve(__dirname, '../../packages/reactive-vue/src'),
      '@rasenjs/assets': resolve(__dirname, '../../packages/assets/src'),
      '@rasenjs/webgl': resolve(__dirname, '../../packages/webgl/src')
    }
  }
})
