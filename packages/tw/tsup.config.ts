import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/perry.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  treeshake: true,
  minify: false,
  target: 'es2020'
})