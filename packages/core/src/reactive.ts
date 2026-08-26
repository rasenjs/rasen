/**
 * Rasen 内部响应式类型定义
 * 不直接依赖 Vue，而是定义通用的响应式接口
 *
 * Ref 是一个「不透明」的响应式引用类型：它不规定任何具体形状
 * （Vue 的 ref 暴露 `.value`，TC39 Signal 暴露 `.get()`/`.set()`），
 * 因此与具体响应式库完全解耦。访问一律走 unref / setValue / isRef
 * （由运行时提供），或 core 的 toValue，禁止直接读 `.value`。
 */

// 类型层品牌：仅用于在类型上把「响应式引用」和普通对象区分开，
// 运行时并不依赖它（运行时判定走各适配器的 isRef）。
declare const REF_BRAND: unique symbol
declare const READONLY_REF_BRAND: unique symbol

/**
 * 可读写的响应式引用接口（ref）
 *
 * 不暴露任何结构属性——具体形状由适配器决定。
 * 框架规范访问路径是 unref / setValue，禁止直接依赖 `.value`。
 */
export interface Ref<T = unknown> {
  readonly [REF_BRAND]: true
  readonly __phantom?: T
}

/**
 * 只读的响应式引用接口（computed） */
export interface ReadonlyRef<T = unknown> {
  readonly [READONLY_REF_BRAND]: true
  readonly __phantom?: T
}

import type { PropValue } from './types'

/**
 * 解包响应式值（Vue 3.3+ toValue 语义）
 * 先判断是否为 ref（尊重运行时 isRef 的权威判断），再处理 Getter 函数
 */
export function toValue<T>(value: PropValue<T>): T {
  // 先判断是否为 ref（尊重运行时 isRef 的权威判断）
  if (isRef(value)) {
    return unref(value as Ref<T> | ReadonlyRef<T>)
  }
  // 再处理 Getter 函数
  if (typeof value === 'function') {
    return (value as () => T)()
  }
  // 普通值原样返回
  return value as T
}

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

  effectScope(): EffectScope

  ref<T>(value: T): Ref<T>

  computed<T>(getter: () => T): ReadonlyRef<T>

  /**
   * 解包响应式引用
   * 是 ref 则读取值，否则原样返回（不调用 getter，getter 由 core 的 toValue 处理）
   */
  unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T

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
 * Ref 包装
 * 导出此函数是因为 Rasen 内部需要创建响应式引用
 * 用户可以直接从响应式库（如 Vue）导入 ref
 */
export function ref<T>(value: T): Ref<T> {
  return getReactiveRuntime().ref(value)
}

/**
 * Computed 包装
 */
export function computed<T>(getter: () => T): ReadonlyRef<T> {
  return getReactiveRuntime().computed(getter)
}

/**
 * 解包响应式引用
 * 是 ref 则读取值，否则原样返回（Vue 语义，不调用 getter）
 */
export function unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T {
  return getReactiveRuntime().unref(value)
}

/**
 * 写入响应式引用的值
 * 库代码应使用此函数而非 `.value`，实现与响应性库的解耦
 */
export function setValue<T>(ref: Ref<T>, value: T): void {
  getReactiveRuntime().setValue(ref, value)
}

/**
 * 判断是否为响应式引用
 */
export function isRef(value: unknown): boolean {
  return getReactiveRuntime().isRef(value)
}

/**
 * 监听对象属性的响应式更新
 * 
 * 遍历对象的每个属性，如果属性值是响应式的（Ref/ReadonlyRef/Getter），
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
      // Ref 或 ReadonlyRef
      if (immediate) {
        callback(key, unref(value as Ref<unknown>))
      }
      
      const stop = runtime.subscribe(
        () => unref(value as Ref<unknown> | ReadonlyRef<unknown>),
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
