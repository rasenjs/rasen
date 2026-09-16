/**
 * HMR injection — bundler-agnostic.
 *
 * Injects `enterHmrModule/exitHmrModule` around a module that uses `com()`.
 * Per plan A, this only handles Rasen's own HMR bookkeeping; the actual
 * hot-accept (`import.meta.hot.accept()` / `module.hot.accept()`) is left to
 * the bundler's own HMR mechanism, so this stays free of any bundler API.
 */

const IMPORT_LINE_RE = /^import\s+/m
const COM_CALL_RE = /\bcom\s*\(/

/** True when the module uses `com()` (candidate for HMR wrapping). */
export function usesCom(code: string): boolean {
  return COM_CALL_RE.test(code)
}

/** True when the module already has Rasen HMR wrapping injected. */
export function hasHmrWrapping(code: string): boolean {
  return code.includes('enterHmrModule(')
}

/**
 * Wrap a module with enterHmrModule/exitHmrModule. `moduleId` is a stable
 * per-module identifier (e.g. path relative to project root).
 */
export function injectHmr(code: string, moduleId: string): string {
  // Insert after the last import line so the wrapper runs after all imports
  // are hoisted (matches the previous vite-plugin behavior).
  const lines = code.split('\n')
  let lastImport = -1
  for (let i = 0; i < lines.length; i++) {
    if (IMPORT_LINE_RE.test(lines[i])) lastImport = i
  }
  let pos = 0
  for (let i = 0; i <= lastImport; i++) pos += lines[i].length + 1

  const before = code.slice(0, pos)
  const after = code.slice(pos)

  return (
    before +
    `import { enterHmrModule, exitHmrModule } from '@rasenjs/core';\n` +
    `enterHmrModule('${moduleId}');\n\n` +
    after +
    `\n\nexitHmrModule();\n/* rasen-hmr */`
  )
}