import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    // Use package.json "exports" conditions for isomorphic packages
    conditions: ['import', 'module', 'browser']
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