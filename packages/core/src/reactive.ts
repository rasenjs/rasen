/**
 * Rasen 内部响应式类型定义
 * 不直接依赖 Vue，而是定义通用的响应式接口
 */

/**
 * 可读写的响应式引用接口（ref）
 */
export interface Ref<T = unknown> {
  value: T
}

/**
 * 只读的响应式引用接口（computed）
 */
export interface ReadonlyRef<T = unknown> {
  readonly value: T
}

import type { PropValue } from './types'

/**
 * 解包响应式值
 * 先处理 Getter 函数，然后委托给响应式运行时处理 Ref/ReadonlyRef
 */
export function unrefValue<T>(value: PropValue<T>): T {
  // 先处理 Getter 函数
  if (typeof value === 'function') {
    return (value as () => T)()
  }
  // 再委托给响应式运行时处理 Ref/ReadonlyRef
  return getReactiveRuntime().unref(value as T | Ref<T> | ReadonlyRef<T>)
}

/**
 * Watch 回调函数（内部使用）
 */
type WatchCallback<T = unknown> = (value: T, oldValue: T) => void

/**
 * Watch 选项（内部使用）
 */
interface WatchOptions {
  immediate?: boolean
  deep?: boolean
}

/**
 * Watch 停止函数（内部使用）
 */
type WatchStopHandle = () => void

/**
 * Effect Scope（内部使用）
 */
interface EffectScope {
  run<T>(fn: () => T): T | undefined
  stop(): void
}

/**
 * 响应式运行时适配器
 * 外部需要实现这个接口来提供响应式能力
 */
export interface ReactiveRuntime {
  watch<T>(
    source: () => T,
    callback: WatchCallback<T>,
    options?: WatchOptions
  ): WatchStopHandle

  effectScope(): EffectScope

  ref<T>(value: T): Ref<T>

  computed<T>(getter: () => T): ReadonlyRef<T>

  /**
   * 解包响应式引用
   * 支持：Ref、ReadonlyRef、普通值
   * Getter 函数由 core 的 unrefValue 处理
   */
  unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T

  /**
   * 判断是否为响应式引用
   */
  isRef(value: unknown): boolean
}

/**
 * 全局响应式运行时
 */
let globalRuntime: ReactiveRuntime | null = null

/**
 * 设置响应式运行时
 */
export function setReactiveRuntime(runtime: ReactiveRuntime) {
  globalRuntime = runtime
}

/**
 * 获取响应式运行时
 */
export function getReactiveRuntime(): ReactiveRuntime {
  if (!globalRuntime) {
    throw new Error(
      'Reactive runtime not set. Call setReactiveRuntime() before using Rasen.'
    )
  }
  return globalRuntime
}

/**
 * Ref 包装
 * 导出此函数是因为 Rasen 内部需要创建响应式引用
 * 用户可以直接从响应式库（如 Vue）导入 ref
 */
export function ref<T>(value: T): Ref<T> {
  return getReactiveRuntime().ref(value)
}
