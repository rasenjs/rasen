import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // Runtime arm of the types-only jsx-runtime entry (copied over by build).
    'jsx-runtime': 'src/jsx-runtime.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['@rasenjs/core', '@rasenjs/dom']
})
