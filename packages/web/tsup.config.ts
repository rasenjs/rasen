import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { dom: 'src/dom.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    external: ['@rasenjs/dom', '@rasenjs/router-dom']
  },
  {
    entry: { html: 'src/html.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    external: ['@rasenjs/html', '@rasenjs/router-html']
  },
  {
    entry: {
      'jsx-runtime': 'src/jsx-runtime.ts',
      'jsx-dev-runtime': 'src/jsx-dev-runtime.ts',
      'jsx-runtime-ssr': 'src/jsx-runtime-ssr.ts',
      'jsx-dev-runtime-ssr': 'src/jsx-dev-runtime-ssr.ts',
    },
    format: ['esm'],
    dts: true,
    splitting: false,
    clean: false,
    external: ['@rasenjs/jsx-runtime', '@rasenjs/dom', '@rasenjs/html', '@rasenjs/router-dom', '@rasenjs/router-html']
  }
])
