import type { SyncComponent, PropValue } from '@rasenjs/core'
import { unref, setAttribute, setStyle, watchProp } from '../utils'

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
    textContent?: PropValue<string>
    innerHTML?: PropValue<string>
    value?: PropValue<string | number>
    on?: Record<string, (e: Event) => void>
    children?: Array<(host: HTMLElement) => (() => void) | undefined>
  }
> = (props) => {
  return (host) => {
    const element = document.createElement(props.tag)
    const stops: Array<() => void> = []
    const childUnmounts: Array<(() => void) | undefined> = []

    // id
    if (props.id !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.id),
          (value) => {
            if (value) element.id = value
          }
        )
      )
    }

    // className
    if (props.className !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.className),
          (value) => {
            element.className = value || ''
          }
        )
      )
    }

    // style
    if (props.style !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.style),
          (value) => {
            if (value) setStyle(element, value)
          }
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
                setAttribute(element, key, val)
              }
            }
          }
        )
      )
    }

    // textContent
    if (props.textContent !== undefined) {
      stops.push(
        watchProp(
          () => {
            const value = unref(props.textContent)
            // 转换为字符串
            return String(value)
          },
          (value) => {
            element.textContent = value || ''
          }
        )
      )
    }

    // value (for input, textarea, select)
    if (props.value !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.value),
          (value) => {
            const el = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            if (el.value !== String(value ?? '')) {
              el.value = String(value ?? '')
            }
          }
        )
      )
    }

    // innerHTML
    if (props.innerHTML !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.innerHTML),
          (value) => {
            element.innerHTML = value || ''
          }
        )
      )
    }

    // event listeners
    if (props.on) {
      console.log('Adding event listeners:', props.on, 'to element:', element)
      for (const [event, handler] of Object.entries(props.on)) {
        console.log(`Adding event listener: ${event}`)
        element.addEventListener(event, handler)
      }
    }

    // children
    if (props.children) {
      for (const childMount of props.children) {
        childUnmounts.push(childMount(element))
      }
    }

    host.appendChild(element)

    return () => {
      stops.forEach((stop) => stop())
      childUnmounts.forEach((unmount) => unmount?.())
      if (props.on) {
        for (const [event, handler] of Object.entries(props.on)) {
          element.removeEventListener(event, handler)
        }
      }
      element.remove()
    }
  }
}
