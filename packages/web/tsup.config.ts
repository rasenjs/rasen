import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { dom: 'src/dom.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    external: ['@rasenjs/dom']
  },
  {
    entry: { html: 'src/html.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    external: ['@rasenjs/html']
  }
])
