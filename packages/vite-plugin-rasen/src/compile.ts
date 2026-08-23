/**
 * Static-hoisting JSX compiler — thin delegation to @rasenjs/compiler.
 *
 * Kept as a separate module so the plugin's public surface (`compileFile`)
 * stays stable while the implementation lives in the dedicated compiler
 * package (single source of truth for emission logic, SSR gating, slots).
 */

import { compileModule } from '@rasenjs/compiler'

export interface CompileFileResult {
  code: string
  map: unknown
  compiled: number
  fellBack: number
}

/** Compile a TSX/JSX module marked with `@rasen-compile`. Returns null when
 *  the file lacks the directive or contains nothing compilable. */
export function compileFile(code: string): CompileFileResult | null {
  return compileModule(code)
}
