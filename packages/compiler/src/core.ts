/**
 * Rasen JSX static-hoisting compiler — AST-native core.
 *
 * Pipeline: @babel/parser → @babel/traverse (replaceWith real AST nodes)
 * → @babel/generator (with source maps). No user-code string slicing:
 * every emitted statement passes through parse→AST→generate.
 *
 * Scope (MVP):
 *  - lowercase host elements, literal attrs baked into template HTML
 *  - dynamic {expr} text children → placeholder + bindText
 *  - class/style/value/checked/…={expr} → specialized bind* helpers
 *  - onClick…={h} → on()
 *  - ref={r} → setValue(r, el)
 *  - nested host elements recurse with deeper navigation paths
 *
 * Fallback (element left as-is for the bundler's jsx runtime):
 *  - uppercase components, fragments, spread attributes/children,
 *    mixed content beyond the rules above, dynamic tags
 */

import { parse } from '@babel/parser'
// eslint-disable-next-line import/order
import traverseModule from '@babel/traverse'
// eslint-disable-next-line import/order
import generatorModule from '@babel/generator'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generate: any = (generatorModule as any).default || generatorModule
import * as BabelTypes from '@babel/types'

// @babel/traverse ESM/CJS interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse: any = (traverseModule as any).default || traverseModule

export const COMPILE_DIRECTIVE = '@rasen-compile'

export interface CompilerOptions {
  /** Import path for runtime primitives (default: '@rasenjs/dom/template') */
  templateSource?: string
}

interface GenContext {
  types: typeof BabelTypes
  counter: number
  templates: { name: string; html: string }[]
  helpers: Set<string>
  /** import source for runtime primitives */
  templateSource: string
  /** extra import: setValue comes from '@rasenjs/core' */
  needsCoreSetValue: boolean
  /** navigation statements hoisted to the component-root scope */
  navStatements: string[]
  /** wiring statements (offs.push(...)) hoisted likewise */
  wireStatements: string[]

  /** SSR emission parts for the current component: literal HTML chunks and
   *  ${...} interpolation expressions, joined into one template literal. */
  ssrParts: string[]
  /** original source, for slicing user expression text */
  source: string
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Escape a static chunk so it is safe inside a generated template literal
 *  (backslash, backtick and ${ sequences would otherwise alter meaning). */
function escapeTemplateLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

/** SSR rendering of a dynamic attribute value following bindAttr semantics:
 *  false/null/undefined removes the attribute; true sets it empty. Emits an
 *  expression that evaluates to ` name="value"` or ''. */
function ssrAttrExpr(name: string, exprSrc: string): string {
  return (
    '${((v) => (v == null || v === false ? \'\' : ` ' +
    name +
    '="${escapeAttr(v === true ? \'\' : String(v))}"`))(' +
    exprSrc +
    ')}'
  )
}

/** SSR rendering of a dynamic DOM property following bindProp semantics:
 *  booleans render as bare attribute presence; others as name="value". */
function ssrPropExpr(name: string, exprSrc: string): string {
  if (
    name === 'checked' ||
    name === 'hidden' ||
    name === 'disabled' ||
    name === 'multiple'
  ) {
    // Boolean-attribute semantics: presence = true
    return `\${((v) => (v ? ' ${name}' : ''))(${exprSrc})}`
  }
  if (name === 'readOnly') {
    // DOM property with a lowercase attribute spelling
    return `\${((v) => (v ? ' readonly' : ''))(${exprSrc})}`
  }
  // indeterminate has no attribute serialization — skip on the server
  // value-like properties serialize as attributes on the server
  return ssrAttrExpr(name, exprSrc)
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function jsxTextToHtml(node: BabelTypes.JSXText): string | null {
  const raw = node.value
  if (!/\S/.test(raw)) return null // whitespace-only between tags → dropped
  return escapeHtml(raw.trim())
}

/** Parse a snippet and return its single expression AST node. */
function parseExpression(src: string): BabelTypes.Expression {
  const ast = parse(`(${src})`, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  })
  const stmt = ast.program.body[0]
  if (stmt?.type !== 'ExpressionStatement') {
    throw new Error(`[rasen-compiler] snippet is not an expression: ${src}`)
  }
  return stmt.expression
}

/** Parse a snippet and return its statements. */
function parseStatements(src: string): BabelTypes.Statement[] {
  const ast = parse(src, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  })
  return ast.program.body
}

const TAG_SPECIFIC_PROPERTIES: Record<string, Set<string>> = {
  input: new Set(['value', 'checked', 'indeterminate']),
  textarea: new Set(['value']),
  select: new Set(['value', 'selectedIndex']),
  option: new Set(['selected']),
}
const COMMON_DOM_PROPERTIES = new Set([
  'disabled',
  'readOnly',
  'multiple',
  'hidden',
])

function isDOMProperty(tag: string, key: string): boolean {
  const tagProps = TAG_SPECIFIC_PROPERTIES[tag.toLowerCase()]
  return tagProps?.has(key) ?? COMMON_DOM_PROPERTIES.has(key)
}

/** True when the expression can never be plain text: it contains a nested
 *  JSX element (logical/conditional/map chains producing elements) or is an
 *  array. Those must fall back to the factory path — String()-ing them
 *  would render '[object Object]'. */
function containsJsxOrArray(node: any): boolean {
  if (!node || typeof node.type !== 'string') return false
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return true
  if (node.type === 'ArrayExpression') return true
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    const v = (node as any)[key]
    if (Array.isArray(v) && v.some(containsJsxOrArray)) return true
    if (v && typeof v === 'object' && typeof v.type === 'string') {
      if (containsJsxOrArray(v)) return true
    }
  }
  return false
}

/**
 * Compile one JSX element subtree.
 *
 * Returns the serialized HTML for this subtree; navigation statements and
 * wiring statements are PUSHED onto the shared ctx arrays (hoisted to the
 * component-root scope). Nested host elements recurse with deeper paths;
 * their static parts bake into html and their dynamics hoist here too.
 *
 * Returns null when any part requires runtime fallback.
 */
function compileElement(
  node: BabelTypes.JSXElement,
  ctx: GenContext,
  rootVar: string,
  pathSoFar: number[]
): string | null {
  if (node.openingElement.name.type !== 'JSXIdentifier') return null
  const tag = node.openingElement.name.name
  if (!/^[a-z][a-zA-Z0-9-]*$/.test(tag)) return null // component → fallback

  let html = `<${tag}`
  ctx.ssrParts.push(escapeTemplateLiteral(`<${tag}`))

  function selfRef(): string {
    if (pathSoFar.length === 0) return rootVar
    ctx.helpers.add('child')
    let cur = rootVar
    for (const idx of pathSoFar) {
      const v = `_n${ctx.counter++}`
      ctx.navStatements.push(`const ${v} = child(${cur}, ${idx})`)
      cur = v
    }
    return cur
  }

  // ── attributes ──────────────────────────────────────────────────────
  for (const attr of node.openingElement.attributes) {
    if (attr.type !== 'JSXAttribute') return null // spread → fallback
    const name =
      attr.name.type === 'JSXIdentifier' ? attr.name.name : null
    if (!name) return null

    const value = attr.value
    if (value === null || value === undefined) {
      html += ` ${name}`
      ctx.ssrParts.push(escapeTemplateLiteral(` ${name}`))
      continue
    }
    if (value.type === 'StringLiteral') {
      const chunk = ` ${name}="${escapeAttr(value.value)}"`
      html += chunk
      ctx.ssrParts.push(escapeTemplateLiteral(chunk))
      continue
    }
    if (value.type !== 'JSXExpressionContainer') return null
    const expr = value.expression
    if (expr.type === 'JSXEmptyExpression') return null

    const exprAst = expr as BabelTypes.Expression
    const self = pathSoFar.length === 0 ? rootVar : selfRef()
    const exprSrc = exprSrcOf(exprAst)

    if (name === 'class' || name === 'className') {
      // Fast path: `cond ? 'cls' : ''` → boolean classList.toggle.
      // Skips String conversion and full className serialization per trigger
      // (the dominant cost of select-style interactions on large lists).
      if (
        exprAst.type === 'ConditionalExpression' &&
        exprAst.consequent.type === 'StringLiteral' &&
        exprAst.consequent.value !== '' &&
        exprAst.alternate.type === 'StringLiteral' &&
        exprAst.alternate.value === ''
      ) {
        const cls = exprAst.consequent.value
        const testSrc = ctx.source.slice(exprAst.test.start!, exprAst.test.end!)
        ctx.wireStatements.push(
          `offs.push(bindClassToggle(${self}, () => (${testSrc}), ${JSON.stringify(cls)}))`
        )
        ctx.helpers.add('bindClassToggle')
        // SSR: condition unknown at build time; emit the truthy branch's class
        // (compile-time escaped, same as static StringLiteral attributes)
        ctx.ssrParts.push(
          escapeTemplateLiteral(` class="${escapeAttr(cls)}"`)
        )
        continue
      }
      ctx.wireStatements.push(
        `offs.push(bindClass(${self}, () => (${exprSrcOf(exprAst)})))`
      )
      ctx.helpers.add('bindClass')
      // SSR: class evaluates once; empty string renders as class="" (harmless,
      // matches bindClass's initial write of '')
      ctx.ssrParts.push(` class="\${escapeAttr(String(${exprSrc}))}"`)
      ctx.helpers.add('escapeAttr')
      continue
    }
    if (name === 'style') {
      ctx.wireStatements.push(
        `offs.push(bindStyle(${self}, () => (${exprSrcOf(exprAst)})))`
      )
      ctx.helpers.add('bindStyle')
      // SSR: single evaluation via IIFE (expressions must not run twice);
      // strings pass through, objects serialize camelCase → kebab-case.
      ctx.ssrParts.push(
        ` style="\${escapeAttr((s => typeof s === 'string' ? s : Object.entries(s).map(([k, v]) => k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase() + ':' + v).join(';'))(${exprSrc}))}"`
      )
      ctx.helpers.add('escapeAttr')
      continue
    }
    if (/^on[A-Z]/.test(name)) {
      const event = name.slice(2).toLowerCase()
      ctx.wireStatements.push(
        `offs.push(on(${self}, '${event}', ${exprSrcOf(exprAst)}))`
      )
      ctx.helpers.add('on')
      // SSR: events are not serialized
      continue
    }
    if (name === 'ref') {
      ctx.wireStatements.push(`setValue(${self}, ${exprSrcOf(exprAst)})`)
      ctx.needsCoreSetValue = true
      // SSR: refs are client-only
      continue
    }
    if (name === 'key' || name === 'children') continue
    if (name === 'innerHTML' || name === 'dangerouslySetInnerHTML' || name === 'textContent') {
      return null // raw-HTML/text props → factory path (explicit, not silent)
    }

    if (isDOMProperty(tag, name)) {
      ctx.wireStatements.push(
        `offs.push(bindProp(${self}, '${name}', () => (${exprSrcOf(exprAst)})))`
      )
      ctx.helpers.add('bindProp')
      ctx.ssrParts.push(ssrPropExpr(name, exprSrc))
    } else {
      ctx.wireStatements.push(
        `offs.push(bindAttr(${self}, '${name}', () => (${exprSrcOf(exprAst)})))`
      )
      ctx.helpers.add('bindAttr')
      ctx.ssrParts.push(ssrAttrExpr(name, exprSrc))
    }
  }

  html += '>'
  ctx.ssrParts.push('>')

  // ── children ────────────────────────────────────────────────────────
  let childIndex = 0
  for (const c of node.children) {
    if (c.type === 'JSXText') {
      const h = jsxTextToHtml(c)
      if (h !== null) {
        html += h
        ctx.ssrParts.push(escapeTemplateLiteral(h))
        childIndex++
      }
      continue
    }
    if (c.type === 'JSXExpressionContainer') {
      if (c.expression.type === 'JSXEmptyExpression') continue
      // Element-producing expressions (cond && <span/>, list.map(...), …)
      // are not text — fall back to the factory chain for this subtree.
      if (containsJsxOrArray(c.expression)) return null
      // dynamic text placeholder at current childIndex
      html += ' '
      const holder = selfRef()
      const x = `_x${ctx.counter++}`
      ctx.helpers.add('child')
      ctx.navStatements.push(`const ${x} = child(${holder}, ${childIndex})`)
      const exprSrc = ctx.source.slice(c.expression.start!, c.expression.end!)
      // React-style text filtering: null/undefined/booleans render as ''
      ctx.wireStatements.push(
        `offs.push(bindText(${x}, () => renderText(${exprSrc})))`
      )
      ctx.helpers.add('renderText')
      ctx.helpers.add('bindText')
      // SSR: real text replaces the placeholder positionally; escaped like
      // the html package's text serialization so hydration aligns.
      // Empty text must still occupy a childNode slot on the server (the
      // client template has a placeholder text node there) — emit a comment
      // as the stand-in, otherwise navigation indices shift.
      ctx.ssrParts.push(
        `\${escapeHtml(renderText(${exprSrc})) || '<!-- -->'}`
      )
      ctx.helpers.add('escapeHtml')
      childIndex++
      continue
    }
    if (c.type === 'JSXElement') {
      // Component child (PascalCase tag) → slot anchor + runtime mount.
      // Attributes must be plain JSXAttributes with simple expressions
      // (no spreads); children of components are not supported yet.
      const nameNode = c.openingElement.name
      const isComponent =
        nameNode.type === 'JSXIdentifier' && /^[A-Z]/.test(nameNode.name)
      if (isComponent) {
        let propsSrc = ''
        let ok = true
        for (const attr of c.openingElement.attributes) {
          if (attr.type !== 'JSXAttribute') { ok = false; break }
          if (attr.name.type !== 'JSXIdentifier') { ok = false; break }
          const v = attr.value
          if (v === null || v === undefined) {
            propsSrc += `${attr.name.name}: true, `
          } else if (v.type === 'StringLiteral') {
            propsSrc += `${attr.name.name}: ${JSON.stringify(v.value)}, `
          } else if (
            v.type === 'JSXExpressionContainer' &&
            v.expression.type !== 'JSXEmptyExpression'
          ) {
            propsSrc += `${attr.name.name}: ${ctx.source.slice(v.expression.start!, v.expression.end!)}, `
          } else {
            ok = false
            break
          }
        }
        if (!ok || c.children.some((k: any) => k.type !== 'JSXText' || /\S/.test(k.value ?? ''))) {
          return null // spread / complex component usage → fallback
        }

        // Anchor comment occupies one childNode slot → indices stay stable
        const anchorChunk = '<!--rasen-slot-->'
        html += anchorChunk
        // Markers are positional literals here (symmetric with the template
        // anchor); ssrSlot only collects the child's HTML between them.
        ctx.ssrParts.push(anchorChunk)
        ctx.ssrParts.push(
          `\${collectHtml(${nameNode.name}({ ${propsSrc.trim()} }))}`
        )
        ctx.ssrParts.push('<!--/rasen-slot-->')
        ctx.helpers.add('collectHtml')

        const holder = pathSoFar.length === 0 ? rootVar : selfRef()
        const s = `_s${ctx.counter++}`
        ctx.helpers.add('child')
        ctx.helpers.add('mountSlot')
        // Slot content is dynamic — the mounted region's node set changes at
        // runtime, so node-pair bounds would go stale. Disqualifies the
        // template from the static-region (marker-free) fast path.
        ctx.navStatements.push(`const ${s} = child(${holder}, ${childIndex})`)
        ctx.wireStatements.push(
          `offs.push(mountSlot(${s}, ${nameNode.name}({ ${propsSrc.trim()} })))`
        )
        childIndex++
        continue
      }
      const inner = compileElement(
        c,
        ctx,
        rootVar,
        [...pathSoFar, childIndex]
      )
      if (inner === null) return null
      html += inner
      // inner's SSR chunks were pushed onto ctx.ssrParts by the recursion
      childIndex++
      continue
    }
    return null // fragment / spread child → fallback
  }

  const closing = `</${tag}>`
  html += closing
  ctx.ssrParts.push(closing)
  return html
}

function exprSrcOf(ast: any): string {
  return generate(ast).code
}

/**
 * Transform a program AST in place. Returns stats, or null when the file
 * lacks the compile directive or contains nothing compilable.
 */
export function transformProgram(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ast: any,
  source: string,
  options: CompilerOptions & { filename?: string } = {}
): { compiled: number; fellBack: number } | null {
  if (!source.includes(COMPILE_DIRECTIVE)) return null

  const ctx: GenContext & {
    navStatements: string[]
    wireStatements: string[]
    ssrParts: string[]
    source: string
  } = {
    types: BabelTypes,
    counter: 0,
    templates: [],
    helpers: new Set(['template']),
    templateSource: options.templateSource ?? '@rasenjs/dom/template',
    needsCoreSetValue: false,
    navStatements: [],
    wireStatements: [],
    ssrParts: [],
    source,
  }

  let compiled = 0
  let fellBack = 0

  traverse(
    ast,
  {
    JSXElement(path: any) {
      // outermost only: skip when nested inside another element or fragment
      if (
        path.findParent(
          (p: any) => p.isJSXElement() || p.isJSXFragment()
        )
      ) {
        return
      }

      const rootVar = `_r${ctx.counter++}`
      const html = compileElement(path.node, ctx, rootVar, [])
      if (html === null) {
        fellBack++
        return // leave original jsx() call intact
      }

      compiled++

      const tplName = `t${ctx.counter++}`
      ctx.templates.push({ name: tplName, html })

      const navBlock = ctx.navStatements.join('\n  ')
      const wireBlock = ctx.wireStatements.join('\n  ')
      // SSR emitter: same IR walk produced these parts; dynamics are already
      // escaped interpolations. The branch duck-types the host — StringHost
      // has .append and no .nodeType; a DOM element has nodeType.
      const ssrLiteral =
        '`' + ctx.ssrParts.join('') + '`'
      const ssrBlock = [
        // __RASEN_SSR__ is injected by the vite plugin per build target
        // (client build → false, ssr build/dev → true) so this branch and its
        // string literal dead-code-eliminate from client bundles. The typeof
        // guard keeps non-vite consumers (babel/metro, raw node) working via
        // duck-typing alone.
        `  if ((typeof __RASEN_SSR__ > 'u' || __RASEN_SSR__) && node.append !== undefined && node.nodeType === undefined) {`,
        `    node.append(${ssrLiteral})`,
        `    return`,
        `  }`,
        ``,
      ]
      const mountableSrc = [
        `(node, hooks) => {`,
        ...ssrBlock,
        `  const offs = []`,
        // Root acquisition with hydration support: t0(host) claims the
        // server-rendered counterpart while hydrating, otherwise clones and
        // appends. Navigation and wiring below are mode-independent.
        `  const ${rootVar} = ${tplName}(node)`,
        navBlock,
        wireBlock,
        `  return () => { for (const f of offs) f() }`,
        `}`,
      ]
        .filter((l) => l !== '')
        .join('\n')

      path.replaceWith(parseExpression(mountableSrc))

      // Reset per-component accumulators
      ctx.navStatements = []
      ctx.wireStatements = []
      ctx.ssrParts = []
    }
  })

  // 全部回退时也返回统计（compiled=0），由调用方决定是否生成输出

  // ── prepend imports + template declarations (AST nodes, unshifted) ──
  const helperNames = Array.from(ctx.helpers)
  const templateImport = parseStatements(
    `import { ${helperNames.join(', ')} } from '${ctx.templateSource}'`
  )
  const coreImport = ctx.needsCoreSetValue
    ? parseStatements(`import { setValue } from '@rasenjs/core'`)
    : []
  const templateDecls = ctx.templates.flatMap((t) =>
    parseStatements(`const ${t.name} = template('${t.html.replace(/'/g, "\\'")}')`)
  )

  const prelude = [...coreImport, ...templateImport, ...templateDecls]
  ast.program.body.unshift(...prelude)

  return { compiled, fellBack }
}

export interface CompileModuleResult {
  code: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any
  compiled: number
  fellBack: number
}

/**
 * Compile a TSX/JSX module. Returns null when the file lacks the
 * {@link COMPILE_DIRECTIVE} or contains nothing compilable.
 */
export function compileModule(
  code: string,
  options: CompilerOptions & { filename?: string } = {}
): CompileModuleResult | null {
  if (!code.includes(COMPILE_DIRECTIVE)) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ast: any
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    })
  } catch {
    return null
  }

  const stats = transformProgram(ast, code, { ...options, filename: options.filename })
  if (stats === null) return null

  const out = generate(ast, {
    sourceMaps: true,
    sourceFileName: options.filename ?? 'file.tsx',
  })

  return { code: out.code, map: out.map, compiled: stats.compiled, fellBack: stats.fellBack }
}
