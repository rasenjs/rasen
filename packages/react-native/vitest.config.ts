/**
 * @rasenjs/react-native — Vitest configuration
 *
 * Aliases @rasenjs/rn-dom to its source so tests run against the
 * TypeScript sources (no build step needed), mirroring rn-dom's own
 * test setup.
 */
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@rasenjs/rn-dom': path.resolve(__dirname, '../rn-dom/src/index.ts'),
      '@rasenjs/rn-dom/elements': path.resolve(__dirname, '../rn-dom/elements.cjs'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
