/**
 * Static-hoisting compiler tests (compileModule, AST-native)
 *
 * Static hoisting is ON by default — no `@rasen-compile` directive needed.
 */

import { describe, it, expect } from 'vitest'
import { compileModule } from '../core'

describe('compileModule', () => {
  it('无 JSX 的文件返回 null', () => {
    const code = `const x = 1`
    expect(compileModule(code)).toBeNull()
  })

  it('静态提升默认开启：无指令也编译纯静态元素', () => {
    const code = `const el = <div class="box"><span>hello</span></div>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    expect(r.fellBack).toBe(0)
    expect(r.code).toContain(`template('<div class="box"><span>hello</span></div>')`)
    expect(r.code).toMatch(/_r0 = t\d+\(node\)/) // 水合感知的根获取
    expect(r.code).not.toContain('appendChild') // append 由 tN(node) 负责
    expect(r.code).not.toContain('bindClass')
  })

  it('enabled:false 关闭静态提升', () => {
    const code = `const el = <div class="box"><span>hello</span></div>`
    expect(compileModule(code, { enabled: false })).toBeNull()
  })

  it('动态文本子节点：占位符 + bindText', () => {
    const code = `const el = <td class="c">{item.label}</td>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    expect(r.code).toMatch(/template\('<td class="c"> <\/td>'\)/)
    expect(r.code).toContain('bindText(')
    // renderText unwraps a ref through the runtime before stringifying;
    // plain String() would turn a signal into "[object Object]".
    expect(r.code).toContain('renderText(item.label)')
  })

  it('纯动态文本段不再套模板字面量（父元素自带绑定时）', () => {
    // A single dynamic value needs no template: bindText stringifies anyway and
    // renderText already returns a string, so wrapping costs a template
    // evaluation per update for nothing. This shape (a binding on the parent as
    // well as on the text) is what the benchmark Row compiles to.
    const code = `const el = <tr><td class="a"><a class="lbl" onClick={() => go()}>{label}</a></td></tr>`
    const r = compileModule(code)!
    expect(r.code).toMatch(/bindText\(_x\d+, \(\) => renderText\(label\)\)/)
    expect(r.code).not.toMatch(/=> `\$\{renderText/)
  })

  it('静态+动态混合文本段仍用一个模板重建整段', () => {
    // Guard: mixed runs must keep the single-template rebuild (the removal
    // above only applies to a lone dynamic value, which is not the case here).
    const code = `const el = <td>a {x} b</td>`
    const r = compileModule(code)!
    expect(r.code).toContain('bindText(_x1, () => `a ${renderText(x)} b`)')
  })

  it('同一绝对路径只导航一次（含子节点重复引用）', () => {
    // The <a> is needed twice — for its own attribute binding and as the parent
    // of its text — and must be navigated once, not re-walked. The compiled
    // benchmark Row used to walk two paths twice, i.e. one wasted child() call
    // per row on a 1,000-row list.
    const code = `const el = <tr><td class="a"><a onClick={() => go()}>{x}</a></td></tr>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    // paths: (0) the td, (0,0) the a, (0,0,0) the text node — exactly three
    expect((r.code.match(/child\(/g) || []).length).toBe(3)
  })

  it('class/style 表达式分别发射 bindClass/bindStyle', () => {
    const code = `const el = <div class={cls} style={st}>x</div>`
    const r = compileModule(code)!
    expect(r.code).toContain('bindClass(_r0, () => cls)')
    expect(r.code).toContain('bindStyle(_r0, () => st)')
  })

  it('class 三元 cond ? \'cls\' : \'\' 发射 bindClassToggle 快速路径', () => {
    const code = `const el = <tr class={item.selected ? 'danger' : ''}>x</tr>`
    const r = compileModule(code)!
    expect(r.code).toContain('bindClassToggle(_r0, () => item.selected, "danger")')
    expect(r.code).not.toContain('bindClass(')
    // SSR 发射真值分支的 class（编译期转义）
    expect(r.code).toContain('class="danger"')
  })

  it('非三元 class 表达式仍走 bindClass', () => {
    const code = `const el = <div class={cls}>x</div>`
    const r = compileModule(code)!
    expect(r.code).toContain('bindClass(_r0, () => cls)')
    expect(r.code).not.toContain('bindClassToggle')
  })

  it('事件处理器发射 on(el, event, handler)', () => {
    const code = `const el = <button onClick={() => inc()}>up</button>`
    const r = compileModule(code)!
    expect(r.code).toContain("on(_r0, 'click', () => inc())")
  })

  it('value 发射 bindProp（DOM property），href 发射 bindAttr', () => {
    const code = `const a = <input value={v} />
const b = <a href={h} />`
    const r = compileModule(code)!
    expect(r.code).toContain("bindProp(_r0, 'value', () => v)")
    expect(r.code).toContain("bindAttr(_r2, 'href', () => h)")
  })

  it('ref 发射 setValue 并引入 core 导入', () => {
    const code = `const el = <input ref={inputRef} />`
    const r = compileModule(code)!
    expect(r.code).toContain('setValue(_r0, inputRef)')
    expect(r.code).toContain("from '@rasenjs/core'")
  })

  it('大写组件与 fragment 回退', () => {
    const code = `const a = <Header title="x" />
const b = <><span>y</span></>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(0)
    expect(r.fellBack).toBe(1) // Header 回退；fragment 不是 JSXElement 候选
    expect(r.code).not.toContain('template(')
  })

  it('不在宿主标签清单的小写标签（如 rect）回退为组件', () => {
    const code = `const el = <rect x={1} />`
    const r = compileModule(code)!
    expect(r.compiled).toBe(0)
    expect(r.fellBack).toBe(1) // rect 不在 DOM 内置标签清单 → 组件 → 回退
    expect(r.code).not.toContain('template(')
  })

  // A text run (static text and/or dynamic values with no element between
  // them) collapses into ONE text node once the browser parses the markup, so
  // the whole run is written by a single binding at the run's own index.
  // Previously the navigation asked for index 1 while only one text node
  // existed (it asserted the defect) and `bindText` threw at mount.
  it('混合静态+动态文本：整段一个绑定（单个文本节点）', () => {
    const code = `const el = <td>Hello {name}</td>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    expect(r.fellBack).toBe(0)
    // the binding owns the node, so the template holds a bare placeholder
    expect(r.code).toMatch(/template\('<td> <\/td>'\)/)
    // one binding, at index 0, rebuilding the whole run
    expect(r.code).toContain('child(_r0, 0)')
    expect(r.code).toContain('bindText(_x1, () => `Hello ${renderText(name)}`)')
    // SSR emits the value in place — same single text node
    expect(r.code).toContain('`<td>Hello ${escapeHtml(renderText(name))}</td>`')
  })

  it('多插值同一文本段：仍然只有一个绑定', () => {
    const code = `const el = <p>a {x} b {y} c</p>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    expect(r.code).toContain('child(_r0, 0)')
    expect(r.code).toContain(
      'bindText(_x1, () => `a ${renderText(x)} b ${renderText(y)} c`)'
    )
    expect(r.code).not.toContain('child(_r0, 1)')
  })

  it('嵌套元素：递归编译，深层路径导航', () => {
    const code = `const el = <tr><td>{id}</td></tr>`
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
    const code = `const el = <tr><td class="col-md-4"><a class="lbl">{label}</a></td></tr>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    // 三级导航链存在
    expect((r.code.match(/child\(/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(r.code).toContain('bindText')
    void labelRef
  })

  it('多个独立 JSX 各自编译，模板计数递增', () => {
    const code = `const a = <span class="s">{x}</span>
const b = <span class="t">{y}</span>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(2)
    expect(r.code).toMatch(/const t\d+ = template/)
    expect((r.code.match(/= template\(/g) || []).length).toBe(2)
  })

  it('生成 sourcemap', () => {
    const code = `const el = <div>{msg}</div>`
    const r = compileModule(code, { filename: 'test.tsx' })!
    expect(r.map).toBeTruthy()
  })

  // ── SSR 发射（P3 后半：同一 IR 产出服务端 HTML）─────────────────

  it('SSR 分支：静态结构 + 动态插值 + 转义', () => {
    const code = `const el = <tr class={cls}><td class="c">{item.label}</td></tr>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    // StringHost 判别分支存在（带 __RASEN_SSR__ 编译期常量门控）
    expect(r.code).toContain("(typeof __RASEN_SSR__ > 'u' || __RASEN_SSR__) && node.append !== undefined")
    // 开标签/闭标签完整
    expect(r.code).toContain('`<tr')
    expect(r.code).toContain('</td></tr>`')
    // 动态 class 插值（转义）
    expect(r.code).toContain('class="${escapeAttr(String(cls))}"')
    // 动态文本插值（转义）—— 纯动态文本段：空值兜底为一个空格，
    // 与客户端模板里的占位文本节点同类型（注释会是另一种节点，导致水合错位）
    expect(r.code).toContain(
      "${escapeHtml(renderText(item.label)) || ' '}"
    )
    // 静态属性烤入
    expect(r.code).toContain('<td class="c">')
    // escape helpers 进入 import
    expect(r.code).toMatch(/import \{[^}]*escapeAttr[^}]*\}/)
    expect(r.code).toMatch(/import \{[^}]*escapeHtml[^}]*\}/)
  })

  it('SSR 分支：事件与 ref 不序列化', () => {
    const code = `const el = <a href={href} onClick={go} ref={r}>x</a>`
    const r = compileModule(code)!
    // href 走 bindAttr 条件序列化；onClick/ref 不出现在 SSR 字符串中
    const ssrLine = r.code.split('\n').find((l) => l.includes('node.append('))!
    expect(ssrLine).not.toContain('onClick')
    expect(ssrLine).not.toContain('setValue')
    expect(ssrLine).toContain('href')
  })

  it('组件挂载点：注释锚点 + mountSlot/collectHtml', () => {
    const code = `const el = <div class="box"><Header id={id} title="hi" /><span>tail</span></div>`
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
    const code = `const el = <div><Header /></div>`
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
    const code = `const el = <div><Header>text</Header></div>`
    const r = compileModule(code)!
    expect(r.fellBack).toBe(1)
  })

  // ── 正确性回退（审计修复）────────────────────────────────
  it('含 JSX 的表达式回退（cond && <span/>、list.map）', () => {
    const r1 = compileModule(`const el = <div>{cond && <span>x</span>}</div>`)!
    expect(r1.fellBack).toBe(1)
    const r2 = compileModule(`const el = <ul>{items.map(function(i){ return <li/> })}</ul>`)!
    expect(r2.fellBack).toBe(1)
  })

  it('innerHTML / textContent 显式回退（不静默生成无效 setAttribute）', () => {
    const r = compileModule(`const el = <div innerHTML={html} />`)!
    expect(r.fellBack).toBe(1)
  })

  it('falsy 文本过滤：renderText 包装（null/undefined/boolean → 空串）', () => {
    const r = compileModule(`const el = <div>{maybeUndefined}</div>`)!
    expect(r.compiled).toBe(1)
    expect(r.code).toContain('renderText(maybeUndefined)')
    expect(r.code).toMatch(/import \{[^}]*renderText[^}]*\}/)
  })

  it('SSR 分支：boolean property 序列化为裸属性', () => {
    const code = `const el = <input type="checkbox" checked={ok} />`
    const r = compileModule(code)!
    expect(r.code).toContain("${(v => v ? ' checked' : '')(ok)}")
  })
})