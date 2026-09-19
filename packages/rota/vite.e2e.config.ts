import { defineConfig } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')

/**
 * Dev server for the e2e page.
 *
 * A static file server cannot serve this page, and that is why the whole suite
 * used to fail without saying why: the page imports the library by its
 * workspace name, and the library's own imports are bare specifiers
 * (`@rasenjs/core`, `@rasenjs/dom`, `@rasenjs/web/elements`, and everything
 * `dom` pulls behind itself — assets, gfx, canvas-2d, and their dependencies).
 * A browser cannot resolve those; it dies on the first import, every mount
 * renders nothing, and every spec fails reporting missing elements. A
 * hand-written import map only moves the problem along (it has to grow with
 * every transitive import — `@rasenjs/assets` was the next one).
 *
 * Vite resolves all of it. The aliases point at *sources* rather than `dist`,
 * for the same reason the site does: a spec should exercise the code being
 * edited, not the last build.
 *
 * Root stays this package so the page keeps its `/tests/e2e/` URL and Vite does
 * not try to treat every HTML file in the repository as an entry point;
 * `server.fs.allow` opens the repository so the aliased sources can be read.
 */
export default defineConfig({
  root: here,
  resolve: {
    alias: [
      {
        find: /^@rasenjs\/rota$/,
        replacement: resolve(repo, 'packages/rota/src/index.ts')
      },
      {
        find: /^@rasenjs\/core$/,
        replacement: resolve(repo, 'packages/core/src/index.ts')
      },
      {
        find: /^@rasenjs\/web\/elements$/,
        replacement: resolve(repo, 'packages/dom/src/index.ts')
      },
      {
        find: /^@rasenjs\/dom$/,
        replacement: resolve(repo, 'packages/dom/src/index.ts')
      },
      {
        find: /^@rasenjs\/reactive-vue$/,
        replacement: resolve(repo, 'packages/reactive-vue/src/index.ts')
      }
    ]
  },
  server: {
    port: 3000,
    strictPort: false,
    fs: { allow: [repo] }
  }
})
