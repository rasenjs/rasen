/**
 * HMR injection — bundler-agnostic.
 *
 * Injects `enterHmrModule/exitHmrModule` around a module that uses `com()`.
 * Per plan A, this only handles Rasen's own HMR bookkeeping; the actual
 * hot-accept (`import.meta.hot.accept()` / `module.hot.accept()`) is left to
 * the bundler's own HMR mechanism, so this stays free of any bundler API.
 */

const COM_CALL_RE = /\bcom\s*\(/

/**
 * Comments and string literals are not code: a `com()` mention in a doc
 * comment (`/** 组件作用域：com() 用它… *\/`) must not make the module an HMR
 * wrapping candidate.
 */
function stripNonCode(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

/** True when the module uses `com()` (candidate for HMR wrapping). */
export function usesCom(code: string): boolean {
  return COM_CALL_RE.test(stripNonCode(code))
}

/** True when the module already has Rasen HMR wrapping injected. */
export function hasHmrWrapping(code: string): boolean {
  return code.includes('enterHmrModule(')
}

/** Brace delta of a line (import statements never embed braces in strings). */
function braceDelta(line: string): number {
  let d = 0
  for (const ch of line) d += ch === '{' ? 1 : ch === '}' ? -1 : 0
  return d
}

/**
 * Wrap a module with enterHmrModule/exitHmrModule. `moduleId` is a stable
 * per-module identifier (e.g. path relative to project root).
 */
export function injectHmr(code: string, moduleId: string): string {
  // Insert after the last import STATEMENT so the wrapper runs after all
  // imports are hoisted (matches the previous vite-plugin behavior). Import
  // statements can span lines (`import {` … `} from '…'`), so the position is
  // the closing line of the last statement, not the last line that merely
  // STARTS with `import` — inserting mid-statement is a syntax error.
  const lines = code.split('\n')
  let lastImportEnd = -1
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (depth > 0) {
      depth += braceDelta(line)
      if (depth <= 0) lastImportEnd = i
    } else if (/^import[\s{]/.test(line)) {
      depth = braceDelta(line)
      lastImportEnd = i
    } else if (lastImportEnd >= 0 && line.trim() !== '') {
      break // first non-import, non-blank line: the import block has ended
    }
  }
  let pos = 0
  for (let i = 0; i <= lastImportEnd; i++) pos += lines[i].length + 1

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