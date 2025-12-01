import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@rasenjs/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@rasenjs/dom': path.resolve(__dirname, 'packages/dom/src/index.ts'),
      '@rasenjs/reactive-vue': path.resolve(
        __dirname,
        'packages/reactive-vue/src/index.ts'
      )
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
})
