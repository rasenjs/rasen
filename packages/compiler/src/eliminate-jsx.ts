/**
 * Full JSX elimination — the last pass that may see JSX.
 *
 * Every remaining JSX node becomes a BARE factory call: `div({...})`,
 * `Foo({...})`, `Fragment({...})`, with an inline
 * `[…].flat(Infinity).filter(…)` around any dynamic children run. The emitted
 * module contains no JSX, so the bundler's own JSX transform never runs — and
 * this pass emits no imports for those names either. Which module a tag comes
 * from is binding configuration: each host ships its tag names as data
 * (`DOM_TAGS` from `@rasenjs/dom`) and the app lists them — plus its own
 * components — in `unplugin-auto-import`'s `imports` map (recipe:
 * www/guide/advanced/jsx). The compiler owns only the part it can see:
 * turning tag tokens into identifiers.
 * The hoisting helpers (`template`, `renderText`, …) remain compiler-injected:
 * they never appear in the author's source and are internal to compiled
 * output.
 *
 * What this pass still enforces, because only it can see the JSX:
 *
 * - **children** — flattened at every depth, `null`/`undefined`/booleans
 *   dropped, text and refs kept: core's `normalizeChildren` rule, inlined at
 *   emission so no helper name needs binding; static text runs stay a plain
 *   array.
 * - **`className`** is spelled `class`; `key`/`ref` stay ordinary props —
 *   what the removed `jsx()` used to normalize.
 * - **uncallable tags** — a name that cannot be an identifier (`<my-widget>`,
 *   a reserved word like `<var>`) is a build error: there is nothing to bind.
 *   Wrap it in a PascalCase component.
 * - **shadowed tags** — an emitted name bound to a LOCAL variable at the call
 *   site is a build error: the call would silently run the local. A module
 *   `import` of the same name is fine and wins over the auto-import, which
 *   skips already-imported names.
 *
 * Order inside the plugin is fixed (see `unplugin.ts`): structural →
 * hoisting → attribute getters → this pass. The getter pass edits JSX
 * attribute syntax in the source, so it must run while JSX still exists;
 * hoisting must see the author's raw expressions, so it runs first.
 * `rasenCompile` is `enforce: 'pre'` and `unplugin-auto-import` runs in a
 * later phase, so the binding pass always sees this output (verified against
 * the real plugin when the recipe was written).
 *
 * Nodes convert bottom-up (`exit` visitors): a child element is already a
 * call by the time its parent builds the children array, so nested JSX embeds
 * as ordinary expressions and nothing needs a second pass.
 */
import { parse } from '@babel/parser'
// eslint-disable-next-line import/order
import traverseModule from '@babel/traverse'
// eslint-disable-next-line import/order
import generatorModule from '@babel/generator'
// eslint-disable-next-line import/order
import * as t from '@babel/types'
import { normalizeJsxText } from './core'

// @babel/traverse / generator ESM-CJS interop (same shape as core.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse: any = (traverseModule as any).default || traverseModule
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generate: any = (generatorModule as any).default || generatorModule

/** HTML keywords that are tags but never valid call callees (`<var>`). */
const RESERVED = new Set([
  'var', 'class', 'const', 'let', 'function', 'return', 'new', 'delete',
  'typeof', 'void', 'this', 'import', 'export', 'default', 'in', 'of', 'for',
  'while', 'if', 'else', 'switch', 'case', 'do', 'try', 'catch', 'throw',
  'debugger', 'with', 'yield', 'await', 'enum', 'super', 'extends',
])

/** `className` is `class` to the host — the rename `jsx()` used to apply. */
const propName = (name: string): string => (name === 'className' ? 'class' : name)

/** Object keys print unquoted when they are identifiers; anything else quotes. */
const objectKey = (name: string): t.Identifier | t.StringLiteral =>
  /^[$A-Z_a-z][\w$]*$/.test(name) ? t.identifier(name) : t.stringLiteral(name)

/** `<Foo.Bar/>` → the equivalent member callee. */
function memberCallee(node: any): t.Expression {
  if (node.type === 'JSXIdentifier') return t.identifier(node.name)
  return t.memberExpression(memberCallee(node.object), t.identifier(node.property.name))
}

/**
 * Eliminate every JSX node in the module.
 *
 * Returns the new source, or null when the file contains no JSX (or cannot be
 * parsed — the caller's other passes then decide what to do). Throws on a tag
 * the emitted call could not honour (uncallable or locally shadowed), so the
 * plugin reports the offending module instead of shipping code that renders
 * the wrong thing.
 */
export function eliminateJsx(code: string, filename: string): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ast: any
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      sourceFilename: filename,
    })
  } catch {
    return null
  }

  const jsxCount = eliminateJsxFromFile(ast, filename)
  if (jsxCount === 0) return null
  return generate(ast, { sourceMaps: false }).code
}

/**
 * Eliminate every JSX node in an already-parsed Babel file.
 *
 * Split out of `eliminateJsx` so a Babel pipeline (Metro / React Native) can
 * run the same pass on the file it is already transforming — parsing a second
 * copy of the source is wasteful and, worse, would let the two ASTs drift.
 *
 * Returns the number of JSX nodes converted; `0` means the module had none and
 * the caller should leave it untouched. Throws the same build errors as the
 * string entry point (uncallable or locally shadowed tags).
 */
export function eliminateJsxFromFile(file: t.File, filename: string): number {
  /**
   * The emitted call resolves `name` through normal scope rules: it must be a
   * legal call name and free at this site (or imported — an explicit import
   * wins, which is also what `unimport` does with names it would inject).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assertCallable = (path: any, name: string): void => {
    if (!/^[$A-Z_a-z][\w$]*$/.test(name) || RESERVED.has(name)) {
      throw new Error(
        `[rasen-compiler] <${name}> in ${filename} cannot be a call — a tag ` +
          `that is not a valid identifier needs a PascalCase component wrapper ` +
          `(nothing could auto-import it).`
      )
    }
    const binding = path.scope.getBinding(name)
    if (!binding) return // free — the app's auto-import supplies it
    if (binding.path.findParent((p: any) => p.isImportDeclaration())) return
    throw new Error(
      `[rasen-compiler] '${name}' used by the JSX in ${filename} resolves to ` +
        `a local binding, but a Rasen tag must resolve to its import — ` +
        `rename the local '${name}'.`
    )
  }

  let jsxCount = 0

  /** Build the props object: spreads in order, `children` last (it wins). */
  const buildProps = (
    attributes: any[],
    children: any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): t.ObjectExpression => {
    const props: Array<t.ObjectProperty | t.SpreadElement> = []
    for (const attr of attributes) {
      if (attr.type === 'JSXSpreadAttribute') {
        props.push(t.spreadElement(attr.argument))
        continue
      }
      if (attr.type !== 'JSXAttribute') continue
      if (attr.name.type === 'JSXNamespacedName') {
        throw new Error(
          `[rasen-compiler] namespaced JSX attribute in ${filename} is not supported: ` +
            `${attr.name.namespace.name}:${attr.name.name.name}`
        )
      }
      const key = objectKey(propName(attr.name.name))
      const value = attr.value
      let expr: t.Expression
      if (value == null) {
        expr = t.booleanLiteral(true)
      } else if (value.type === 'StringLiteral') {
        expr = t.stringLiteral(value.value)
      } else if (value.type === 'JSXExpressionContainer') {
        expr =
          value.expression.type === 'JSXEmptyExpression'
            ? t.booleanLiteral(true)
            : (value.expression as t.Expression)
      } else {
        // JSXElement / JSXFragment as an attribute value — already converted
        // by the time this node is exited (children exit first).
        expr = value as t.Expression
      }
      props.push(t.objectProperty(key, expr))
    }

    const childExprs: Array<t.Expression | t.SpreadElement> = []
    let dynamic = false
    for (const c of children) {
      if (c.type === 'JSXText') {
        const raw = normalizeJsxText(c)
        if (raw !== null) childExprs.push(t.stringLiteral(raw))
        continue
      }
      if (c.type === 'JSXExpressionContainer') {
        if (c.expression.type === 'JSXEmptyExpression') continue
        childExprs.push(c.expression as t.Expression)
        dynamic = true
        continue
      }
      if (c.type === 'JSXSpreadChild') {
        childExprs.push(t.spreadElement(c.expression))
        dynamic = true
        continue
      }
      childExprs.push(c as t.Expression)
      dynamic = true
    }
    if (childExprs.length > 0) {
      let value: t.Expression = t.arrayExpression(childExprs as t.Expression[])
      if (dynamic) {
        // core's normalizeChildren rule, inlined so no helper name needs
        // binding: flatten every nesting depth, drop nullish/booleans;
        // text, refs and getters ride through to the factory unchanged.
        value = t.callExpression(t.memberExpression(value, t.identifier('flat')), [
          t.numericLiteral(Infinity),
        ])
        value = t.callExpression(
          t.memberExpression(value, t.identifier('filter')),
          [
            t.arrowFunctionExpression(
              [t.identifier('c')],
              t.logicalExpression(
                '&&',
                t.binaryExpression('!=', t.identifier('c'), t.nullLiteral()),
                t.binaryExpression(
                  '!=',
                  t.unaryExpression('typeof', t.identifier('c')),
                  t.stringLiteral('boolean')
                )
              )
            ),
          ]
        )
      }
      props.push(t.objectProperty(t.identifier('children'), value))
    }
    return t.objectExpression(props)
  }

  traverse(file, {
    JSXElement: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exit(path: any) {
        jsxCount++
        const node = path.node
        const nameNode = node.openingElement.name
        let callee: t.Expression
        if (nameNode.type === 'JSXIdentifier') {
          // PascalCase is the author's own binding — tsc enforces that one.
          if (/^[a-z]/.test(nameNode.name)) assertCallable(path, nameNode.name)
          callee = t.identifier(nameNode.name)
        } else if (nameNode.type === 'JSXMemberExpression') {
          callee = memberCallee(nameNode)
        } else {
          throw new Error(`[rasen-compiler] unsupported JSX tag name in ${filename}`)
        }
        path.replaceWith(
          t.callExpression(callee, [buildProps(node.openingElement.attributes, node.children)])
        )
      },
    },
    JSXFragment: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exit(path: any) {
        jsxCount++
        assertCallable(path, 'Fragment')
        path.replaceWith(
          t.callExpression(t.identifier('Fragment'), [buildProps([], path.node.children)])
        )
      },
    },
  })

  // The caller generates the output: the string entry point (this module's
  // `eliminateJsx`) or a Babel pipeline reusing its own AST (RN / Metro).
  return jsxCount
}
