/**
 * Rasen - 响应式渲染框架类型定义
 *
 * 生命周期：
 * 1. setup: 组件函数调用，初始化响应式状态
 * 2. mount: 挂载函数调用，设置 watch 和事件监听，返回 unmount
 * 3. update: watch 回调自动触发，执行重绘逻辑
 * 4. unmount: 清理函数调用，移除监听器
 */

import type { Ref, ReadonlyRef } from './reactive'

// Re-export for convenience
export type { Ref, ReadonlyRef }

/**
 * Unmount 函数类型
 */
export type Unmount = () => void

/**
 * Mountable 标记符号
 * 用于区分 Mountable 和普通函数（如 getter）
 */
export const MOUNTABLE_SYMBOL = Symbol.for('rasen.mountable')

/**
 * 可挂载对象（不透明类型）
 * 
 * 组件、each、when、show 等返回的都是 Mountable
 * 外部通过 mount(mountable, host) 来执行挂载
 * 
 * 内部实现细节对外不可见，请使用 mount() 函数来挂载
 */
export type Mountable<Host = unknown> = {
  /** Brand type - 防止直接调用 */
  readonly [MOUNTABLE_SYMBOL]: true
  /** 类型标记，实际不存在 */
  readonly __host?: Host
}

/**
 * 内部 Mountable 实现
 * 仅供 core 内部使用
 */
interface MountableInternal<Host = unknown> {
  (host: Host): Unmount | undefined
  [MOUNTABLE_SYMBOL]: true
}

/**
 * 判断是否为 Mountable
 */
export function isMountable(value: unknown): value is Mountable<unknown> {
  return (
    typeof value === 'function' &&
    (value as MountableInternal)[MOUNTABLE_SYMBOL] === true
  )
}

/**
 * 创建 Mountable
 * 将 mount 函数包装为 Mountable
 */
export function mountable<Host = unknown>(
  fn: (host: Host) => Unmount | undefined
): Mountable<Host> {
  const m = fn as MountableInternal<Host>
  m[MOUNTABLE_SYMBOL] = true
  return m as Mountable<Host>
}

/**
 * 执行挂载
 * 统一的挂载入口，这是使用 Mountable 的唯一方式
 * 
 * 后续可扩展：生命周期钩子、错误边界、性能追踪等
 */
export function mount<Host>(
  mountable: Mountable<Host>,
  host: Host
): Unmount | undefined {
  return (mountable as unknown as MountableInternal<Host>)(host)
}

/**
 * Mount 函数类型（内部使用）
 * 组件内部实现时使用，外部应使用 Mountable 类型
 */
export type MountFunction<Host = unknown> = (
  host: Host
) => Unmount | undefined

/**
 * 组件函数（同步 setup）
 * 接收 props，返回 Mountable
 */
export type SyncComponent<Host = unknown, Props = Record<string, unknown>> = (
  props: Props
) => Mountable<Host>

/**
 * 异步组件函数（异步 setup）
 * 接收 props，返回 Promise<Mountable>
 */
export type AsyncComponent<Host = unknown, Props = Record<string, unknown>> = (
  props: Props
) => Promise<Mountable<Host>>

/**
 * 组件函数（支持同步或异步 setup）
 */
export type Component<Host = unknown, Props = Record<string, unknown>> =
  | SyncComponent<Host, Props>
  | AsyncComponent<Host, Props>

/**
 * Getter 函数类型
 * 用于响应式属性的动态求值
 */
export type Getter<T> = () => T

/**
 * 组件属性值
 * 可以是：
 * - 普通值 T
 * - 可读写的响应式引用 Ref<T>
 * - 只读的响应式引用 ReadonlyRef<T>（如 computed）
 * - Getter 函数 () => T（自动追踪依赖）
 * 
 * @example
 * // 静态值
 * <div class="btn">
 * 
 * // Ref
 * const cls = ref('btn')
 * <div class={cls}>
 * 
 * // Getter - 支持复杂表达式
 * <div class={() => `btn ${variant.value}`}>
 * <div class={() => isActive.value ? 'active' : ''}>
 */
export type PropValue<T = unknown> = T | Ref<T> | ReadonlyRef<T> | Getter<T>
