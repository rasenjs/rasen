import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { dom: 'src/dom.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    external: ['@rasenjs/dom', '@rasenjs/router-dom', '@rasenjs/core']
  },
  {
    entry: { html: 'src/html.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    external: ['@rasenjs/html', '@rasenjs/router-html', '@rasenjs/core']
  },
  {
    entry: {
      'jsx-runtime': 'src/jsx-runtime.ts',
      'jsx-runtime-ssr': 'src/jsx-runtime-ssr.ts',
    },
    format: ['esm'],
    dts: true,
    clean: false,
    external: ['@rasenjs/core', '@rasenjs/dom', '@rasenjs/html']
  }
])
