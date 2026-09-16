import { defineConfig } from 'vite'
import { rasenCompile } from '@rasenjs/compiler'

export default defineConfig({
  // One plugin covers the whole Rasen pipeline: JSX attribute expressions are
  // wrapped in getters, fully static subtrees are hoisted into templates, and
  // dev-only HMR boundaries are injected around modules that use com().
  plugins: [rasenCompile.vite()],

  resolve: {
    // Use package.json "exports" conditions for isomorphic packages
    conditions: ['import', 'module', 'browser'],
    // signal-polyfill must resolve to a single copy: the active runtime
    // recognizes signals via `Signal.isState`, which returns false for
    // instances created by a duplicate copy of the package.
    dedupe: ['signal-polyfill', '@rasenjs/core']
  },
  build: {
    target: 'esnext',
    minify: false,
    rollupOptions: {
      input: 'src/entry-client.tsx',
      output: {
        format: 'es',
        entryFileNames: '[name].js'
      }
    }
  },
  ssr: {
    // Override conditions for SSR
    resolve: {
      conditions: ['ssr', 'import', 'module', 'node']
    }
    // Vite automatically externalizes node_modules in SSR mode
    // No need to configure noExternal or external
  }
})