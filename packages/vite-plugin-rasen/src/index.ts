/**
 * @rasenjs/vite-plugin-rasen - Vite plugin for Rasen
 *
 * 1. JSX transform (default-on): wraps complex JSX attribute expressions
 *    (`a={x+1}`) in getters (`a={() => x+1}`) so they become reactive.
 * 2. HMR: injects enterHmrModule/exitHmrModule around files using com().
 *
 * 用户零配置。
 */

import type { Plugin, ResolvedConfig } from 'vite'
import { relative } from 'path'
import { transformJsxExpressions } from './jsx-transform'
import { compileFile } from './compile'

export { compileFile }


export interface RasenHMRPluginOptions {
  enabled?: boolean
  exclude?: string[]
  /** Disable the JSX attribute expression transform (default: enabled). */
  jsxTransform?: boolean
  /** Enable static-hoisting compilation for files marked `@rasen-compile`
   *  (default: enabled). */
  compile?: boolean
}

const IMPORT_LINE_RE = /^import\s+/m
const COM_CALL_RE = /\bcom\s*\(/

export function rasenHMR(options: RasenHMRPluginOptions = {}): Plugin {
  let config: ResolvedConfig
  const enabled = options.enabled ?? true
  const jsxTransform = options.jsxTransform ?? true
  const excludeSet = new Set(options.exclude ?? ['node_modules', '/dist/', '/.yarn/'])

  return {
    name: 'rasen:hmr',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },

    transform(code: string, id: string) {
      if (!enabled) return
      if (isExcluded(id, excludeSet)) return
      if (!/\.(tsx?|jsx?)$/.test(id)) return
      if (id.includes('node_modules')) return

      // 1. Static-hoisting compilation for @rasen-compile files
      let out = code
      if (options.compile !== false) {
        const result = compileFile(out)
        if (result) {
          out = result.code
        }
      }

      // 2. JSX attribute expression transform (default-on)
      if (jsxTransform) {
        out = transformJsxExpressions(out)
      }

      // 3. HMR injection (dev only, files using com())
      if (config.command !== 'build' && COM_CALL_RE.test(out) && !out.includes('enterHmrModule(')) {
        out = injectHmr(out, id, config.root)
      }

      if (out === code) return
      return { code: out, map: null }
    }
  }
}

function injectHmr(code: string, id: string, root: string): string {
  const moduleId = relative(root, id)

  // 在最后一个 import 后注入 enterHmrModule
  const lines = code.split('\n')
  let lastImport = -1
  for (let i = 0; i < lines.length; i++) {
    if (IMPORT_LINE_RE.test(lines[i])) lastImport = i
  }
  let pos = 0
  for (let i = 0; i <= lastImport; i++) pos += lines[i].length + 1

  const before = code.slice(0, pos)
  const after = code.slice(pos)

  return before +
    `import { enterHmrModule, exitHmrModule } from '@rasenjs/core';\n` +
    `enterHmrModule('${moduleId}');\n\n` +
    after +
    `\n\nexitHmrModule();\n/* rsen-hmr */\nimport.meta.hot && import.meta.hot.accept();`
}

function isExcluded(id: string, exclusions: Set<string>): boolean {
  for (const p of exclusions) { if (id.includes(p)) return true }
  return false
}
