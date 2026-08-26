/**
 * Dynamic binding primitives tests (bindClass/bindText/bindStyle/bindProp/
 * bindAttr/on) — including hydration first-frame skip behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ref } from '@vue/reactivity'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  template,
  child,
  bindClass,
  bindClassToggle,
  bindText,
  bindStyle,
  bindProp,
  bindAttr,
  bindKey,
  on,
  configureEventDelegation,
} from './template'
import { createHydrationContext, setHydrationContext } from './hydration-context'

/** Read the delegation handler bag off an element (symbol-keyed). */
function handlerBag(el: Element): Record<string, unknown> | undefined {
  const sym = Object.getOwnPropertySymbols(el).find(
    (s) => s.description === 'rasen-events'
  )
  return sym ? (el as never as Record<symbol, Record<string, unknown>>)[sym] : undefined
}

let host: HTMLElement

beforeEach(() => {
  useReactiveRuntime()
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  setHydrationContext(null)
  host.remove()
})

describe('bindClass', () => {
  it('静态值：一次性写入，不创建 watcher', () => {
    const el = document.createElement('div')
    const stop = bindClass(el, 'static-box')

    expect(el.className).toBe('static-box')
    expect(() => stop()).not.toThrow() // no-op
  })

  it('CSR 模式应该立即应用初始值并响应更新', async () => {
    const cls = ref('a')
    const el = document.createElement('div')
    bindClass(el, () => cls.value)

    expect(el.className).toBe('a')

    cls.value = 'b'
    await Promise.resolve()
    expect(el.className).toBe('b')
  })

  it('水合模式应该跳过首帧写入但保留后续更新', async () => {
    setHydrationContext(createHydrationContext(host))
    const cls = ref('from-server')
    const el = document.createElement('div')
    el.className = 'from-server'

    bindClass(el, () => cls.value)
    expect(el.className).toBe('from-server') // 未被覆盖

    cls.value = 'changed'
    await Promise.resolve()
    expect(el.className).toBe('changed') // 后续更新正常
  })

  it('watch 应该返回 stop 函数', async () => {
    const cls = ref('a')
    const el = document.createElement('div')
    const stop = bindClass(el, () => cls.value)

    stop()
    cls.value = 'b'
    await Promise.resolve()
    expect(el.className).toBe('a') // 已停止
  })
})

describe('bindClassToggle', () => {
  it('静态真值：一次性 toggle，不创建 watcher', () => {
    const el = document.createElement('div')
    const stop = bindClassToggle(el, true, 'on')

    expect(el.classList.contains('on')).toBe(true)
    expect(() => stop()).not.toThrow() // no-op
  })

  it('CSR：立即应用初始条件并响应翻转', async () => {
    const sel = ref(false)
    const el = document.createElement('div')
    el.className = 'keep-me'
    bindClassToggle(el, () => sel.value, 'danger')

    expect(el.classList.contains('danger')).toBe(false)

    sel.value = true
    await Promise.resolve()
    expect(el.classList.contains('danger')).toBe(true)
    expect(el.className).toBe('keep-me danger') // 不破坏既有 class

    sel.value = false
    await Promise.resolve()
    expect(el.classList.contains('danger')).toBe(false)
  })

  it('水合模式跳过首帧但保留后续更新', async () => {
    setHydrationContext(createHydrationContext(host))
    const sel = ref(true)
    const el = document.createElement('div')
    el.className = 'danger from-server'
    // 服务端已渲染 danger；首帧不应移除它（即使条件为真，toggle(true) 也无害，
    // 但水合契约要求完全跳过首帧写入）
    bindClassToggle(el, () => sel.value, 'danger')
    expect(el.className).toBe('danger from-server')

    sel.value = false
    await Promise.resolve()
    expect(el.className).toBe('from-server')
  })

  it('返回的 stop 函数终止后续更新', async () => {
    const sel = ref(false)
    const el = document.createElement('div')
    const stop = bindClassToggle(el, () => sel.value, 'x')

    stop()
    sel.value = true
    await Promise.resolve()
    expect(el.classList.contains('x')).toBe(false) // 已停止
  })
})

describe('bindText', () => {
  // 注：与 element factory 的 children 语义一致 —— 响应式通过 ref 本身流动。
  // getter 返回 ref → 响应式监听；getter 返回已解包的纯值 → 静态快照一次写入。
  it('ref getter：绑定文本占位节点并响应更新', async () => {
    const label = ref('hello')
    const n = template('<td class="c"> </td>')()
    // td 的第一个子节点就是文本占位
    const x = child(n, 0)

    bindText(x, () => label)
    expect(x.textContent).toBe('hello')

    label.value = 'world'
    await Promise.resolve()
    expect(x.textContent).toBe('world')
  })

  it('普通值：一次性写入，不创建 watcher', async () => {
    const n = template('<td> </td>')()
    const x = child(n, 0)

    const stop = bindText(x, () => 'static')
    expect(x.textContent).toBe('static')

    // stop 应该是 no-op（没有 watcher 可停）
    expect(() => stop()).not.toThrow()
  })

  it('水合模式 ref getter 跳过首帧写入但保留后续更新', async () => {
    setHydrationContext(createHydrationContext(host))
    const label = ref('server-value')
    const x = document.createTextNode('server-value')

    bindText(x, () => label)
    expect(x.textContent).toBe('server-value') // 未被覆盖

    label.value = 'changed'
    await Promise.resolve()
    expect(x.textContent).toBe('changed') // 后续更新正常
  })

  it('水合模式普通值跳过首帧写入', () => {
    setHydrationContext(createHydrationContext(host))
    const x = document.createTextNode('server-value')

    bindText(x, () => 'client-value')
    expect(x.textContent).toBe('server-value') // 未被覆盖
  })
})

describe('bindStyle', () => {
  it('静态字符串：一次性写入，不创建 watcher', () => {
    const el = document.createElement('div')
    const stop = bindStyle(el, 'color: red')

    expect(el.style.color).toBe('red')
    expect(() => stop()).not.toThrow() // no-op
  })

  it('静态对象：内部 ref 键保持响应式（watchObjectProps 路径）', async () => {
    const color = ref('red')
    const el = document.createElement('div')

    bindStyle(el, { color, fontSize: '12px' })
    expect(el.style.color).toBe('red')
    expect(el.style.fontSize).toBe('12px')

    color.value = 'blue'
    await Promise.resolve()
    expect(el.style.color).toBe('blue')
  })

  it('字符串形式：初始应用 + 响应式替换', async () => {
    const style = ref('color: red; font-size: 12px')
    const el = document.createElement('div')

    bindStyle(el, () => style.value)
    expect(el.style.color).toBe('red')
    expect(el.style.fontSize).toBe('12px')

    style.value = 'color: blue'
    await Promise.resolve()
    expect(el.style.color).toBe('blue')
    expect(el.style.fontSize).toBe('') // cssText 替换清掉旧值
  })

  it('对象形式：新增、修改、移除 key 都生效', async () => {
    const style = ref<Record<string, string>>({ color: 'red', fontSize: '12px' })
    const el = document.createElement('div')

    bindStyle(el, () => style.value)
    expect(el.style.color).toBe('red')
    expect(el.style.fontSize).toBe('12px')

    // 移除 color，修改 fontSize，新增 margin
    style.value = { fontSize: '14px', margin: '1px' }
    await Promise.resolve()

    expect(el.style.color).toBe('')
    expect(el.style.fontSize).toBe('14px')
    expect(el.style.margin).toBe('1px')
  })

  it('水合模式跳过首帧写入', () => {
    setHydrationContext(createHydrationContext(host))
    const style = ref('color: red')
    const el = document.createElement('div')

    bindStyle(el, () => style.value)
    expect(el.getAttribute('style')).toBeNull()
  })
})

describe('bindProp', () => {
  it('应该写 DOM property（而非 attribute）并响应更新', async () => {
    const value = ref('initial')
    const input = document.createElement('input')

    bindProp(input, 'value', () => value.value)
    expect(input.value).toBe('initial')
    expect(input.getAttribute('value')).toBeNull() // property 不是 attribute

    value.value = 'updated'
    await Promise.resolve()
    expect(input.value).toBe('updated')
  })

  it('checked 布尔 property', async () => {
    const checked = ref(false)
    const input = document.createElement('input')
    input.type = 'checkbox'

    bindProp(input, 'checked', () => checked.value)
    expect(input.checked).toBe(false)

    checked.value = true
    await Promise.resolve()
    expect(input.checked).toBe(true)
  })
})

describe('bindKey（静态/响应式 × property/attribute 分派）', () => {
  it('静态值 + DOM property：一次性直写', () => {
    const input = document.createElement('input')
    const stop = bindKey(input, 'input', 'value', 'hello')

    expect(input.value).toBe('hello')
    expect(input.getAttribute('value')).toBeNull() // property 不是 attribute
    expect(() => stop()).not.toThrow()
  })

  it('静态值 + attribute：一次性写入', () => {
    const a = document.createElement('a')
    bindKey(a, 'a', 'href', '/static')

    expect(a.getAttribute('href')).toBe('/static')
  })

  it('响应式 ref 值按标签分类路由到 property/attribute', async () => {
    const value = ref('initial')
    const input = document.createElement('input')
    const stop = bindKey(input, 'input', 'value', value)

    value.value = 'updated'
    await Promise.resolve()
    expect(input.value).toBe('updated')
    stop()
  })
})

describe('事件委托（P4 opt-in）', () => {
  afterEach(() => {
    // 每个用例后关闭委托，避免污染其他测试
    configureEventDelegation(false)
  })

  it('委托模式：不创建逐元素监听器，冒泡到根后分发', () => {
    configureEventDelegation(true)
    const btn = document.createElement('button')
    host.appendChild(btn)

    const calls: string[] = []
    const stop = on(btn, 'click', () => calls.push('hit'))

    // 未挂到 document 前直接 dispatch 不触发（监听器在 document 上）
    expect(handlerBag(btn)?.click).toBeDefined()

    // 通过冒泡触发（btn 在 host 内，host 在 document 中）
    btn.click()
    expect(calls).toEqual(['hit'])

    stop()
    btn.click()
    expect(calls).toEqual(['hit']) // 已注销
  })

  it('委托模式：同一元素多个事件类型各自注册', () => {
    configureEventDelegation(true)
    const btn = document.createElement('button')
    host.appendChild(btn)

    const clicks: number[] = []
    const moves: number[] = []
    const stopClick = on(btn, 'click', () => clicks.push(1))
    const stopMove = on(btn, 'mousemove', () => moves.push(1))

    btn.click()
    btn.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(clicks.length).toBe(1)
    expect(moves.length).toBe(1)

    stopClick()
    stopMove()
  })

  it('关闭委托后 on() 回到直连模式', () => {
    configureEventDelegation(true)
    configureEventDelegation(false)

    const btn = document.createElement('button')
    host.appendChild(btn)
    const calls: number[] = []
    const stop = on(btn, 'click', () => calls.push(1))

    expect(handlerBag(btn)?.click).toBeUndefined() // 无 handler bag
    btn.click()
    expect(calls).toEqual([1])
    stop()
  })

  it('不冒泡事件（focus）自动回退直连监听器', () => {
    configureEventDelegation(true)
    const input = document.createElement('input')
    host.appendChild(input)

    const calls: number[] = []
    const stop = on(input, 'focus', () => calls.push(1))

    expect(handlerBag(input)?.focus).toBeUndefined() // 非委托类型不进 bag
    // focus 不冒泡，但直连监听器直接在元素上触发
    input.dispatchEvent(new FocusEvent('focus'))
    expect(calls).toEqual([1])
    stop()
  })

  it('嵌套目标：closest 向上找到最近的注册元素', () => {
    configureEventDelegation(true)
    const row = document.createElement('tr')
    const a = document.createElement('a')
    row.appendChild(a)
    host.appendChild(row)

    const hits: string[] = []
    const stop = on(row, 'click', () => hits.push('row'))

    // 点击子元素 a，应向上找到 row 的 eid
    a.click()
    expect(hits).toEqual(['row'])
    stop()
  })
})

describe('bindAttr', () => {
  it('字符串 attribute 初始应用与更新', async () => {
    const href = ref('/a')
    const a = document.createElement('a')

    bindAttr(a, 'href', () => href.value)
    expect(a.getAttribute('href')).toBe('/a')

    href.value = '/b'
    await Promise.resolve()
    expect(a.getAttribute('href')).toBe('/b')
  })

  it('false/null 移除 attribute，true 设置为空', async () => {
    const disabled = ref(false)
    const btn = document.createElement('button')

    bindAttr(btn, 'disabled', () => disabled.value)
    expect(btn.hasAttribute('disabled')).toBe(false)

    disabled.value = true
    await Promise.resolve()
    expect(btn.hasAttribute('disabled')).toBe(true)
    expect(btn.getAttribute('disabled')).toBe('')

    disabled.value = false
    await Promise.resolve()
    expect(btn.hasAttribute('disabled')).toBe(false)
  })
})

describe('on', () => {
  it('注册的监听器生效，off 后失效', () => {
    const btn = document.createElement('button')
    let clicks = 0
    const off = on(btn, 'click', () => clicks++)

    btn.click()
    btn.click()
    expect(clicks).toBe(2)

    off()
    btn.click()
    expect(clicks).toBe(2)
  })
})
