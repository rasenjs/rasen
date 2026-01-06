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
      input: 'src/client.ts',
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
    },
    noExternal: [
      '@rasenjs/core',
      '@rasenjs/html',
      '@rasenjs/router',
      '@rasenjs/router-html',
      '@rasenjs/web',
      '@rasenjs/web',
      '@rasenjs/shared'
    ]
  }
})
