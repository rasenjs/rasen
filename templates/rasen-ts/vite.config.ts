import { defineConfig } from 'vite'
import { rasenCompile } from '@rasenjs/compiler'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

/**
 * Monorepo development override — inert for published usage.
 *
 * This template ships published semver ranges, so a `degit`'d copy installs
 * the released packages. When the template is instead checked out inside the
 * Rasen monorepo, the sibling `packages/*` are pinned so edits to package
 * sources are picked up immediately.
 *
 * `optimizeDeps.exclude` is required alongside the alias: otherwise Vite
 * pre-bundles each aliased package's `dist` into node_modules/.vite and keeps
 * serving that stale copy after a rebuild.
 */
const packagesDir = resolve(root, '../../packages')
const { dependencies } = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8')
) as { dependencies?: Record<string, string> }

const localPackages = existsSync(packagesDir)
  ? Object.keys(dependencies ?? {}).filter(
      (name) =>
        name.startsWith('@rasenjs/') &&
        existsSync(resolve(packagesDir, name.slice('@rasenjs/'.length)))
    )
  : []

export default defineConfig({
  // One plugin covers the whole Rasen pipeline: JSX attribute expressions are
  // wrapped in getters, fully static subtrees are hoisted into templates, and
  // dev-only HMR boundaries are injected around modules that use com().
  plugins: [rasenCompile.vite()],

  resolve: {
    // Use package.json "exports" conditions for isomorphic packages
    conditions: ['import', 'module', 'browser'],
    // signal-polyfill must resolve to a single copy: the active runtime
    // recognizes signals via `Signal.isState`, which returns false for
    // instances created by a duplicate copy of the package.
    dedupe: ['signal-polyfill', '@rasenjs/core'],
    // Alias to the package DIRECTORY, not a single entry file: each package's
    // own "exports" conditions must keep deciding the entry (e.g. @rasenjs/web
    // is dom.js for the browser and html.js on the server).
    //
    // The pattern is anchored so that only the bare specifier matches. Vite
    // aliases are prefix replacements, so an unanchored `@rasenjs/core` would
    // also capture subpath imports (`@rasenjs/core/utils` → <pkg>/utils) and
    // bypass `exports`, breaking those imports entirely.
    ...(localPackages.length > 0
      ? {
          alias: localPackages.map((name) => ({
            find: new RegExp(`^${name}$`),
            replacement: resolve(packagesDir, name.slice('@rasenjs/'.length))
          }))
        }
      : {})
  },
  optimizeDeps: {
    exclude: localPackages
  },
  build: {
    target: 'esnext',
    minify: false,
    rollupOptions: {
      input: 'src/entry-client.tsx',
      output: {
        format: 'es',
        entryFileNames: '[name].js'
      }
    }
  },
  ssr: {
    // Override conditions for SSR
    resolve: {
      conditions: ['ssr', 'import', 'module', 'node']
    }
    // Vite automatically externalizes node_modules in SSR mode
    // No need to configure noExternal or external
  }
})