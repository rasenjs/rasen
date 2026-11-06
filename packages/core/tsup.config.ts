import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    components: 'src/components/index.ts',
    utils: 'src/utils/index.ts',
    'html-tags': 'src/html-tags.ts',
    'jsx-runtime-stub': 'src/jsx-runtime-stub.ts',
    'test-utils': 'src/test-utils.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['vitest']
})
