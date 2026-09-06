import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['@rasenjs/core', '@rasenjs/canvas-2d', '@rasenjs/webgl'],
  // Bundle @rasenjs/math into the dist so the standalone viewer copy
  // (tools/spine-compare/spine-dist) stays self-contained.
  noExternal: ['@rasenjs/math'],
})
