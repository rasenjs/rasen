/**
 * Pipeline tests (static hoisting + JSX attribute transform).
 *
 * These exercise `transformModule` — the exact composition the bundler plugin
 * runs — rather than `compileModule` alone. The unit tests in
 * `compile.test.ts` feed RAW JSX straight to the hoisting pass, so they cannot
 * see an ordering mistake between the two passes.
 *
 * Regression: with the JSX transform running first, every complex prop
 * expression was wrapped in a getter before hoisting saw it, so the hoisting
 * pass wrapped it a second time (`() => () => expr`). `bindClass`/`bindProp`
 * then received a getter that *returns a function* and stringified it into the
 * attribute — the class attribute literally became
 * `()=>e.selected?"danger":""`. Caught by the DOM benchmark's select case.
 */

import { describe, it, expect } from 'vitest'
import { transformModule } from '../unplugin'

const run = (code: string) => transformModule(code, 'test.tsx')!

describe('transformModule pipeline', () => {
  it('三元 class 走 bindClassToggle 快速路径（不被 getter 包两次）', () => {    const code = `function Row(item) {
  return <tr class={item.selected ? 'danger' : ''}>x</tr>
}`
    const out = run(code)
    expect(out).toContain('bindClassToggle(_r0, () => item.selected, "danger")')
    expect(out).not.toContain('() => () =>')
    // SSR 分支必须是真值分支的字面 class，不是 String(函数)
    expect(out).toContain('class="danger"')
    expect(out).not.toContain('String(() =>')
  })

  it('复杂表达式 prop 只包一层 getter', () => {
    const code = `function Box(a, b) {
  return <div class={a.b} style={mk(b)} title={a + b}>x</div>
}`
    const out = run(code)
    expect(out).not.toContain('() => () =>')
    expect(out).toContain('bindClass(_r0, () => a.b)')
    expect(out).toContain('bindStyle(_r0, () => mk(b))')
  })

  it('组件子树经静态提升后仍挂载到 slot（无重复包装）', () => {
    const code = `function App(cls) {
  return <div class="box"><Header id={cls} title="hi" /></div>
}`
    const out = run(code)
    expect(out).not.toContain('() => () =>')
    expect(out).toContain('mountSlot(')
  })

  it('回调属性不被包成 getter（事件处理器保持原样）', () => {
    const code = `function B(id) {
  return <button onClick={() => pick(id)}>up</button>
}`
    const out = run(code)
    expect(out).toContain("on(_r0, 'click', () => pick(id))")
    expect(out).not.toContain('() => () => pick')
  })

  it('无法提升的元素回退为 JSX，但其属性仍被包成 getter', () => {
    const code = `function F(rest, mk) {
  return <div {...rest} class={mk()}>x</div>
}`
    const out = run(code)
    expect(out).not.toContain('() => () =>')
    // 回退路径：原始 JSX 保留，复杂表达式被包装供运行时 props 读取
    expect(out).toMatch(/class=\{\(\) => mk\(\)\}/)
  })
})

/**
 * The structural pass is opt-in and lives at the head of the pipeline. Two
 * things have to hold for it to be usable at all, and neither is visible from
 * `transformStructural`'s own tests:
 *
 *   1. `transformModule` must actually run it when asked. The plugin's
 *      `transform()` hook forwards a fixed set of options into the pipeline,
 *      so a flag that is destructured but never forwarded reads as "enabled"
 *      while doing nothing — which is what happened here.
 *   2. It must stay OFF when not asked. React and Vue projects compile through
 *      this plugin too, and rewriting their `.map()` into `each({…})` would
 *      emit a call to a function that does not exist in those runtimes.
 */
describe('transformModule pipeline — structural pass', () => {
  const MAP_CODE = `function List(rows) {
  return <div>{rows.map((r) => <Row item={r} />)}</div>
}`

  it('rewrites when enabled and forwards the flag through', () => {
    const out = transformModule(MAP_CODE, 'test.tsx', { structural: true })!
    expect(out).toContain('each({')
    expect(out).toContain('of: rows')
    expect(out).not.toContain('.map(')
  })

  it('is off by default — React/Vue must not get Rasen components', () => {
    const out = transformModule(MAP_CODE, 'test.tsx')!
    expect(out).not.toContain('each({')
  })

  it('does not interfere with the attribute-getter pass', () => {
    // The getter pass must still wrap `class={…}` in the same file.
    const code = `function List(rows, mk) {
  return <div class={mk()}>{rows.map((r) => <Row item={r} />)}</div>
}`
    const out = transformModule(code, 'test.tsx', { structural: true })!
    expect(out).toContain('each({')
    expect(out).not.toContain('() => () =>')
  })
})
