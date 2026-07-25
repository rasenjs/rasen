import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    renderer: 'src/renderer.ts',
    router: 'src/router.ts',
    'web/index': 'src/web/index.ts',
  },
  format: ['cjs', 'esm'],
  target: 'es2020',
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    '@rasenjs/rn-dom',
    'svelte',
    'svelte/compiler',
    'svelte/renderer',
    'react-native',
  ],
})
