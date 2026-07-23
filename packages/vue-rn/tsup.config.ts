import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['cjs'],
  target: 'es2020',
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  // Let Metro handle Vue's CJS files directly — no pre-bundling.
  external: ['@vue/runtime-core', '@vue/reactivity', '@vue/shared', '@rasenjs/rn-dom'],
})
