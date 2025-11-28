/**
 * React Native 渲染器工具函数
 */

import { getReactiveRuntime, unrefValue } from '@rasenjs/core'
import type { PropValue } from '@rasenjs/core'
import type { ViewStyleProps, TextStyleProps } from './types'

/**
 * 解包 PropValue
 */
export function unref<T>(value: PropValue<T>): T {
  return unrefValue(value)
}

/**
 * 监听属性变化
 */
export function watchProp<T>(
  getter: () => T,
  setter: (value: T) => void
): () => void {
  const stop = getReactiveRuntime().watch(getter, setter, { immediate: true })
  return stop
}

/**
 * 将样式对象转换为 RN 原生格式
 */
export function resolveStyle(
  style: ViewStyleProps | TextStyleProps | undefined
): Record<string, unknown> {
  if (!style) return {}

  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(style)) {
    if (value !== undefined) {
      result[key] = unref(value as PropValue<unknown>)
    }
  }

  return result
}

/**
 * 解析事件处理器
 * 将事件名转换为 RN 原生事件名
 */
export function resolveEventName(event: string): string {
  const eventMap: Record<string, string> = {
    press: 'onPress',
    longPress: 'onLongPress',
    pressIn: 'onPressIn',
    pressOut: 'onPressOut',
    layout: 'onLayout',
    scroll: 'onScroll',
    changeText: 'onChangeText',
    submitEditing: 'onSubmitEditing',
    focus: 'onFocus',
    blur: 'onBlur',
    load: 'onLoad',
    error: 'onError',
    loadStart: 'onLoadStart',
    loadEnd: 'onLoadEnd'
  }

  return eventMap[event] || `on${event.charAt(0).toUpperCase()}${event.slice(1)}`
}

/**
 * 合并属性
 */
export function mergeProps(
  ...propsList: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const props of propsList) {
    if (!props) continue
    for (const [key, value] of Object.entries(props)) {
      if (value !== undefined) {
        result[key] = value
      }
    }
  }

  return result
}

/**
 * 创建组件属性收集器
 * 收集所有响应式属性的当前值
 */
export function collectProps<T extends Record<string, PropValue<unknown>>>(
  props: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) {
      result[key] = unref(value)
    }
  }

  return result
}

/**
 * 检查是否为响应式值
 */
export function isReactive(value: unknown): boolean {
  return getReactiveRuntime().isRef(value)
}

/**
 * 获取响应式属性列表
 */
export function getReactiveProps<T extends Record<string, PropValue<unknown>>>(
  props: T
): string[] {
  const reactiveKeys: string[] = []

  for (const [key, value] of Object.entries(props)) {
    if (isReactive(value)) {
      reactiveKeys.push(key)
    }
  }

  return reactiveKeys
}

/**
 * 规范化 children 为数组
 */
export function normalizeChildren<T>(
  children: T | T[] | (() => T | T[]) | undefined
): T[] {
  if (!children) return []

  if (typeof children === 'function') {
    const result = (children as () => T | T[])()
    return Array.isArray(result) ? result : [result]
  }

  if (Array.isArray(children)) {
    return children
  }

  return [children]
}
