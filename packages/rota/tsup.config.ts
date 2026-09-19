import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    '@rasenjs/core',
    // The element factories are resolved by the *consumer's* bundler:
    // `@rasenjs/web/elements` is @rasenjs/dom in a browser and @rasenjs/html
    // under the node condition. Bundling it here would freeze one target.
    '@rasenjs/web',
    '@rasenjs/reactive-vue',
    '@rasenjs/reactive-signals'
  ]
})
