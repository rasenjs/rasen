/**
 * @rasenjs/react-native — Babel plugin (Metro HMR injection)
 *
 * Metro's HMR uses `module.hot.accept()` (webpack-style), unlike Vite's
 * `import.meta.hot.accept()`. This plugin injects rasen's HMR runtime calls
 * (`enterHmrModule` / `exitHmrModule` from `@rasenjs/core`) plus
 * `module.hot.accept()` into component files, mirroring what
 * `@rasenjs/vite-plugin-rasen` does for Vite.
 *
 * Usage (babel.config.js):
 * ```js
 * module.exports = {
 *   presets: ['module:@react-native/babel-preset'],
 *   plugins: [
 *     ['@rasenjs/react-native/babel', { hmr: true }],
 *   ],
 * }
 * ```
 *
 * Only files that call `com()` (rasen's component wrapper) are injected, so
 * plain utility modules are left untouched.
 */

import type { PluginObj, PluginPass } from '@babel/core'
import type * as BabelTypes from '@babel/types'
import { relative } from 'path'

export interface RasenRNBabelOptions {
  /** Enable HMR injection (default true). */
  hmr?: boolean
  /** Project root used to derive the module id (default process.cwd()). */
  root?: string
}

const COM_CALL_RE = /\bcom\s*\(/

export default function rasenRNBabel(
  api: { types: typeof BabelTypes },
  options: RasenRNBabelOptions = {},
): PluginObj<PluginPass> {
  const t = api.types
  const hmrEnabled = options.hmr !== false
  const root = options.root ?? process.cwd()

  return {
    name: 'rasen-rn-hmr',
    visitor: {
      Program: {
        exit(path, state) {
          if (!hmrEnabled) return
          const code = state.file.code ?? ''
          // Only inject into component files that use com().
          if (!COM_CALL_RE.test(code)) return
          if (code.includes('enterHmrModule(')) return

          const filename = state.filename ?? ''
          const moduleId = relative(root, filename).replace(/\\/g, '/')

          // 1. Insert the import + enterHmrModule call after the last import.
          const importDecl = t.importDeclaration(
            [
              t.importSpecifier(
                t.identifier('enterHmrModule'),
                t.identifier('enterHmrModule'),
              ),
              t.importSpecifier(
                t.identifier('exitHmrModule'),
                t.identifier('exitHmrModule'),
              ),
            ],
            t.stringLiteral('@rasenjs/core'),
          )
          const enterCall = t.expressionStatement(
            t.callExpression(t.identifier('enterHmrModule'), [
              t.stringLiteral(moduleId),
            ]),
          )

          // Find the last import declaration to insert after it.
          let lastImportIndex = -1
          path.node.body.forEach((node, i) => {
            if (t.isImportDeclaration(node)) lastImportIndex = i
          })
          if (lastImportIndex >= 0) {
            path.node.body.splice(lastImportIndex + 1, 0, importDecl, enterCall)
          } else {
            path.node.body.unshift(importDecl, enterCall)
          }

          // 2. Append exitHmrModule() + module.hot.accept() at the end.
          path.node.body.push(
            t.expressionStatement(t.callExpression(t.identifier('exitHmrModule'), [])),
            t.expressionStatement(
              t.logicalExpression(
                '&&',
                t.memberExpression(t.identifier('module'), t.identifier('hot')),
                t.callExpression(
                  t.memberExpression(
                    t.memberExpression(t.identifier('module'), t.identifier('hot')),
                    t.identifier('accept'),
                  ),
                  [],
                ),
              ),
            ),
          )
        },
      },
    },
  }
}
