import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  treeshake: true,
  external: [
    '@rasenjs/core',
    '@rasenjs/html',
    '@rasenjs/router',
    '@rasenjs/shared'
  ]
})
