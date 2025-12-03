import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@rasenjs/core': new URL('../../packages/core/src/index.ts', import.meta.url).pathname,
      '@rasenjs/dom': new URL('../../packages/dom/src/index.ts', import.meta.url).pathname,
      '@rasenjs/reactive-signals': new URL('../../packages/reactive-signals/src/index.ts', import.meta.url).pathname,
      '@rasenjs/router/components': new URL('../../packages/router/src/components/index.ts', import.meta.url).pathname,
      '@rasenjs/router': new URL('../../packages/router/src/index.ts', import.meta.url).pathname,
    },
    dedupe: ['@rasenjs/core']
  },
  optimizeDeps: {
    exclude: ['@rasenjs/core', '@rasenjs/dom', '@rasenjs/reactive-signals', '@rasenjs/router']
  },
  server: {
    port: 3001,
    open: true
  }
})
