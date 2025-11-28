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
 * 委托给响应式运行时处理
 */
export function unrefValue<T>(value: PropValue<T>): T {
  return getReactiveRuntime().unref(value)
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
   * 解包响应式值
   * 由具体的响应式库实现判断逻辑
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
