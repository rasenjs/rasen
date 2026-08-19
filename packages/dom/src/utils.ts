import type { PropValue } from '@rasenjs/core'
import { getReactiveRuntime, toValue, watchObjectProps as watchObjectPropsCore } from '@rasenjs/core'

/**
 * 解包 Ref、ReadonlyRef 或 Getter
 */
export function unref<T>(value: PropValue<T>): T {
  return toValue(value)
}

/**
 * 设置 DOM 属性
 * 对于 data-* 属性，布尔值转为 "true"/"false" 字符串
 * 对于其他属性，true 设为空字符串，false 移除属性
 */
export function setAttribute(
  element: HTMLElement,
  name: string,
  value: string | number | boolean | null | undefined
) {
  if (value === null || value === undefined) {
    element.removeAttribute(name)
  } else if (typeof value === 'boolean') {
    // data-* 属性使用 "true"/"false" 字符串
    if (name.startsWith('data-')) {
      element.setAttribute(name, String(value))
    } else {
      // 其他布尔属性：true 设为空字符串，false 移除
      if (value) {
        element.setAttribute(name, '')
      } else {
        element.removeAttribute(name)
      }
    }
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
      // setProperty only accepts kebab-case property names; camelCase keys
      // (flexDirection, alignItems, …) must be converted first.
      const cssKey = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
      element.style.setProperty(cssKey, String(value))
    }
  }
}

/**
 * 设置响应式属性
 * @param skipImmediate 是否跳过立即执行（用于 hydration 模式）
 */
export function watchProp<T>(
  getter: () => T,
  setter: (value: T) => void,
  skipImmediate = false
): () => void {
  const runtime = getReactiveRuntime()
  
  // 立即执行一次（除非在 hydration 模式）
  if (!skipImmediate) {
    try {
      const value = getter()
      setter(value)
    } catch (e) {
      // 忽略初始化错误
    }
  }
  
  // 监听后续变化
  const stop = runtime.watch(
    getter,
    (newValue) => {
      setter(newValue)
    },
    { immediate: false }
  )
  
  return stop
}

/**
 * 监听对象属性的响应式更新
 * 用于处理 style 等对象类型属性的响应式支持
 */
export const watchObjectProps = watchObjectPropsCore
