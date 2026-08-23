/**
 * Static-hoisting compiler tests (compileModule, AST-native)
 */

import { describe, it, expect } from 'vitest'
import { compileModule } from './core'

describe('compileModule', () => {
  it('无指令的文件返回 null', () => {
    const code = `const el = <div class="a">hi</div>`
    expect(compileModule(code)).toBeNull()
  })

  it('编译纯静态元素：模板 + 克隆挂载，零绑定', () => {
    const code = `/** @rasen-compile */
const el = <div class="box"><span>hello</span></div>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    expect(r.fellBack).toBe(0)
    expect(r.code).toContain(`template('<div class="box"><span>hello</span></div>')`)
    expect(r.code).toMatch(/_r0 = t\d+\(host\)/) // 水合感知的根获取
    expect(r.code).not.toContain('host.appendChild') // append 由 tN(host) 负责
    expect(r.code).not.toContain('bindClass')
  })

  it('动态文本子节点：占位符 + bindText', () => {
    const code = `/** @rasen-compile */
const el = <td class="c">{item.label}</td>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    expect(r.code).toMatch(/template\('<td class="c"> <\/td>'\)/)
    expect(r.code).toContain('bindText(')
    expect(r.code).toContain('renderText(item.label)')
  })

  it('class/style 表达式分别发射 bindClass/bindStyle', () => {
    const code = `/** @rasen-compile */
const el = <div class={cls} style={st}>x</div>`
    const r = compileModule(code)!
    expect(r.code).toContain('bindClass(_r0, () => cls)')
    expect(r.code).toContain('bindStyle(_r0, () => st)')
  })

  it('事件处理器发射 on(el, event, handler)', () => {
    const code = `/** @rasen-compile */
const el = <button onClick={() => inc()}>up</button>`
    const r = compileModule(code)!
    expect(r.code).toContain("on(_r0, 'click', () => inc())")
  })

  it('value 发射 bindProp（DOM property），href 发射 bindAttr', () => {
    const code = `/** @rasen-compile */
const a = <input value={v} />
const b = <a href={h} />`
    const r = compileModule(code)!
    expect(r.code).toContain("bindProp(_r0, 'value', () => v)")
    expect(r.code).toContain("bindAttr(_r2, 'href', () => h)")
  })

  it('ref 发射 setValue 并引入 core 导入', () => {
    const code = `/** @rasen-compile */
const el = <input ref={inputRef} />`
    const r = compileModule(code)!
    expect(r.code).toContain('setValue(_r0, inputRef)')
    expect(r.code).toContain("from '@rasenjs/core'")
  })

  it('大写组件与 fragment 回退', () => {
    const code = `/** @rasen-compile */
const a = <Header title="x" />
const b = <><span>y</span></>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(0)
    expect(r.fellBack).toBe(1) // Header 回退；fragment 不是 JSXElement 候选
    expect(r.code).not.toContain('template(')
  })

  it('混合静态+动态文本：静态烧入，动态 bindText', () => {
    const code = `/** @rasen-compile */
const el = <td>Hello {name}</td>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    expect(r.fellBack).toBe(0)
    expect(r.code).toMatch(/template\('<td>Hello <\/td>'\)/)
    expect(r.code).toContain('bindText')
    expect(r.code).toContain('renderText(name)')
  })

  it('嵌套元素：递归编译，深层路径导航', () => {
    const code = `/** @rasen-compile */
const el = <tr><td>{id}</td></tr>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    expect(r.fellBack).toBe(0)
    expect(r.code).toMatch(/template\('<tr><td> <\/td><\/tr>'\)/)
    // 深层路径：child(root,0) → child(that,0)
    expect(r.code).toContain('child(_r0, 0)')
    expect(r.code).toContain('bindText')
  })

  it('深层嵌套：tr>td>a>label 文本走三级导航', () => {
    const labelRef = { current: null }
    const code = `/** @rasen-compile */
const el = <tr><td class="col-md-4"><a class="lbl">{label}</a></td></tr>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    // 三级导航链存在
    expect((r.code.match(/child\(/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(r.code).toContain('bindText')
    void labelRef
  })

  it('多个独立 JSX 各自编译，模板计数递增', () => {
    const code = `/** @rasen-compile */
const a = <span class="s">{x}</span>
const b = <span class="t">{y}</span>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(2)
    expect(r.code).toMatch(/const t\d+ = template/)
    expect((r.code.match(/= template\(/g) || []).length).toBe(2)
  })

  it('生成 sourcemap', () => {
    const code = `/** @rasen-compile */
const el = <div>{msg}</div>`
    const r = compileModule(code, { filename: 'test.tsx' })!
    expect(r.map).toBeTruthy()
  })

  // ── SSR 发射（P3 后半：同一 IR 产出服务端 HTML）─────────────────

  it('SSR 分支：静态结构 + 动态插值 + 转义', () => {
    const code = `/** @rasen-compile */
const el = <tr class={cls}><td class="c">{item.label}</td></tr>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    // StringHost 判别分支存在（带 __RASEN_SSR__ 编译期常量门控）
    expect(r.code).toContain("(typeof __RASEN_SSR__ > 'u' || __RASEN_SSR__) && host.append !== undefined")
    // 开标签/闭标签完整
    expect(r.code).toContain('`<tr')
    expect(r.code).toContain('</td></tr>`')
    // 动态 class 插值（转义）
    expect(r.code).toContain('class="${escapeAttr(String(cls))}"')
    // 动态文本插值（转义）
    expect(r.code).toContain(
      "${escapeHtml(renderText(item.label)) || '<!-- -->'}"
    )
    // 静态属性烤入
    expect(r.code).toContain('<td class="c">')
    // escape helpers 进入 import
    expect(r.code).toMatch(/import \{[^}]*escapeAttr[^}]*\}/)
    expect(r.code).toMatch(/import \{[^}]*escapeHtml[^}]*\}/)
  })

  it('SSR 分支：事件与 ref 不序列化', () => {
    const code = `/** @rasen-compile */
const el = <a href={href} onClick={go} ref={r}>x</a>`
    const r = compileModule(code)!
    // href 走 bindAttr 条件序列化；onClick/ref 不出现在 SSR 字符串中
    const ssrLine = r.code.split('\n').find((l) => l.includes('host.append('))!
    expect(ssrLine).not.toContain('onClick')
    expect(ssrLine).not.toContain('setValue')
    expect(ssrLine).toContain('href')
  })

  it('组件挂载点：注释锚点 + mountSlot/collectHtml', () => {
    const code = `/** @rasen-compile */
const el = <div class="box"><Header id={id} title="hi" /><span>tail</span></div>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    expect(r.fellBack).toBe(0)
    // 锚点注释进模板，导航索引稳定
    expect(r.code).toContain(`template('<div class="box"><!--rasen-slot--><span>tail</span></div>')`)
    // CSR：mountSlot 定位锚点挂载组件（props 原样传递）
    expect(r.code).toContain('child(_r0, 0)')
    expect(r.code).toMatch(/offs\.push\(mountSlot\(_s\d+, Header\(\{\s*id: id,\s*title: "hi",?\s*\}\)\)\)/)
    // SSR：collectHtml 插值同一组件调用
    expect(r.code).toMatch(/\$\{collectHtml\(Header\(\{\s*id: id,\s*title: "hi",?\s*\}\)\)\}/)
    // helpers 进入 import
    expect(r.code).toMatch(/import \{[^}]*mountSlot[^}]*\}/)
    expect(r.code).toMatch(/import \{[^}]*collectHtml[^}]*\}/)
  })

  it('槽位标记：模板锚点与 SSR 开/闭标记三处对齐', () => {
    // 标记是 compiler 独有的位置性字面量——dom 运行时对文本零感知
    // （mountSlot 按位置认领闭合注释，不做文本匹配）。
    const code = `/** @rasen-compile */
const el = <div><Header /></div>`
    const r = compileModule(code)!
    expect(r.fellBack).toBe(0)
    // 模板锚点
    expect(r.code).toContain(`template('<div><!--rasen-slot--></div>')`)
    // SSR：开标记 + collectHtml 内容 + 闭标记，三者相邻
    expect(r.code).toContain(
      '`<div><!--rasen-slot-->${collectHtml(Header({}))}<!--/rasen-slot--></div>`'
    )
  })

  it('组件挂载点：带 children 的组件回退', () => {
    const code = `/** @rasen-compile */
const el = <div><Header>text</Header></div>`
    const r = compileModule(code)!
    expect(r.fellBack).toBe(1)
  })

  // ── 正确性回退（审计修复）────────────────────────────────
  it('含 JSX 的表达式回退（cond && <span/>、list.map）', () => {
    const r1 = compileModule(`/** @rasen-compile */
const el = <div>{cond && <span>x</span>}</div>`)!
    expect(r1.fellBack).toBe(1)
    const r2 = compileModule(`/** @rasen-compile */
const el = <ul>{items.map(function(i){ return <li/> })}</ul>`)!
    expect(r2.fellBack).toBe(1)
  })

  it('innerHTML / textContent 显式回退（不静默生成无效 setAttribute）', () => {
    const r = compileModule(`/** @rasen-compile */
const el = <div innerHTML={html} />`)!
    expect(r.fellBack).toBe(1)
  })

  it('falsy 文本过滤：renderText 包装（null/undefined/boolean → 空串）', () => {
    const r = compileModule(`/** @rasen-compile */
const el = <div>{maybeUndefined}</div>`)!
    expect(r.compiled).toBe(1)
    expect(r.code).toContain('renderText(maybeUndefined)')
    expect(r.code).toMatch(/import \{[^}]*renderText[^}]*\}/)
  })

  it('SSR 分支：boolean property 序列化为裸属性', () => {
    const code = `/** @rasen-compile */
const el = <input type="checkbox" checked={ok} />`
    const r = compileModule(code)!
    expect(r.code).toContain("${(v => v ? ' checked' : '')(ok)}")
  })
})
