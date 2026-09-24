/**
 * Structural rewrite tests: `.map()` → `each`, `&&` / `?:` → `when`.
 *
 * The pass has two failure modes worth locking down, and they pull in opposite
 * directions:
 *
 *   * **Over-reach** — rewriting an expression that is a *value*, not a child.
 *     `value={items.map(…)}` becomes a Mountable instead of an array and the
 *     component receives garbage. Or rewriting a block-body callback whose
 *     return value `each` cannot mount.
 *   * **Under-reach** — leaving a `.map()` in place, which is the bug this
 *     pass exists to fix: no reconciliation, every item rebuilt.
 *
 * So each case below asserts both the shape that must appear and the shape that
 * must not.
 */

import { describe, it, expect } from 'vitest'
import { transformStructural } from './structural'

const run = (code: string) => transformStructural(code)

describe('each — .map() in child position', () => {
  it('rewrites a mapped element list and adds the import', () => {
    const out = run(`function List(rows) {
  return <div>{rows.map((r) => <Row item={r} />)}</div>
}`)
    expect(out).toContain('each({')
    expect(out).toContain('of: rows')
    // The generator drops the redundant parens around a single arrow param,
    // so the callback is `r => …`, not `(r) => …`. Same function.
    expect(out).toContain('children: r => <Row item={r} />')
    expect(out).toContain('import { each } from "@rasenjs/core"')
    // The array is gone — no reconciliation needed any more.
    expect(out).not.toContain('.map(')
  })

  it('keeps an existing (item, index) callback signature', () => {
    const out = run(`const L = (a) => <div>{a.map((x, i) => <Row n={i} />)}</div>`)
    expect(out).toContain('children: (x, i) => <Row n={i} />')
  })

  it('handles a member-expression receiver', () => {
    const out = run(`const L = () => <div>{props.rows.map((r) => <Row item={r} />)}</div>`)
    expect(out).toContain('of: props.rows')
  })

  it('rewrites a nested list without touching the outer call', () => {
    const out = run(`const L = (g) => <div>{g.map((grp) => <div>{grp.rows.map((r) => <Row item={r} />)}</div>)}</div>`)
    // Both levels are list positions.
    expect(out.match(/each\(/g)).toHaveLength(2)
    expect(out).not.toContain('.map(')
  })
})

describe('each — what must NOT be rewritten', () => {
  it('leaves an attribute expression alone (value, not child)', () => {
    const code = `const L = (a) => <Select items={a.map((x) => <Row item={x} />)} />`
    const out = run(code)
    expect(out).toBe(code)
    expect(out).toContain('.map(')
  })

  it('leaves a block-body callback alone', () => {
    const code = `const L = (a) => <div>{a.map((x) => { const n = x.n; return <Row n={n} />; })}</div>`
    const out = run(code)
    expect(out).toBe(code)
  })

  it('leaves a callback returning a non-element alone', () => {
    const code = `const L = (a) => <div>{a.map((x) => x.name)}</div>`
    const out = run(code)
    expect(out).toBe(code)
  })

  it('leaves a callback passed as a reference alone', () => {
    const code = `const L = (a) => <div>{a.map(render)}</div>`
    const out = run(code)
    expect(out).toBe(code)
  })

  it('leaves .forEach and friends alone', () => {
    const code = `const f = (a) => { a.forEach((x) => <Row item={x} />) }`
    const out = run(code)
    expect(out).toBe(code)
  })
})

describe('when — logical AND', () => {
  it('rewrites `cond && <El />` and imports when', () => {
    const out = run(`const P = (open) => <div>{open && <Panel />}</div>`)
    expect(out).toContain('when({')
    expect(out).toContain('condition: () => open')
    expect(out).toContain('then: () => <Panel />')
    expect(out).toContain('import { when } from "@rasenjs/core"')
    expect(out).not.toContain('&&')
  })

  it('rewrites a call-shaped condition', () => {
    const out = run(`const P = (s) => <div>{s.count() > 0 && <Panel />}</div>`)
    expect(out).toContain('condition: () => s.count() > 0')
  })

  it('leaves `X && Y` with a non-element right side alone', () => {
    const code = `const f = (a, b) => <div>{a && b}</div>`
    const out = run(code)
    expect(out).toBe(code)
  })

  it('leaves an element-on-element AND alone', () => {
    const code = `const f = () => <div>{<A /> && <B />}</div>`
    const out = run(code)
    expect(out).toBe(code)
  })
})

describe('when — conditional expression', () => {
  it('rewrites a two-branch ternary', () => {
    const out = run(`const S = (ready) => <div>{ready ? <Stage /> : <Spinner />}</div>`)
    expect(out).toContain('condition: () => ready')
    expect(out).toContain('then: () => <Stage />')
    expect(out).toContain('else: () => <Spinner />')
  })

  it('omits the else branch for a null alternate', () => {
    const out = run(`const S = (ready) => <div>{ready ? <Stage /> : null}</div>`)
    expect(out).toContain('then: () => <Stage />')
    expect(out).not.toContain('else:')
    expect(out).not.toContain('null')
  })

  it('treats a false alternate as absent too', () => {
    const out = run(`const S = (ready) => <div>{ready ? <Stage /> : false}</div>`)
    expect(out).not.toContain('else:')
  })

  it('leaves a ternary with a non-element arm alone', () => {
    const code = `const S = (ready) => <div>{ready ? <Stage /> : label}</div>`
    const out = run(code)
    expect(out).toBe(code)
  })

  it('leaves a ternary outside a child position alone', () => {
    const code = `const S = (ready) => <Box kind={ready ? <A /> : <B />} />`
    const out = run(code)
    expect(out).toBe(code)
  })
})

describe('imports', () => {
  it('does not duplicate an existing import', () => {
    const out = run(`import { each } from '@rasenjs/core'
const L = (a) => <div>{a.map((x) => <Row item={x} />)}</div>`)
    expect(out.match(/import \{ each \}/g)).toHaveLength(1)
    // `when` is not used, so it is not imported either.
    expect(out).not.toContain('when')
  })

  it('adds only the name that is missing', () => {
    const out = run(`import { each } from '@rasenjs/core'
const L = (a, b) => <div>{a.map((x) => <Row item={x} />)}{b && <P />}</div>`)
    expect(out.match(/import \{ each \}/g)).toHaveLength(1)
    expect(out).toContain('import { when } from "@rasenjs/core"')
  })

  it('honours a custom source', () => {
    const out = transformStructural(
      `const L = (a) => <div>{a.map((x) => <Row item={x} />)}</div>`,
      { source: '@app/ui' }
    )
    expect(out).toContain('from "@app/ui"')
  })

  it('inserts after the last import, not the first non-import', () => {
    // Regression: the import used to land between an interface's JSDoc and the
    // interface, orphaning the comment, because the scan broke at the first
    // statement that was not an import.
    const out = run(`import { a } from 'x'

/** doc for the interface */
export interface P { n: number }

const L = (rows) => <div>{rows.map((r) => <Row item={r} />)}</div>`)
    const lines = out.split('\n')
    const importAt = lines.findIndex((l) => l.includes('@rasenjs/core'))
    const docAt = lines.findIndex((l) => l.includes('doc for the interface'))
    const ifaceAt = lines.findIndex((l) => l.includes('export interface'))
    // The import goes above the doc comment...
    expect(importAt).toBeLessThan(docAt)
    // ...and the doc comment stays attached to the interface it documents.
    expect(docAt).toBe(ifaceAt - 1)
  })

  it('inserts after a non-contiguous import, keeping declarations in order', () => {
    const out = run(`import { a } from 'x'
export const k = 1
import { b } from 'y'

const L = (rows) => <div>{rows.map((r) => <Row item={r} />)}</div>`)
    // The new import follows the LAST import, so it cannot land between the
    // first import and the declaration that came after it.
    expect(out.indexOf("from 'y'")).toBeLessThan(out.indexOf('@rasenjs/core'))
    expect(out.indexOf('export const k')).toBeLessThan(out.indexOf("from 'y'"))
  })

  it('inserts at the top when the file has no imports', () => {
    const out = run(`const L = (rows) => <div>{rows.map((r) => <Row item={r} />)}</div>`)
    expect(out.trimStart().startsWith('import { each }')).toBe(true)
  })

  it('keeps a directive prologue first', () => {
    const out = run(`'use strict'
const L = (rows) => <div>{rows.map((r) => <Row item={r} />)}</div>`)
    expect(out.trimStart().startsWith("'use strict'")).toBe(true)
    expect(out.indexOf('@rasenjs/core')).toBeLessThan(out.indexOf('const L'))
  })

  it('is a no-op when the file has no JSX', () => {
    const code = `export const f = (a) => a.map((x) => x + 1)`
    expect(run(code)).toBe(code)
  })

  it('is a no-op when nothing matches', () => {
    const code = `const L = (a) => <div>{a}</div>`
    expect(run(code)).toBe(code)
  })
})

describe('rewrite reporting', () => {
  it('reports kind and line for each rewrite', () => {
    const seen: Array<{ kind: string; line: number }> = []
    transformStructural(
      `const L = (a, b) => (
  <div>
    {a.map((x) => <Row item={x} />)}
    {b && <Panel />}
  </div>
)`,
      { onRewrite: (info) => seen.push(info) }
    )
    expect(seen).toHaveLength(2)
    expect(seen[0].kind).toBe('each')
    expect(seen[1].kind).toBe('when')
    expect(seen[0].line).toBe(3)
    expect(seen[1].line).toBe(4)
  })
})
