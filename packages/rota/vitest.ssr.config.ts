import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Server-side rendering suite.
 *
 * The same component source, resolved the other way: `@rasenjs/web/elements`
 * points at the string renderer instead of the DOM one, exactly as a node build
 * of an app would resolve it.
 *
 * The environment is `node`, not jsdom, on purpose. That is the assertion that
 * costs nothing to make: a component that reaches for `document`, an element
 * ref, or anything else only a browser has will throw here rather than quietly
 * work in the test and fail on a server.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@rasenjs/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@rasenjs/html': path.resolve(__dirname, '../html/src/index.ts'),
      '@rasenjs/reactive-vue': path.resolve(
        __dirname,
        '../reactive-vue/src/index.ts'
      ),
      '@rasenjs/web/elements': path.resolve(__dirname, '../html/src/index.ts'),
      '@rasenjs/web': path.resolve(__dirname, '../html/src/index.ts'),
      '@rasenjs/rota': path.resolve(__dirname, 'src/index.ts')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    // Same reactive runtime as the browser suite: a component's setup is
    // host-agnostic, so only the view layer differs between the two configs.
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/ssr/**/*.test.ts']
  }
})
