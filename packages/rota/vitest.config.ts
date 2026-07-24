import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@rasenjs/rota': path.resolve(__dirname, 'src'),
      '@rasenjs/rota/tests': path.resolve(__dirname, 'tests'),
      '@rasenjs/core': path.resolve(__dirname, '../core/src'),
      '@rasenjs/dom': path.resolve(__dirname, '../dom/src'),
      '@rasenjs/html': path.resolve(__dirname, '../html/src'),
      '@rasenjs/reactive-vue': path.resolve(__dirname, '../reactive-vue/src')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['tests/**', 'dist/**', '**/*.d.ts', '**/*.config.*']
    },
    reporters: ['default', 'verbose'],
    ui: false
  }
})
