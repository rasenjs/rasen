/**
 * @rasenjs/react-native — Babel plugin.
 *
 * Two passes, both in `Program.exit` (bottom-up, so nested JSX is already
 * converted by the time a parent is visited):
 *
 *  1. **JSX elimination** — the same pass `@rasenjs/compiler` runs for bundlers
 *     (`eliminateJsxFromFile`). Metro has no `unplugin-auto-import` phase, so
 *     leaving JSX for the bundler would compile it to
 *     `import { jsx } from 'react/jsx-runtime'`, which Metro then redirects to
 *     a runtime that no longer exists. Eliminating here means the module
 *     contains no JSX and no `react/jsx-runtime` import at all: every tag is
 *     the author's own PascalCase binding (`<View>` → `View({ … })`), which RN
 *     components already are.
 *
 *  2. **HMR injection** — Metro's HMR uses `module.hot.accept()` (webpack
 *     style), unlike Vite's `import.meta.hot.accept()`. This adds rasen's
 *     runtime calls (`enterHmrModule` / `exitHmrModule` from `@rasenjs/core`)
 *     plus `module.hot.accept()` to component files, mirroring what
 *     `rasenCompile` does for Vite.
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
 * Only files that call `com()` get the HMR wrapping, so plain utility modules
 * are left untouched; JSX elimination runs on every file (a module without JSX
 * is a no-op).
 */

import type { PluginObj, PluginPass } from '@babel/core'
import type * as BabelTypes from '@babel/types'
import { relative } from 'path'
import { eliminateJsxFromFile } from '@rasenjs/compiler'

export interface RasenRNBabelOptions {
  /** Enable HMR injection (default true). */
  hmr?: boolean
  /** Enable JSX elimination (default true). */
  jsx?: boolean
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
  const jsxEnabled = options.jsx !== false
  const root = options.root ?? process.cwd()

  return {
    name: 'rasen-rn',
    visitor: {
      Program: {
        // 1. JSX elimination runs on ENTER, before Babel descends into the
        //    nodes: the React Native preset is a *preset*, so its JSX
        //    transform would otherwise convert `jsx('View', …)` calls before
        //    we ever see them (presets run after plugins, but their visitors
        //    still fire during this same traversal). Converting the whole
        //    program here means no JSX node survives to be lowered into
        //    `react/jsx-runtime` — which Metro would redirect at nothing.
        enter(_path, state) {
          if (!jsxEnabled) return
          // The two packages resolve their own `@babel/types` copy (Metro
          // brings its own), so the AST types are structurally identical but
          // nominally different — cast at the boundary, not inside the pass.
          eliminateJsxFromFile(
            state.file.ast as Parameters<typeof eliminateJsxFromFile>[0],
            state.filename ?? '',
          )
        },
        // 2. HMR wrapping happens on EXIT, when the body is final.
        exit(path, state) {
          if (!hmrEnabled) return
          const code = state.file.code ?? ''
          // Only inject into component files that use com().
          if (!COM_CALL_RE.test(code)) return
          if (code.includes('enterHmrModule(')) return

          const filename = state.filename ?? ''
          const moduleId = relative(root, filename).replace(/\\/g, '/')

          // Insert the import + enterHmrModule call after the last import.
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

          // Append exitHmrModule() + module.hot.accept() at the end.
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
