/**
 * template 原语测试（编译目标形态：template/child/next/txt）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { template, child, mountSlot, collectHtml } from './template'
import {
  createHydrationContext,
  setHydrationContext,
  claimElement,
} from './hydration-context'

const rowHtml =
  '<tr class="row"><td class="col-md-1"> </td><td class="col-md-4"><a class="lbl"> </a></td></tr>'

let container: HTMLElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  setHydrationContext(null)
  container.remove()
})

describe('template', () => {
  it('每次调用返回全新的克隆', () => {
    const t = template(rowHtml)
    const a = t()
    const b = t()

    expect(a).not.toBe(b)
    expect(a.isEqualNode(b)).toBe(true)
    expect(a.tagName).toBe('TR')
    expect(a.className).toBe('row')
  })

  it('骨架不被克隆操作污染', () => {
    const t = template(rowHtml)
    const a = t()
    a.className = 'mutated'
    a.firstChild!.textContent = 'x'

    const b = t()
    expect(b.className).toBe('row')
    expect(b.firstChild!.textContent).toBe(' ')
  })

  it('child 按索引导航', () => {
    const n = template(rowHtml)()
    const td0 = child(n, 0)
    const td1 = child(n, 1)

    expect(td0.textContent).toBe(' ')
    expect((td1.firstElementChild as HTMLElement).className).toBe('lbl')
  })

  it('child 取文本占位节点，可直接更新', () => {
    const n = template(rowHtml)()
    const td0 = child(n, 0)
    const x = child(td0, 0)

    expect(x.nodeType).toBe(Node.TEXT_NODE)
    x.textContent = '42'
    expect(td0.textContent).toBe('42')
  })

  it('端到端：模拟编译产物——克隆 + 导航 + 精确更新', () => {
    const t = template(rowHtml)

    function makeRow(id: number, label: string): HTMLElement {
      const n = t()
      const x0 = child(child(n, 0), 0)
      const a = child(child(n, 1), 0)
      const x1 = child(a, 0)
      x0.textContent = String(id)
      x1.textContent = label
      return n
    }

    const rowA = makeRow(1, 'Alice')
    const rowB = makeRow(2, 'Bob')

    expect(rowA.querySelector('a')!.textContent).toBe('Alice')
    expect(rowB.querySelector('a')!.textContent).toBe('Bob')
    expect(rowA.querySelector('.col-md-1')!.textContent).toBe('1')
    expect(rowB.querySelector('.col-md-1')!.textContent).toBe('2')
  })

  it('空 html 应该抛错', () => {
    expect(() => template('<!---->')()).toThrow(/root element/)
  })
})

describe('template 水合获取（t0(host)）', () => {
  // 注意：水合容器用 innerHTML 设置服务端 HTML 时不能用 <tr> 等上下文敏感
  // 标签（<div> 里会被解析器静默丢弃；<template.content> 才允许任意标签）
  const cardHtml =
    '<div class="card"><span class="name"> </span><a class="lbl"> </a></div>'

  it('CSR：clone 并 appendChild 到 host', () => {
    const t = template(cardHtml)
    const n = t(container)

    expect(n.parentElement).toBe(container)
    expect(n.className).toBe('card')
    expect(container.querySelectorAll('.card').length).toBe(1)
  })

  it('水合：认领服务端元素并复用（身份相同，不重新插入）', () => {
    container.innerHTML = cardHtml
    const serverEl = container.querySelector('.card')!

    setHydrationContext(createHydrationContext(container))
    const t = template(cardHtml)
    const n = t(container)

    // 复用服务端 DOM：同一节点、无新增
    expect(n).toBe(serverEl)
    expect(n.parentElement).toBe(container)
    expect(container.querySelectorAll('.card').length).toBe(1)

    // 导航路径在认领的根上同样成立（结构按构造对齐）
    const span0 = child(n, 0)
    expect(span0.className).toBe('name')
    expect((child(n, 1) as HTMLElement).className).toBe('lbl')
  })

  it('水合：标签不匹配时警告 + 移除残留 + 回退克隆', () => {
    container.innerHTML = '<section class="wrong"></section>'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    setHydrationContext(createHydrationContext(container))
    const t = template(cardHtml)
    const n = t(container)

    expect(warnSpy).toHaveBeenCalled()
    // 脏节点已被移除，不会残留在树中
    expect(container.querySelector('.wrong')).toBeNull()
    // 回退为全新克隆并插入
    expect(n.className).toBe('card')
    expect(n.parentElement).toBe(container)
    warnSpy.mockRestore()
  })

  it('水合：认领后顺序游标停在根的下一个兄弟（混合树可继续）', () => {
    container.innerHTML = `${cardHtml}<p>after</p>`
    const p = container.querySelector('p')!

    setHydrationContext(createHydrationContext(container))
    const n = template(cardHtml)(container)
    expect(n.className).toBe('card')

    // 编译组件只认领了根部；内部走路径寻址不碰上下文，
    // 顺序游标自然停在 <p> —— 后续 factory 兄弟可无缝继续认领
    const claimedP = claimElement('p')
    expect(claimedP).toBe(p)
  })
})

describe('组件挂载点（P4a：mountSlot/collectHtml）', () => {
  // 模拟一个编译产物形态的子组件：双模式（StringHost 分支 + DOM 分支）
  function makeBadge(label: string) {
    return (host: any) => {
      if (host.append !== undefined && host.nodeType === undefined) {
        host.append(`<b class="badge">${label}</b>`)
        return
      }
      const b = document.createElement('b')
      b.className = 'badge'
      b.textContent = label
      host.appendChild(b)
    }
  }

  it('CSR：fragment 下传 host，组件节点插到锚点前，锚点保留', () => {
    const n = template('<div class="box"><!--r--><span>tail</span></div>')()
    container.appendChild(n)
    const anchor = n.childNodes[0]

    mountSlot(anchor as ChildNode, makeBadge('hi'))

    expect(n.querySelector('.badge')?.textContent).toBe('hi')
    // 锚点保留在 badge 之后、tail 之前
    expect(n.childNodes[1].nodeType).toBe(8) // comment
    expect((n.childNodes[2] as HTMLElement).textContent).toBe('tail')
  })

  it('水合：游标窗口认领槽区，服务端内容被复用', () => {
    container.innerHTML =
      '<div class="box"><!--r--><b class="badge">server</b><!--/r--><span>tail</span></div>'
    const serverBadge = container.querySelector('.badge')!

    setHydrationContext(createHydrationContext(container))
    const n = template('<div class="box"><!--r--><span>tail</span></div>')(container)
    // 注意：模板里没有闭合注释（CSR 克隆不需要），但水合时服务端有——
    // 真实对齐由编译器保证两侧一致；这里手动构造服务端形态验证窗口逻辑

    // 手动走 mountSlot 的水合分支：锚点是 <!--r-->，下一个是 server badge
    const anchor = n.childNodes[0]
    mountSlot(anchor as ChildNode, (h) => {
      // 子组件的水合行为：认领已有节点（这里模拟：直接消费 badge）
      void h
    })

    // 闭合注释已被消费，badge 被复用（未重建）
    expect(container.querySelector('.badge')).toBe(serverBadge)
  })

  it('collectHtml：临时 StringHost 收集子组件输出（标记由编译器位置性发射）', () => {
    const html = collectHtml(makeBadge('ssr'))
    expect(html).toBe('<b class="badge">ssr</b>')
  })
})
