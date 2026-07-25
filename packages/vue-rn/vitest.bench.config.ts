import { defineConfig } from 'vitest/config'
import path from 'path'

const M = path.resolve(__dirname, 'src/__bench__/__mocks__')

export default defineConfig({
  resolve: {
    alias: [
      { find: '@rasenjs/rn-dom/elements', replacement: M + '/elements.cjs' },
      { find: '@rasenjs/rn-dom', replacement: path.resolve(__dirname, '../rn-dom/src/index.ts') },
      // Mock react-native package — moved out of node_modules to avoid gitignore
      { find: 'react-native', replacement: M + '/rn-local-pkg/react-native' },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__bench__/setup.ts'],
    include: ['src/__bench__/**/*.bench.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
