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
      '@rasenjs/reactive-vue': path.resolve(__dirname, '../reactive-vue/src'),
      // Components import the isomorphic entry; this suite is the browser
      // target, so it resolves to the DOM renderer. The SSR suite resolves the
      // same specifier to the string renderer (vitest.ssr.config.ts). Aliases
      // match by prefix, so the subpath must precede the bare specifier.
      '@rasenjs/web/elements': path.resolve(__dirname, '../dom/src'),
      '@rasenjs/web': path.resolve(__dirname, '../dom/src')
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
