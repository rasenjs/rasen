/**
 * Compile-time JSX attribute expression classification.
 *
 * For JSX attribute `a={expr}`:
 *  - literal (string/number/boolean/null/bigint)  -> skip (static, zero cost)
 *  - identifier                                   -> skip (pass-through, runtime decides)
 *  - object/array literal                         -> skip (component handles via watchObjectProps)
 *  - existing function / JSX element              -> skip (never double-wrap)
 *  - everything else (binary/call/member/cond/...) -> wrap in `() => expr` (reactive)
 *
 * Children `{expr}` are NOT transformed (handled by processChildren at runtime).
 *
 * Uses @babel/parser + @babel/traverse with surgical string insertion (no codegen),
 * so all other formatting is preserved.
 */
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'

// @babel/traverse ESM/CJS interop: default export may be the fn or { default: fn }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse: any = (traverseModule as any).default || traverseModule

const LITERAL_TYPES = new Set([
  'StringLiteral',
  'NumericLiteral',
  'BooleanLiteral',
  'NullLiteral',
  'BigIntLiteral',
])

const SKIP_TYPES = new Set([
  'Identifier',
  'ObjectExpression',
  'ArrayExpression',
  // already functions — never double-wrap
  'ArrowFunctionExpression',
  'FunctionExpression',
  // JSX element/fragment as a prop value is a Mountable, not a value
  'JSXElement',
  'JSXFragment',
])

// Special props handled by the JSX runtime / host components — never wrap:
//  - children: processed by processChildren (expects array/ref/getter of Mountables)
//  - ref:      element reference (must stay a Ref)
//  - key:      handled by jsx()
const SPECIAL_ATTRS = new Set(['children', 'ref', 'key'])

function shouldWrap(expr: { type: string; expressions?: unknown[] }): boolean {
  if (LITERAL_TYPES.has(expr.type)) return false
  if (SKIP_TYPES.has(expr.type)) return false
  // TemplateLiteral without expressions is effectively a static string
  if (expr.type === 'TemplateLiteral' && expr.expressions && expr.expressions.length === 0) {
    return false
  }
  return true
}

/**
 * Transform JSX attribute expressions: wrap complex expressions in `() => expr`.
 * Returns the original code unchanged if parsing fails.
 */
export function transformJsxExpressions(code: string): string {
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch {
    return code
  }

  const edits: { start: number; text: string }[] = []
  traverse(ast, {
    JSXAttribute(path: any) {
      // skip special props (children/ref/key) — handled by JSX runtime / host
      const attrName = path.node.name?.name
      if (typeof attrName === 'string' && SPECIAL_ATTRS.has(attrName)) return

      const value = path.node.value
      if (!value || value.type !== 'JSXExpressionContainer') return
      const expr = value.expression
      if (!shouldWrap(expr)) return
      edits.push({ start: expr.start, text: '() => ' })
    },
  })

  if (edits.length === 0) return code

  // apply from end to start so offsets stay valid
  edits.sort((a, b) => b.start - a.start)
  for (const e of edits) {
    code = code.slice(0, e.start) + e.text + code.slice(e.start)
  }
  return code
}
