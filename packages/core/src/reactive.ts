/**
 * Rasen 响应式运行时 —— 用户接入的响应式库的适配契约。
 *
 * 用户选择并接入自己的响应式库（@rasenjs/reactive-vue / reactive-signals /
 * reactive-alien-signals …），框架只通过本接口消费它。业务代码直接用所选
 * 库的原生 API（ref / computed / watch …），不经过本模块。
 *
 * Ref 是「用户提供的抽象类型」：core 只把它当作一个不透明的 object 占位符，
 * 具体形状由所选库决定（Vue 的 .value、TC39 Signal 的 get()/set() …）。
 * 各 reactive 适配包通过模块增强（declare module）让 core 的 Ref 变成对应
 * 三方库的真实类型，因此引入适配包后 `.value` / `.get()` 等直接可用。
 * 访问一律走运行时的 unref / setValue / isRef，禁止直接读 `.value`。
 */

/**
 * 响应式引用 —— 用户提供的抽象类型（占位符）。
 *
 * core 不规定任何形状，只要求是 object。各 reactive 适配包通过
 * `declare module '@rasenjs/core'` 让本接口 extends 对应三方库的真实类型
 * （Vue Ref / Signal.State / alien callable …）。
 *
 * 泛型参数 T 仅用于类型层占位；空 interface 可被模块增强合并。
 */
// @ts-ignore -- 占位符：泛型参数 T 仅用于类型层，无实际成员
export interface Ref<T = unknown> {}

import type { PropValue } from './types'

/**
 * 解包响应式值（Vue 3.3+ toValue 语义）
 * 先判断是否为 ref（尊重运行时 isRef 的权威判断），再处理 Getter 函数
 */
export function toValue<T>(value: PropValue<T>): T {
  const runtime = getReactiveRuntime()
  // 先判断是否为 ref（尊重运行时 isRef 的权威判断）
  if (runtime.isRef(value)) {
    return runtime.unref<T>(value as Ref<T>)
  }
  // 再处理 Getter 函数
  if (typeof value === 'function') {
    return (value as () => T)()
  }
  // 普通值原样返回
  return value as T
}

/**
 * 响应式运行时适配器
 * 外部需要实现这个接口来提供响应式能力
 */
export interface ReactiveRuntime {
  /**
   * 渲染层订阅原语（框架内部契约）——细粒度绑定的统一 watch 表达式。
   *
   * 契约（支撑「静态零开销」）：
   * 1. 静态源零订阅：源首次求值未收集到任何响应式依赖（纯静态读取，
   *    如普通对象属性访问）时，不建立持久订阅——回调永远不会被触发，
   *    实现方应在首次求值后即释放追踪结构。
   * 2. 等值跳过：源被触发但求值结果未变化（Object.is）时，不调用回调。
   *
   * 绑定层因此可以用统一的表达式绑定：无需预先区分静态与动态，
   * 静态表达式自动退化为一次性写入。
   *
   * 业务开发者应直接使用其引入的响应式库 API（如 @rasenjs/reactive-vue
   * 导出的 watch/ref）；仅确需框架原语时才走本运行时。
   */
  subscribe<T>(
    getter: () => T,
    callback: (value: T, oldValue: T) => void
  ): () => void

  /** 组件生命周期作用域：com() 用它归集订阅，unmount 时一并 stop。 */
  effectScope(): {
    run<T>(fn: () => T): T | undefined
    stop(): void
  }

  /** 创建响应式引用（框架内部状态用；业务直接用所选库的 ref） */
  ref<T>(value: T): Ref<T>

  /**
   * 解包响应式引用
   * 是 ref 则读取值，否则原样返回（不调用 getter，getter 由 core 的 toValue 处理）
   */
  unref<T>(value: T | Ref<T>): T

  /**
   * 写入响应式引用的值（setter）
   */
  setValue<T>(ref: Ref<T>, value: T): void

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
 * 监听对象属性的响应式更新
 *
 * 遍历对象的每个属性，如果属性值是响应式的（Ref/Getter），
 * 则设置 watch 监听，当属性变化时调用回调函数。
 *
 * @param obj - 要监听的对象
 * @param callback - 当任何响应式属性变化时的回调函数
 * @param immediate - 是否立即执行一次回调
 * @returns 清理函数，停止所有监听
 *
 * @example
 * ```ts
 * const bgImage = ref('url(image1.png)')
 * const style = { 'background-image': bgImage, color: 'red' }
 *
 * const stop = watchObjectProps(style, (key, value) => {
 *   element.style.setProperty(key, String(value))
 * })
 *
 * bgImage.value = 'url(image2.png)' // 会触发回调
 * stop() // 清理监听
 * ```
 */
export function watchObjectProps(
  obj: Record<string, unknown>,
  callback: (key: string, value: unknown) => void,
  immediate = true
): () => void {
  const runtime = getReactiveRuntime()
  const stops: Array<() => void> = []

  for (const [key, value] of Object.entries(obj)) {
    // 检查是否是响应式值
    if (runtime.isRef(value)) {
      if (immediate) {
        callback(key, runtime.unref(value as Ref<unknown>))
      }

      const stop = runtime.subscribe(
        () => runtime.unref(value as Ref<unknown>),
        (newValue) => {
          callback(key, newValue)
        }
      )
      stops.push(stop)
    } else if (typeof value === 'function') {
      // Getter 函数
      if (immediate) {
        callback(key, (value as () => unknown)())
      }

      const stop = runtime.subscribe(
        value as () => unknown,
        (newValue) => {
          callback(key, newValue)
        }
      )
      stops.push(stop)
    } else {
      // 普通值，直接设置
      if (immediate) {
        callback(key, value)
      }
    }
  }

  return () => {
    stops.forEach(stop => stop())
  }
}
