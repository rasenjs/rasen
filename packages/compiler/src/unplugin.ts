/**
 * Bundler-agnostic plugin (vite / webpack / rspack / esbuild via unplugin).
 *
 * Pipeline per module (in order):
 *   1. Standard JSX handling — wrap complex attribute expressions in getters.
 *   2. Static hoisting — compile intrinsic-tag subtrees into template calls.
 *   3. HMR — inject enterHmrModule/exitHmrModule around modules using com()
 *      (dev only; hot-accept is left to the bundler's own HMR).
 *
 * Static hoisting is ON by default (no `@rasen-compile` directive needed);
 * disable via `compile: false` for testing.
 *
 * Usage (vite):
 *   import { rasenCompile } from '@rasenjs/compiler'
 *   export default defineConfig({ plugins: [rasenCompile.vite()] })
 */

import { createUnplugin } from 'unplugin'
import { compileModule, type CompilerOptions } from './core'
import { transformJsxExpressions } from './jsx-transform'
import { injectHmr, usesCom, hasHmrWrapping } from './hmr'

export interface RasenCompilerPluginOptions extends CompilerOptions {
  /** Disable the whole plugin (default: enabled). */
  enabled?: boolean
  exclude?: string[]
  /** JSX attribute-expression transform (default: enabled). */
  jsxTransform?: boolean
  /** Static-hoisting compilation (default: enabled). */
  compile?: boolean
  /** HMR wrapping injection (default: enabled, dev only). */
  hmr?: boolean
}

function isExcluded(id: string, exclusions: Set<string>): boolean {
  for (const p of exclusions) {
    if (id.includes(p)) return true
  }
  return false
}

export const rasenCompile = createUnplugin(
  (options: RasenCompilerPluginOptions = {}) => {
    const enabled = options.enabled ?? true
    const jsxTransform = options.jsxTransform ?? true
    const compile = options.compile ?? true
    const hmr = options.hmr ?? true
    const excludeSet = new Set(
      options.exclude ?? ['node_modules', '/dist/', '/.yarn/']
    )
    // Whether we're in a dev build (vite: command==='serve'; webpack: mode==='development').
    let dev = false

    return {
      name: 'rasen-compile',
      // Must run before the bundler's built-in JSX→jsx() conversion
      enforce: 'pre',
      transformInclude(id: string) {
        return /\.[tj]sx?$/.test(id.split('?')[0])
      },
      // Inject the __RASEN_SSR__ compile-time constant so emitted SSR
      // branches dead-code-eliminate per build target:
      //   client build → 'false' (SSR literals stripped from the bundle)
      //   ssr build    → 'true'
      //   dev          → 'true' (harmless: the branch also duck-types the
      //                  host, so it never fires for DOM elements)
      // biome-ignore lint/suspicious/noExplicitAny: bundler config types vary
      config(userConfig: any, ctx: any) {
        dev = ctx?.command === 'serve' || ctx?.mode === 'development'
        if (ctx?.command !== 'build') {
          return { define: { __RASEN_SSR__: 'true' } }
        }
        return {
          define: { __RASEN_SSR__: userConfig.build?.ssr ? 'true' : 'false' },
        }
      },
      transform(code: string, id: string) {
        if (!enabled) return null
        if (isExcluded(id, excludeSet)) return null

        let out = code

        // 1. Standard JSX handling — wrap complex attribute expressions.
        if (jsxTransform) {
          out = transformJsxExpressions(out)
        }

        // 2. Static hoisting (default on).
        if (compile) {
          try {
            const result = compileModule(out, {
              ...options,
              filename: id.split('?')[0],
            })
            if (result) out = result.code
          } catch (error) {
            this.error(error as Error)
            return null
          }
        }

        // 3. HMR wrapping (dev only, modules using com()).
        if (hmr && dev && usesCom(out) && !hasHmrWrapping(out)) {
          out = injectHmr(out, id.split('?')[0])
        }

        if (out === code) return null
        return { code: out, map: null }
      },
    }
  }
)
