import type { SyncComponent, PropValue, Ref, Mountable } from '@rasenjs/core'
import { mount, mountable } from '@rasenjs/core'
import { unref, setAttribute, setStyle, watchProp } from '../utils'
import { getHydrationContext } from '../hydration-context'

/**
 * element 组件 - 通用 HTML 元素组件
 */
export const element: SyncComponent<
  HTMLElement,
  {
    tag: string
    id?: PropValue<string>
    className?: PropValue<string>
    style?: PropValue<Record<string, string | number>>
    attrs?: PropValue<Record<string, string | number | boolean>>
    /** Text content or child mount functions */
    children?:
      | PropValue<string>
      | Array<Mountable<HTMLElement>>
    value?: PropValue<string | number>
    /** checkbox/radio 的选中状态 */
    checked?: PropValue<boolean>
    on?: Record<string, (e: Event) => void>
    /** 元素引用 - 挂载后会设置为 DOM 元素 */
    ref?: Ref<HTMLElement | null>
  }
> = (props) => {
  return mountable((host) => {
    const ctx = getHydrationContext()
    let el: HTMLElement
    let hydrated = false

    if (ctx?.isHydrating) {
      // === Hydration 模式：复用已有 DOM ===
      const existing = ctx.claim()
      
      if (existing && existing.nodeType === Node.ELEMENT_NODE) {
        const existingEl = existing as HTMLElement
        if (existingEl.tagName.toLowerCase() === props.tag.toLowerCase()) {
          // 标签匹配，复用元素
          el = existingEl
          hydrated = true
        } else {
          // 标签不匹配，警告并创建新元素
          console.warn(
            `[Rasen Hydration] Tag mismatch: expected <${props.tag}>, got <${existingEl.tagName.toLowerCase()}>`
          )
          el = document.createElement(props.tag)
        }
      } else {
        // 没有可复用的元素节点
        if (existing) {
          console.warn(
            `[Rasen Hydration] Expected element <${props.tag}>, got ${existing.nodeType === Node.TEXT_NODE ? 'text node' : 'other node'}`
          )
        }
        el = document.createElement(props.tag)
      }
    } else {
      // === 正常模式：创建新元素 ===
      el = document.createElement(props.tag)
    }

    const stops: Array<() => void> = []
    const childUnmounts: Array<(() => void) | undefined> = []

    // id - hydration 模式下跳过初始设置（已存在）
    if (props.id !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.id),
          (value) => {
            if (value) el.id = value
          },
          hydrated // hydrated 时跳过 immediate
        )
      )
    }

    // className
    if (props.className !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.className),
          (value) => {
            el.className = value || ''
          },
          hydrated
        )
      )
    }

    // style
    if (props.style !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.style),
          (value) => {
            if (value) setStyle(el, value)
          },
          hydrated
        )
      )
    }

    // attrs
    if (props.attrs !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.attrs),
          (value) => {
            if (value) {
              for (const [key, val] of Object.entries(value)) {
                // 跳过无效的属性名（数字开头或纯数字）
                if (/^\d/.test(key)) continue
                setAttribute(el, key, val)
              }
            }
          },
          hydrated
        )
      )
    }

    // children (text content or mount functions)
    if (props.children !== undefined) {
      const children = props.children
      if (
        typeof children === 'string' ||
        (typeof children === 'object' && 'value' in (children as any))
      ) {
        // String content (or ref to string) - set as textContent
        stops.push(
          watchProp(
            () => {
              const value = unref(children as PropValue<string>)
              return String(value)
            },
            (value) => {
              el.textContent = value || ''
            },
            hydrated
          )
        )
      } else if (Array.isArray(children)) {
        // Mount functions - 进入子节点
        if (ctx?.isHydrating) {
          ctx.enterChildren(el)
        }
        
        for (const child of children) {
          childUnmounts.push(mount(child, el))
        }
        
        if (ctx?.isHydrating) {
          ctx.exitChildren()
        }
      }
    }

    // value (for input, textarea, select)
    if (props.value !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.value),
          (value) => {
            const inputEl = el as
              | HTMLInputElement
              | HTMLTextAreaElement
              | HTMLSelectElement
            if (inputEl.value !== String(value ?? '')) {
              inputEl.value = String(value ?? '')
            }
          },
          hydrated
        )
      )
    }

    // checked (for checkbox, radio)
    if (props.checked !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.checked),
          (checked) => {
            const inputEl = el as HTMLInputElement
            if (inputEl.checked !== !!checked) {
              inputEl.checked = !!checked
            }
          },
          hydrated
        )
      )
    }

    // event listeners - 总是需要绑定（SSR 不输出事件）
    if (props.on) {
      for (const [event, handler] of Object.entries(props.on)) {
        el.addEventListener(event, handler)
      }
    }

    // ref - 设置元素引用
    if (props.ref) {
      props.ref.value = el
    }

    // 只有非 hydration 模式才需要 appendChild
    if (!hydrated) {
      host.appendChild(el)
    }

    // 创建带 node 属性的 unmount 函数
    const unmount = () => {
      // 清理 ref
      if (props.ref) {
        props.ref.value = null
      }
      stops.forEach((stop) => stop())
      childUnmounts.forEach((unmount) => unmount?.())
      if (props.on) {
        for (const [event, handler] of Object.entries(props.on)) {
          el.removeEventListener(event, handler)
        }
      }
      el.remove()
    }
    
    // 附加 node 引用，供 each 组件进行节点移动
    ;(unmount as { node?: Node }).node = el
    
    return unmount
  })
}
