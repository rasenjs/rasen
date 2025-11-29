/**
 * React Native Utils
 */

import type { Props } from './render-context'
import { getReactiveRuntime, type Ref, type ReadonlyRef } from '@rasenjs/core'

/**
 * 解包响应式值
 */
export function unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T {
  try {
    const runtime = getReactiveRuntime()
    return runtime.unref(value)
  } catch {
    // 如果没有设置响应式运行时，简单返回值
    if (value && typeof value === 'object' && 'value' in value) {
      return (value as Ref<T>).value
    }
    return value as T
  }
}

/**
 * 判断是否为响应式引用
 */
export function isRef(value: unknown): value is Ref<unknown> {
  try {
    const runtime = getReactiveRuntime()
    return runtime.isRef(value)
  } catch {
    // 简单判断
    return value !== null && typeof value === 'object' && 'value' in value
  }
}

/**
 * 设置响应式属性监听
 * 当 getter 返回的值变化时，调用 setter
 */
export function watchProp<T>(
  getter: () => T,
  setter: (value: T) => void
): () => void {
  try {
    const runtime = getReactiveRuntime()
    return runtime.watch(getter, setter, { immediate: true })
  } catch {
    // 如果没有响应式运行时，直接执行一次
    setter(getter())
    return () => {}
  }
}

/**
 * 解析样式
 */
export function resolveStyle(style: unknown): Props {
  if (!style) return {}
  if (typeof style === 'function') {
    return resolveStyle(style())
  }
  if (Array.isArray(style)) {
    return style.reduce((acc, s) => ({ ...acc, ...resolveStyle(s) }), {})
  }
  // 解包响应式样式
  if (isRef(style)) {
    return resolveStyle(unref(style))
  }
  return style as Props
}
