/**
 * Static-hoisting compiler tests (compileModule, AST-native)
 *
 * Static hoisting is ON by default.
 */

import { describe, it, expect } from 'vitest'
import { compileModule } from '../core'
import { transformModule } from '../unplugin'

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

  it('函数子节点是 mountable：回退到工厂链，不被字符串化', () => {
    // renderText 刻意不调用函数（见 core/html-escape.ts 的注释），所以提升这个
    // 子树会产出 renderText(() => …) —— 浏览器把箭头函数的**源码**当文本显示。
    // 只有工厂链知道「调用一次、渲染返回的 string/number」这个契约
    // （dom / html 的 element.ts 各自实现了一份）。
    const code = 'const el = <div>{() => `WORLD ${g.worldLabel.value}`}</div>'
    const r = compileModule(code)!
    expect(r.fellBack).toBe(1)
    expect(r.compiled).toBe(0)
    expect(r.code).not.toContain('renderText(')
  })

  it('回退不污染后续组件：不得残留 _rN 引用与 SSR 片段', () => {
    // 被中止的尝试已经把 nav/wire/ssr 压进了共享累加器。不清理的话，下一个成功
    // 编译的组件会带上 bindClass(_r0, …) —— 那一轮里 _r0 根本不存在，挂载必然
    // 抛错；同时它的 SSR 模板会以被中止子树的标记开头。
    const code = [
      'const A = () => <div class={cls}>{cond && <span>hi</span>}</div>',
      'const B = () => <div class="b"><span>plain</span></div>'
    ].join('\n')
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    expect(r.fellBack).toBe(1)
    // B's body must not *call* the aborted attempt's bindings (an unused import
    // of a helper the attempt registered is harmless and not asserted here).
    expect(r.code).not.toMatch(/bindClass\(/)
    expect(r.code).not.toContain('escapeAttr(String(cls))')
    expect(r.code).toContain(`template('<div class="b"><span>plain</span></div>')`)
    expect(r.code).toContain('node.append(`<div class="b"><span>plain</span></div>`)')
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
    // ONE instance, shared by the runtime mount and the SSR collection.
    // Two instances ran the component's setup twice, and a component that
    // owns reactive state (a `when` over a signal) then had its first
    // instance consumed by the collector while the second never saw the
    // signal change.
    expect(r.code).toMatch(/const _c\d+ = Header\(\{\s*id: id,\s*title: "hi",?\s*\}\)/)
    // The host hooks travel with the component: a structural child
    // (`when`/`each`/`match`) places its branch with them, and without them
    // it mounts into the fragment `mountSlot` empties right after — the
    // content then lives in an orphaned shell and never reaches the page.
    expect(r.code).toMatch(/offs\.push\(mountSlot\(_s\d+, _c\d+, hooks\)\)/)
    // SSR：collectHtml 插值同一个实例
    expect(r.code).toMatch(/\$\{collectHtml\(_c\d+\)\}/)
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
    expect(r.code).toMatch(
      /`<div><!--rasen-slot-->\$\{collectHtml\(_c\d+\)\}<!--\/rasen-slot--><\/div>`/
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

  // ── className → class（React 拼写）──────────────────────────
  it('静态 className 归一化为 class 属性', () => {
    const r = compileModule(`const el = <div className="box">x</div>`)!
    expect(r.compiled).toBe(1)
    expect(r.code).toContain(`template('<div class="box">x</div>')`)
    // camelToKebab 会把 className 映射成 classname —— 那是另一个属性
    expect(r.code).not.toContain('classname')
  })

  it('动态 className 走 bindClass（SSR 用 class 属性名）', () => {
    const r = compileModule(`const el = <div className={cls}>x</div>`)!
    expect(r.compiled).toBe(1)
    expect(r.code).toContain(`bindClass(_r0, () => cls)`)
    expect(r.code).toContain(`class="\${escapeAttr(String(cls))}"`)
  })

  // ── 集合子节点：必须回退到工厂链（String() 会打印元素源码）────
  it('数组变量作子节点：回退，不字符串化', () => {
    // 空数组看着无害，但同一个变量一旦被 push 进 mountable，
    // renderText 会 String() 出每个元素的源码。
    const r = compileModule(`const kids = []; const el = <div>{kids}</div>`)!
    expect(r.fellBack).toBe(1)
    expect(r.compiled).toBe(0)
    expect(r.code).not.toContain('renderText(kids)')
  })

  it('数组方法调用作子节点：回退（map / filter / flatMap）', () => {
    for (const method of ['map', 'filter', 'flatMap']) {
      const r = compileModule(
        `const el = <ul>{items.${method}(renderItem)}</ul>`
      )!
      expect(r.fellBack).toBe(1)
      expect(r.code).not.toContain('renderText(')
    }
  })

  it('可选链上的数组方法：回退（xs?.map(f) 走专用 AST 节点）', () => {
    const r = compileModule(`const el = <ul>{items?.map(renderItem)}</ul>`)!
    expect(r.fellBack).toBe(1)
    expect(r.code).not.toContain('renderText(')
  })

  it('普通标识符与成员表达式仍静态提升（不被集合启发式误伤）', () => {
    // 作用域分析只把「初始化表达式能证明是数组」的名字算作集合；
    // 参数、props、未声明的全局以及 `item.label` 这类标量读取保持文本路径。
    const local = compileModule(`const name = 'x'; const el = <div>{name}</div>`)!
    expect(local.compiled).toBe(1)
    expect(local.code).toContain('renderText(name)')

    const member = compileModule(`const el = <td class="c">{item.label}</td>`)!
    expect(member.compiled).toBe(1)
    expect(member.code).toContain('renderText(item.label)')

    // 内层作用域把名字重新绑定成字符串 → 内层优先，不回退
    const shadowed = compileModule(
      `const rows = []; function Row(rows) { return <span>{rows}</span> }`
    )!
    expect(shadowed.compiled).toBe(1)
  })
})
/**
 * A call in a child position may RETURN a Mountable. The text path stringifies
 * whatever it is given, so hoisting such a call prints the mountable's source
 * into the page — the compiler has to fall back to the factory chain, which
 * mounts it instead.
 */
describe('renderText 守卫：返回元素的调用不当文本', () => {
  it('Rasen 工厂调用回退（别名解析）', () => {
    const code = `import { text as textNode } from '@rasenjs/dom'
const el = <span class="t">{textNode({ content: () => label.value })}</span>`
    const r = compileModule(code)!
    expect(r.fellBack).toBe(1)
    expect(r.compiled).toBe(0)
    expect(r.code).not.toContain('renderText(')
  })

  it('命名空间导入的工厂成员调用回退', () => {
    const code = `import * as dom from '@rasenjs/dom'
const el = <span class="t">{dom.text({ content: () => label.value })}</span>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(0)
    expect(r.code).not.toContain('renderText(')
  })

  it('本文件里返回 JSX / 集合的 helper 回退', () => {
    // `const out = []; out.push(<b/>); return out` — 数组只能通过函数内的名字
    // 追溯到，imports 表里没有它。
    const code = `function inline(list) {
  const out = []
  out.push(<b>hi</b>)
  return out
}
const el = <p>{inline(list)}</p>`
    const r = compileModule(code)!
    // `compiled` is already 1: the helper's own `<b>hi</b>` is a JSX root of its
    // own. What matters is that the call site was NOT hoisted into a text run —
    // it stays JSX for the factory chain to mount.
    expect(r.fellBack).toBe(1)
    expect(r.code).toContain('{inline(list)}')
    expect(r.code).not.toContain('renderText(')
  })

  it('com() 包装的组件在子节点位回退（不被烘成文本）', () => {
    // The wrapper call's JSX callback is what makes the binding a mountable:
    // `const T = com(() => <div/>)` — hoisting it as text would hand
    // renderText a function and stringify its source.
    const code = `const TechInfoModal = com(() => <div class="m">info</div>)
const el = <div class="shell">{TechInfoModal()}</div>`
    const r = compileModule(code)!
    expect(r.code).not.toContain('renderText(')
    expect(r.code).toContain('{TechInfoModal()}')
  })

  it('三元 / 逻辑表达式里夹着工厂调用也回退', () => {
    const code = `import { text } from '@rasenjs/dom'
const el = <p class="t">{cond ? text({ content: () => x }) : fallback}</p>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(0)
    expect(r.code).not.toContain('renderText(')
  })

  it('返回字符串的 helper 仍走文本通道（绑定保持响应式）', () => {
    // 退一步就不是文本了：`textOf` 返回 string，提升成 bindText 绑定才让它随
    // ref 更新。守卫必须窄到不碰它。
    const code = `function textOf(v) {
  const parts = [v]
  return parts.join(', ')
}
const el = <td class="c">{textOf(item.label)}</td>`
    const r = compileModule(code)!
    expect(r.compiled).toBe(1)
    expect(r.code).toContain('renderText(textOf(item.label))')
    expect(r.code).toContain('bindText(')
  })

  it('普通表达式文本不受影响', () => {
    const r = compileModule(`const el = <td class="c">{item.label}</td>`)!
    expect(r.compiled).toBe(1)
    expect(r.code).toContain('renderText(item.label)')
    const call = compileModule(`const el = <td class="c">{fmt(item.label)}</td>`)!
    expect(call.compiled).toBe(1)
    expect(call.code).toContain('renderText(fmt(item.label))')
  })
})

/**
 * JSX elimination — lowercase tags become BARE calls.
 *
 * The compiler emits no tag imports: binding those names is the app's
 * `unplugin-auto-import` config (recipe: docs/COMPILE-DESIGN.md). These
 * tests pin what the transform owes and nothing more — calls in the author's
 * spelling, no JSX left, no compiler-side tag imports, and the two errors
 * only the pass that sees JSX can raise.
 */
describe('JSX 消除：小写标签发裸调用', () => {
  const run = (code: string, options: any = {}) =>
    transformModule(code, 'C.tsx', { structural: true, ...options })

  it('根 <canvas> 成为调用：不改名、编译器不发标签 import', () => {
    const out = run(`export const C = () => <canvas width={400} />`)!
    expect(out).toContain('canvas({')
    expect(out).not.toContain('_rasen')
    expect(out).not.toContain('<canvas')
    expect(out).not.toContain(`from '@rasenjs/dom'`)
  })

  it('子 <canvas> 同样成调用并挂进 slot', () => {
    const out = run(`export const C = () => <div class="w"><canvas width={400} /></div>`)!
    expect(out).toContain('mountSlot(')
    expect(out).toContain('canvas({')
    expect(out).not.toContain('<canvas')
  })

  it('条件子集成调用，动态 children 内联 flat+filter', () => {
    const out = run(
      `export const C = ({ cond }: any) => <div class="w">{cond && <b>x</b>}</div>`,
      { structural: false }
    )!
    expect(out).toContain('b({')
    expect(out).toContain('cond && b({')
    expect(out).toContain('.flat(Infinity).filter(')
    expect(out).not.toContain('<b')
  })

  it('Fragment 成裸调用', () => {
    const out = run(`export const C = (xs: any[]) => <>{xs.map((x) => <li>{x}</li>)}</>`, {
      structural: false,
    })!
    expect(out).toContain('Fragment({')
    expect(out).toContain('.flat(Infinity).filter(')
    expect(out).not.toContain('<>')
  })

  it('作者已显式 import 的标签原样使用（auto-import 跳过已导入名）', () => {
    const out = run(
      `import { canvas } from '@rasenjs/dom'\nexport const C = () => <canvas width={400} />`
    )!
    expect(out.match(/import \{ canvas \} from '@rasenjs\/dom'/g)).toHaveLength(1)
    expect(out).toContain('canvas({')
  })

  it('局部绑定遮蔽标签时报错', () => {
    expect(() =>
      run(`function f(rest: any) { const div = 1; return <div {...rest} /> }`, {
        structural: false,
      })
    ).toThrow(/local binding/)
  })

  it('非法调用名（连字符标签）报错，指向 PascalCase 包装', () => {
    expect(() => run(`export const C = () => <my-widget />`)).toThrow(/PascalCase/)
  })

  it('无 JSX 文件零改动', () => {
    expect(run(`export const C = () => 1`)).toBeNull()
  })

  it('compile 关闭时也只发裸调用（零标签 import 是契约）', () => {
    const out = transformModule(`export const C = () => <div class="w">hi</div>`, 'C.tsx', {
      compile: false,
      jsxTransform: false,
    })!
    expect(out).toContain('div({')
    expect(out).toContain('children: ["hi"]')
    expect(out).not.toContain('import')
  })
})
