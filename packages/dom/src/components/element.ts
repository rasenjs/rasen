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
    /** Text content or child mount functions */
    children?: PropValue<string> | Array<(host: HTMLElement) => (() => void) | undefined>
    innerHTML?: PropValue<string>
    value?: PropValue<string | number>
    on?: Record<string, (e: Event) => void>
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

    // children (text content or mount functions)
    if (props.children !== undefined) {
      const children = props.children
      if (typeof children === 'string' || (typeof children === 'object' && 'value' in (children as any))) {
        // String content (or ref to string) - set as textContent
        stops.push(
          watchProp(
            () => {
              const value = unref(children as PropValue<string>)
              return String(value)
            },
            (value) => {
              element.textContent = value || ''
            }
          )
        )
      } else if (Array.isArray(children)) {
        // Mount functions
        for (const childMount of children) {
          childUnmounts.push(childMount(element))
        }
      }
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
