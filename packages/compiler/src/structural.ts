/**
 * Structural JSX rewrite: `.map()` → `each`, `&&` / `?:` → `when`.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * A list built with `.map()` is a fresh batch of elements every time it runs.
 *
 * ```tsx
 * {rows.map((r) => <Row item={r} />)}
 * ```
 *
 * The array is rebuilt, every element in it is new, and nothing reconciles:
 * the host tears down what was there and mounts what arrived. No item is
 * reused and no node is moved. `each` diffs instead — `@rasenjs/core`'s `each`
 * holds a `WeakMap` from item to mounted instance and reorders the existing
 * nodes when the list changes.
 *
 * The same argument applies to conditionals. `cond && <Panel />` puts a
 * *value* in a child position, so the shape of the child list changes and the
 * host has to guess what moved. `when` owns a branch slot and destroys the
 * outgoing branch on switch.
 *
 * ```
 * {rows.map((r) => <Row item={r} />)}
 *   → each({ of: rows, children: (r) => <Row item={r} /> })
 *
 * {open && <Panel />}
 *   → when({ condition: () => open, then: () => <Panel /> })
 *
 * {ready ? <Stage /> : <Spinner />}
 *   → when({ condition: () => ready, then: () => <Stage />, else: () => <Spinner /> })
 * ```
 *
 * ── Opt-in, because it is not universally correct ─────────────────────────
 * The rewrite assumes a JSX runtime that *has* `each` and `when` (Rasen's
 * does) and an author who wants structural components. A React project
 * compiling through `@rasenjs/compiler` for some other reason must not have
 * its `.map()` calls rewritten — React has no `each`, and the output would not
 * render. So the pass is **off by default** and enabled with
 * `structural: true`, or by calling `transformStructural()` directly as the
 * bundle-free Perry example does.
 *
 * ── Deliberately narrow ───────────────────────────────────────────────────
 * Only the shapes where the transformation is provably equivalent:
 *
 *   * `LIST.map(fn)` in a child position, `fn` an arrow with an expression
 *     body returning a single JSX element or fragment.
 *   * `COND && <El />`, where the right side is JSX and the left side is not.
 *   * `COND ? <A /> : <B />` where both arms are JSX, and `COND ? <A /> : null`
 *     where the alternate is `null`/`undefined`/`false` — the `else` branch is
 *     then omitted and `when` renders nothing.
 *
 * Everything else is left exactly as written, and all of it still works: the
 * runtime accepts an array or a plain value in a child position. Notably
 * **not** rewritten:
 *
 *   * a `.map()` callback with a block body — `each` mounts the callback's
 *     return value, and a block body is not obliged to return one;
 *   * an expression in an attribute, `value={items.map(…)}` — that is a value
 *     the component consumes, not a child;
 *   * a ternary with one non-element arm (`cond ? <A /> : label`);
 *   * anything in a `.ts`/`.js` file — there is no JSX to rewrite.
 *
 * ── Reactive sources ──────────────────────────────────────────────────────
 * `each`'s `of` and `when`'s `condition` both resolve through `toValue`, so a
 * getter, a `Ref`, and a plain value all work. The rewrite passes the author's
 * expression through **unchanged** rather than wrapping it, because wrapping
 * `condition` would be actively wrong: `() => count() > 0` would become
 * `() => () => count() > 0`, and `toValue` would call it once and receive a
 * *function*, which is always truthy. Note that a list only re-diffs when `of`
 * is a getter or a `Ref`; `{rows().map(…)}` was already non-reactive before
 * the rewrite, so this pass does not change that either way — it is up to the
 * author to pass `of={() => rows()}`.
 *
 * ── Order relative to the other passes ────────────────────────────────────
 * Run this **first**. `transformJsxExpressions` wraps complex attribute
 * expressions in getters, and although `each`/`when` accept getters there is
 * no reason to make the emitted props harder to read. Static hoisting ignores
 * these subtrees anyway — `containsJsxOrArray` in `core.ts` returns null for
 * element-producing children and falls back to the factory chain, which is
 * exactly where this pass leaves its output.
 */

import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import typesModule from '@babel/types'
import generateModule from '@babel/generator'
import type * as BabelTypes from '@babel/types'

// @babel/{traverse,types,generator} are CJS with an ESM default — the same
// interop dance `jsx-transform.ts` and `core.ts` do.
/* eslint-disable @typescript-eslint/no-explicit-any */
const traverse: any = (traverseModule as any).default || traverseModule
const t: typeof BabelTypes = (typesModule as any).default || typesModule
const generate: any = (generateModule as any).default || generateModule
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface StructuralTransformOptions {
  /** Local name of the list component. Defaults to `each`. */
  eachName?: string
  /** Local name of the branch component. Defaults to `when`. */
  whenName?: string
  /** Module both are imported from. Defaults to `@rasenjs/core`. */
  source?: string
  /** Called for every rewrite, for logging and tests. */
  onRewrite?: (info: { kind: 'each' | 'when'; line: number }) => void
}

/** Identifiers `when` treats as "no branch". */
const NULLISH_IDENTIFIERS = new Set(['null', 'undefined', 'false'])

function isNullish(node: any): boolean {
  if (!node || typeof node.type !== 'string') return false
  if (node.type === 'NullLiteral') return true
  if (node.type === 'BooleanLiteral') return node.value === false
  if (node.type === 'Identifier') return NULLISH_IDENTIFIERS.has(node.name)
  return false
}

/** A JSX element or fragment — the only thing a branch can mount. */
function isJsx(node: any): boolean {
  return !!node && (node.type === 'JSXElement' || node.type === 'JSXFragment')
}

/**
 * True when the expression sits in a child position.
 *
 * Walks out only through parenthesis-like wrappers, so an expression nested in
 * an arrow function, a call argument, or an object property — none of which
 * are child positions — is rejected.
 *
 * The subtlety is that `JSXExpressionContainer` is used for BOTH attribute
 * values and children:
 *
 * ```tsx
 * <Box kind={expr} />   // attribute — expr is a prop the component consumes
 * <div>{expr}</div>     // child — expr is mounted
 * ```
 *
 * Only the second is a child position. Rewriting an attribute would hand the
 * component a Mountable where it expects an array (the `.map()` case) or a
 * boolean (the `&&` case), so the container's own parent decides.
 */
function isChildPosition(path: any): boolean {
  let current = path
  while (current?.parentPath) {
    const parent = current.parentPath
    const type = parent.node.type
    if (type === 'JSXExpressionContainer') {
      const holder = parent.parentPath?.node
      return (
        holder?.type === 'JSXElement' || holder?.type === 'JSXFragment'
      )
    }
    if (
      type === 'ParenthesizedExpression' ||
      type === 'TSAsExpression' ||
      type === 'TSNonNullExpression' ||
      type === 'TSSatisfiesExpression'
    ) {
      current = parent
      continue
    }
    return false
  }
  return false
}

/** `each({ of, children })` */
function buildEach(list: any, callback: any): any {
  return t.callExpression(t.identifier('each'), [
    t.objectExpression([
      t.objectProperty(t.identifier('of'), list),
      t.objectProperty(t.identifier('children'), callback),
    ]),
  ])
}

/** `when({ condition, then, else? })` */
function buildWhen(condition: any, thenBranch: any, elseBranch: any | null): any {
  const props: any[] = [
    t.objectProperty(
      t.identifier('condition'),
      t.arrowFunctionExpression([], condition)
    ),
    t.objectProperty(t.identifier('then'), t.arrowFunctionExpression([], thenBranch)),
  ]
  if (elseBranch) {
    props.push(
      t.objectProperty(t.identifier('else'), t.arrowFunctionExpression([], elseBranch))
    )
  }
  return t.callExpression(t.identifier('when'), [t.objectExpression(props)])
}

/**
 * Rewrite `.map()`, `&&`, and `?:` in child position into `each` / `when`.
 *
 * Returns the code unchanged when nothing matched or when it does not parse —
 * this never throws on user code, so a bundler can call it unconditionally.
 * When a rewrite happens and the module did not already import the component it
 * now calls, an import is inserted after the last existing import.
 */
export function transformStructural(
  code: string,
  options: StructuralTransformOptions = {}
): string {
  const eachName = options.eachName ?? 'each'
  const whenName = options.whenName ?? 'when'

  let ast: any
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    })
  } catch {
    return code
  }

  let importsEach = false
  let importsWhen = false
  // What the rewrite actually emitted a call to. Distinct from the imports:
  // a module may import `each` and never use it, or use `when` without having
  // imported it.
  let usedEach = false
  let usedWhen = false

  const note = (kind: 'each' | 'when', node: any): void => {
    if (kind === 'each') usedEach = true
    else usedWhen = true
    options.onRewrite?.({ kind, line: node.loc?.start.line ?? 0 })
  }

  traverse(ast, {
    Program(path: any) {
      for (const stmt of path.node.body) {
        if (stmt.type !== 'ImportDeclaration') continue
        for (const spec of stmt.specifiers) {
          if (spec.type !== 'ImportSpecifier') continue
          const imported = spec.imported?.name ?? spec.imported?.value
          if (imported === eachName) importsEach = true
          if (imported === whenName) importsWhen = true
        }
      }
    },

    // ── list.map(fn) → each({ of: list, children: fn }) ───────────────────
    CallExpression: {
      exit(path: any) {
        const node = path.node
        if (
          node.callee?.type !== 'MemberExpression' ||
          node.callee.computed ||
          node.callee.property?.name !== 'map'
        ) {
          return
        }
        if (node.arguments.length !== 1) return

        const cb = node.arguments[0]
        // An arrow with an expression body returning exactly one element. A
        // block body is skipped — see the header.
        if (cb.type !== 'ArrowFunctionExpression') return
        if (!isJsx(cb.body)) return

        if (!isChildPosition(path)) return

        // The replacement has an Identifier callee, so it cannot re-match.
        path.replaceWith(buildEach(node.callee.object, cb))
        note('each', node)
      },
    },

    // ── COND && <El /> → when({ condition: () => COND, then: () => <El /> })
    LogicalExpression: {
      exit(path: any) {
        const node = path.node
        if (node.operator !== '&&') return
        if (!isJsx(node.right)) return
        // `<A /> && <B />` makes no sense as a condition — leave it rather
        // than inventing a boolean out of an element.
        if (isJsx(node.left)) return
        if (!isChildPosition(path)) return

        path.replaceWith(buildWhen(node.left, node.right, null))
        note('when', node)
      },
    },

    // ── COND ? <A /> : <B /> → when({ …, then, else }) ────────────────────
    ConditionalExpression: {
      exit(path: any) {
        const node = path.node
        if (!isJsx(node.consequent)) return
        if (!isChildPosition(path)) return

        const altIsNullish = isNullish(node.alternate)
        // Either both arms are elements, or the alternate is nullish — in
        // which case `else` is omitted and `when` renders nothing.
        if (!altIsNullish && !isJsx(node.alternate)) return

        path.replaceWith(
          buildWhen(node.test, node.consequent, altIsNullish ? null : node.alternate)
        )
        note('when', node)
      },
    },
  })

  if (!usedEach && !usedWhen) return code

  const generated = generate(ast).code as string

  if ((usedEach && !importsEach) || (usedWhen && !importsWhen)) {
    const names: string[] = []
    if (usedEach && !importsEach) names.push(eachName)
    if (usedWhen && !importsWhen) names.push(whenName)
    const line = `import { ${names.join(', ')} } from ${JSON.stringify(
      options.source ?? '@rasenjs/core'
    )};`

    return insertImportLine(generated, line)
  }

  return generated
}

/** Matches a line that starts an import statement. */
const IMPORT_LINE_RE = /^import\s/

/**
 * Insert an import line after the last existing import, or at the top.
 *
 * Text-based on purpose — the same approach `injectHmr` takes. Adding the node
 * to the AST instead was tried and produced correct-looking code that was
 * actually wrong: the new import landed *between* a declaration's JSDoc and the
 * declaration, because Babel attaches comments to nodes by source position and
 * a freshly created node has none. By the time the code is generated, comments
 * are already in their final places, so splicing a line in cannot move them.
 *
 * With no imports at all the line goes at the very top, after any directive
 * prologue (`'use strict'`) so that stays first.
 */
function insertImportLine(code: string, line: string): string {
  const lines = code.split('\n')

  let lastImport = -1
  for (let i = 0; i < lines.length; i++) {
    // An import may be multi-line (`import {\n  a\n} from 'x'`); only the
    // opening line has to match, and the opening line is what we key on.
    if (IMPORT_LINE_RE.test(lines[i])) lastImport = i
  }

  if (lastImport >= 0) {
    lines.splice(lastImport + 1, 0, line)
    return lines.join('\n')
  }

  // No imports: skip a directive prologue so `'use strict'` stays first.
  let at = 0
  while (at < lines.length && /^\s*['"]use /.test(lines[at])) at++
  lines.splice(at, 0, line)
  return lines.join('\n')
}
