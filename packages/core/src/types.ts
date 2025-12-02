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
 * Mount 函数类型
 * 接收 host，返回 unmount 函数
 */
export type MountFunction<Host = unknown> = (
  host: Host
) => (() => void) | undefined

/**
 * 组件函数（同步 setup）
 * 接收 props，返回 mount 函数
 */
export type SyncComponent<Host = unknown, Props = Record<string, unknown>> = (
  props: Props
) => MountFunction<Host>

/**
 * 异步组件函数（异步 setup）
 * 接收 props，返回 Promise<mount 函数>
 */
export type AsyncComponent<Host = unknown, Props = Record<string, unknown>> = (
  props: Props
) => Promise<MountFunction<Host>>

/**
 * 组件函数（支持同步或异步 setup）
 */
export type Component<Host = unknown, Props = Record<string, unknown>> =
  | SyncComponent<Host, Props>
  | AsyncComponent<Host, Props>

/**
 * 组件属性值
 * 可以是普通值、可读写的响应式引用（ref）或只读的响应式引用（computed）
 */
export type PropValue<T = unknown> = T | Ref<T> | ReadonlyRef<T>
