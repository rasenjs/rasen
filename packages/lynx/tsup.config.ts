import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  // Never bundle workspace packages
  external: [/^@rasenjs\/.*/],
  // Disable require shims
  shims: false,
  banner: {
    js: '/* @rasenjs/lynx */',
  },
})
