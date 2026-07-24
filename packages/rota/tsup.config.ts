import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    dom: 'src/dom.ts',
    html: 'src/html.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    '@rasenjs/core',
    '@rasenjs/dom',
    '@rasenjs/html',
    '@rasenjs/reactive-vue',
    '@rasenjs/reactive-signals'
  ]
})
