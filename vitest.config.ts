import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@rasenjs/core/test-utils': path.resolve(__dirname, 'packages/core/src/test-utils.ts'),
      '@rasenjs/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@rasenjs/dom': path.resolve(__dirname, 'packages/dom/src/index.ts'),
      '@rasenjs/reactive-vue': path.resolve(
        __dirname,
        'packages/reactive-vue/src/index.ts'
      ),
      '@rasenjs/reactive-signals': path.resolve(
        __dirname,
        'packages/reactive-signals/src/index.ts'
      ),
      '@rasenjs/webgl': path.resolve(__dirname, 'packages/webgl/src/index.ts')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
})
