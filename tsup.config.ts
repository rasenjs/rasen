import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/vue': 'src/adapters/vue.ts',
    'dom/index': 'src/dom/index.ts',
    'canvas-2d/index': 'src/canvas-2d/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['vue']
})
