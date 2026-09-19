import type { PropValue } from '@rasenjs/core'
import {
  getReactiveRuntime,
  toValue,
  watchObjectProps as watchObjectPropsCore,
  attrValue,
  camelToKebab
} from '@rasenjs/core'

/**
 * 解包 Ref 或 Getter
 */
export function unref<T>(value: PropValue<T>): T {
  return toValue(value)
}

/**
 * 设置 DOM 属性
 *
 * Presence and value rules come from `attrValue` in @rasenjs/core, shared with
 * the string renderer — the server and the client must agree on whether an
 * attribute exists at all (data-* carries "true"/"false"; a boolean elsewhere
 * is a flag: true present-and-empty, false absent).
 */
export function setAttribute(
  element: HTMLElement,
  name: string,
  value: string | number | boolean | null | undefined
) {
  const serialized = attrValue(name, value)
  if (serialized === null) {
    element.removeAttribute(name)
  } else {
    element.setAttribute(name, serialized)
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
      // (flexDirection, alignItems, …) must be converted first. The conversion
      // is shared with the string renderer's style serializer.
      element.style.setProperty(camelToKebab(key), String(value))
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
  
  // 监听后续变化（subscribe：静态源零订阅 + 等值跳过，见
  // ReactiveRuntime.subscribe 契约）。setter 直传——其 (value) 签名是
  // subscribe 回调 (value, oldValue) 的前缀，无需再包一层箭头。
  return runtime.subscribe(getter, setter)
}

/**
 * 监听对象属性的响应式更新
 * 用于处理 style 等对象类型属性的响应式支持
 */
export const watchObjectProps = watchObjectPropsCore
