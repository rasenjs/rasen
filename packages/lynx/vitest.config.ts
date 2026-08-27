/**
 * @rasenjs/lynx — Vitest configuration
 *
 * Aliases @rasenjs/core to its source so tests run against the
 * TypeScript sources (no build step needed), mirroring the
 * react-native package's test setup.
 */
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@rasenjs/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
