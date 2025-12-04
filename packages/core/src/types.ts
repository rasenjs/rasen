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
 * 调用后执行清理，可选携带 node 属性表示组件创建的主节点
 */
export type Unmount<Node = unknown> = (() => void) & { node?: Node }

/**
 * Mountable - 可挂载函数
 *
 * 接收 parent（宿主），执行挂载逻辑，返回 unmount 函数
 * 组件、each、when、show 等返回的都是 Mountable
 *
 * @example
 * ```typescript
 * function Counter(props: { initial: number }): Mountable<HTMLElement> {
 *   const count = ref(props.initial)
 *   return (parent) => {
 *     const el = document.createElement('div')
 *     el.textContent = String(count.value)
 *     parent.appendChild(el)
 *
 *     const stop = watch(count, (v) => el.textContent = String(v))
 *
 *     return () => {
 *       stop()
 *       el.remove()
 *     }
 *   }
 * }
 *
 * // 使用
 * const unmount = Counter({ initial: 0 })(document.body)
 * ```
 */
export type Mountable<Host = unknown, Node = unknown> = (
  host: Host
) => Unmount<Node> | undefined

/**
 * 组件函数（同步 setup）
 * 接收任意参数，返回 Mountable
 */
export type SyncComponent<Host = unknown, Args extends unknown[] = []> = (
  ...args: Args
) => Mountable<Host>

/**
 * 异步组件函数（异步 setup）
 * 接收任意参数，返回 Promise<Mountable>
 */
export type AsyncComponent<Host = unknown, Args extends unknown[] = []> = (
  ...args: Args
) => Promise<Mountable<Host>>

/**
 * 组件函数（支持同步或异步 setup）
 */
export type Component<Host = unknown, Args extends unknown[] = []> =
  | SyncComponent<Host, Args>
  | AsyncComponent<Host, Args>

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
