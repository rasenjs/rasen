import type { ReadonlyRef, Ref } from '@rasenjs/core'
import { getReactiveRuntime, unrefValue } from '@rasenjs/core'

/**
 * 解包 Ref 或 ReadonlyRef
 */
export function unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T {
  return unrefValue(value)
}

/**
 * 设置 DOM 属性
 */
export function setAttribute(
  element: HTMLElement,
  name: string,
  value: string | number | boolean | null | undefined
) {
  if (value === null || value === undefined || value === false) {
    element.removeAttribute(name)
  } else if (value === true) {
    element.setAttribute(name, '')
  } else {
    element.setAttribute(name, String(value))
  }
}

/**
 * 设置 DOM 样式
 */
export function setStyle(
  element: HTMLElement,
  styles: Record<string, string | number | null | undefined>
) {
  for (const [key, value] of Object.entries(styles)) {
    if (value === null || value === undefined) {
      element.style.removeProperty(key)
    } else {
      element.style.setProperty(key, String(value))
    }
  }
}

/**
 * 设置响应式属性
 */
export function watchProp<T>(
  getter: () => T,
  setter: (value: T) => void
): () => void {
  const stop = getReactiveRuntime().watch(getter, setter, { immediate: true })
  return stop
}
