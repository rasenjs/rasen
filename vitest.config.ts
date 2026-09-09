import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@rasenjs/core/test-utils': path.resolve(
        __dirname,
        'packages/core/src/test-utils.ts'
      ),
      '@rasenjs/core/utils': path.resolve(
        __dirname,
        'packages/core/src/utils/index.ts'
      ),
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
      '@rasenjs/gfx': path.resolve(__dirname, 'packages/gfx/src/index.ts'),
      '@rasenjs/rota/components': path.resolve(
        __dirname,
        'packages/rota/src/components'
      ),
      '@rasenjs/rota/primitives': path.resolve(
        __dirname,
        'packages/rota/src/primitives'
      ),
      '@rasenjs/rota': path.resolve(__dirname, 'packages/rota/src/index.ts'),
      'react-native/Libraries/ReactPrivate/ReactNativePrivateInterface': path.resolve(
        __dirname,
        'packages/rn-dom/src/__tests__/react-native-private-mock.ts'
      ),
      'react-native': path.resolve(
        __dirname,
        'packages/rn-dom/src/__tests__/react-native-mock.ts'
      ),
      '@rasenjs/html': path.resolve(__dirname, 'packages/html/src/index.ts')
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
