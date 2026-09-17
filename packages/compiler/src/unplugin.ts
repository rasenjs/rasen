/**
 * Bundler-agnostic plugin (vite / webpack / rspack / esbuild via unplugin).
 *
 * Pipeline per module (in order):
 *   1. Static hoisting — compile intrinsic-tag subtrees into template calls.
 *      Consumes RAW JSX: its shape detection (`cond ? 'cls' : ''` →
 *      bindClassToggle, static StringLiteral attrs, …) only holds for the
 *      expressions the author wrote.
 *   2. Standard JSX handling — wrap the attribute expressions that are LEFT
 *      (fallback / component subtrees) in getters so the runtime props layer
 *      sees a reactive source.
 *   3. HMR — inject enterHmrModule/exitHmrModule around modules using com()
 *      (dev only; hot-accept is left to the bundler's own HMR).
 *
 * ⚠️ Order matters: running step 2 first would rewrite every complex prop
 * expression to `() => expr` before step 1 sees it. The hoisting pass then
 * fails its shape checks and wraps the getter *again* (`() => () => expr`), so
 * `bindClass`/`bindProp` would receive a getter that returns a function and
 * stringify it into the attribute. Locked by the pipeline tests in
 * `__tests__/pipeline.test.ts`.
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

/**
 * The per-module pipeline. See the module header for why the order is fixed
 * (static hoisting must see the author's raw expressions).
 *
 * `hmr` here means "inject the wrappers"; the caller owns the dev-only check.
 * Returns the rewritten code, or null when nothing changed. Throws when static
 * hoisting fails, so the plugin can report it against the offending module.
 */
export function transformModule(
  code: string,
  filename: string,
  options: RasenCompilerPluginOptions = {}
): string | null {
  const { jsxTransform = true, compile = true, hmr = false } = options
  let out = code

  // 1. Static hoisting — consumes raw JSX.
  if (compile) {
    const result = compileModule(out, { ...options, filename })
    if (result) out = result.code
  }

  // 2. JSX attribute handling for whatever hoisting left behind (fallbacks,
  //    component subtrees).
  if (jsxTransform) {
    out = transformJsxExpressions(out)
  }

  // 3. HMR wrapping — modules using com().
  if (hmr && usesCom(out) && !hasHmrWrapping(out)) {
    out = injectHmr(out, filename)
  }

  return out === code ? null : out
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

        let out: string | null
        try {
          out = transformModule(code, id.split('?')[0], {
            ...options,
            jsxTransform,
            compile,
            // HMR wrapping is dev-only; the pipeline itself is env-agnostic.
            hmr: hmr && dev,
          })
        } catch (error) {
          this.error(error as Error)
          return null
        }

        if (out === null) return null
        return { code: out, map: null }
      },
    }
  }
)
