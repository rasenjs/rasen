/**
 * @deprecated
 *
 * `@rasenjs/vite-plugin-rasen` is now a thin compatibility shim over
 * `@rasenjs/compiler`. The unified, bundler-agnostic plugin lives in
 * `@rasenjs/compiler` (`rasenCompile`), covering JSX transform + static
 * hoisting + HMR for vite/webpack/rspack/esbuild.
 *
 * Prefer:
 *   import { rasenCompile } from '@rasenjs/compiler'
 *   plugins: [rasenCompile.vite()]
 */

import { rasenCompile, type RasenCompilerPluginOptions } from '@rasenjs/compiler'

export { rasenCompile }
export { compileFile } from './compile'
export type { CompileFileResult } from './compile'

/**
 * @deprecated Use `rasenCompile.vite()` from `@rasenjs/compiler` instead.
 */
export function rasenHMR(
  options: RasenCompilerPluginOptions = {}
): ReturnType<typeof rasenCompile.vite> {
  return rasenCompile.vite(options)
}
