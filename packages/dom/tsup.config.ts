import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'jsx-runtime': 'src/jsx-runtime.ts',
    template: 'src/template.ts',
    bindings: 'src/bindings.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  // Entries must share module state. With `splitting: false` every entry
  // inlines its own copy of the package's internal modules, so the hydration
  // cursor set by hydrate() (entry `index`) is invisible to the compiled path
  // (entry `template`): compiled components then never adopt the
  // server-rendered DOM. Other singleton state (event delegation, image
  // adapter) has the same hazard.
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['@rasenjs/core']
})
