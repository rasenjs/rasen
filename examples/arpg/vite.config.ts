import { defineConfig } from 'vite'
import { rasenHMR } from '@rasenjs/vite-plugin-rasen'

export default defineConfig({
  plugins: [rasenHMR()],
  resolve: {
    // The reactive adapter has to share the core instance: it installs the
    // runtime that the core's structural components (when/each/match) read.
    // Left to the pre-bundler, the adapter's own copy of the core would be
    // inlined into the dependency bundle, so the runtime it installs and the
    // one the components read would be two different objects — a panel
    // driven by a signal would never open.
    dedupe: ['@rasenjs/core', '@rasenjs/reactive-signals', '@rasenjs/dom', '@rasenjs/canvas-2d']
  },
  optimizeDeps: {
    exclude: [
      '@rasenjs/core',
      '@rasenjs/dom',
      '@rasenjs/canvas-2d',
      '@rasenjs/reactive-signals',
    ]
  },
  server: {
    port: 3013,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
