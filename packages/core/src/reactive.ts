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

/** 只读响应式引用（computed 返回值类型） */
// @ts-ignore
export interface ReadonlyRef<T = unknown> {}

/** Internal marker for builtin callable refs. */
export const REF_MARKER = Symbol('rasen.ref')

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
 * ============================================================
 * Built-in reactive runtime (zero-dependency, default fallback)
 * ============================================================
 *
 * Callable-ref model: `ref(v)` returns a function.
 *   count()   → read
 *   count(5)  → write
 *
 * Convenience wrappers (ref / unref / setValue / computed) are
 * exported from this module so users don't need the runtime
 * object for basic operations.
 */

// ─── Dependency tracking ───

let activeEffect: (() => void) | null = null

const depMap = new Map<object, Map<string | symbol, Set<() => void>>>()

function track(target: object, key: string | symbol) {
  if (!activeEffect) return
  let m = depMap.get(target)
  if (!m) depMap.set(target, (m = new Map()))
  let s = m.get(key)
  if (!s) m.set(key, (s = new Set()))
  s.add(activeEffect)
}

function trigger(target: object, key: string | symbol) {
  depMap.get(target)?.get(key)?.forEach(job => job())
}

// ─── Scope stack ───

let currentScope: BuiltinEffectScope | null = null

interface BuiltinEffectScope {
  effects: (() => void)[]
  run<T>(fn: () => T): T | undefined
  stop(): void
}

function builtinEffectScope(): BuiltinEffectScope {
  const scope: BuiltinEffectScope = {
    effects: [],
    run(fn) {
      const prev = currentScope
      currentScope = scope
      try {
        return fn()
      } finally {
        currentScope = prev
      }
    },
    stop() {
      for (const cleanup of scope.effects) cleanup()
      scope.effects.length = 0
    },
  }
  return scope
}

// ─── effect ───

function builtinEffect(fn: () => void): () => void {
  const e = () => {
    activeEffect = e
    fn()
    activeEffect = null
  }
  e()

  if (currentScope) {
    currentScope.effects.push(() => {
      // remove e from all dep sets
      depMap.forEach((m: Map<string | symbol, Set<() => void>>) =>
        m.forEach((s: Set<() => void>) => s.delete(e))
      )
    })
  }

  return () => {
    activeEffect = null
    depMap.forEach((m: Map<string | symbol, Set<() => void>>) =>
      m.forEach((s: Set<() => void>) => s.delete(e))
    )
  }
}

// ─── Builtin ReactiveRuntime ───

function createBuiltinRuntime(): ReactiveRuntime {
  return {
    subscribe<T>(
      getter: () => T,
      callback: (value: T, oldValue: T) => void
    ): () => void {
      let oldValue: T
      let stopped = false

      // Collector: re-evaluate getter, fire callback on change
      const collector = () => {
        if (stopped) return
        const v = getter()
        if (!Object.is(v, oldValue)) {
          const prev = oldValue
          oldValue = v
          callback(v, prev)
        }
      }

      // Tracking effect: reads getter to collect deps
      const tracker = () => {
        if (stopped) return
        getter()
      }

      // First run: seed baseline
      const saved = activeEffect
      activeEffect = null
      oldValue = getter()
      activeEffect = saved

      // Second run with tracker to collect deps
      activeEffect = tracker
      getter()
      activeEffect = null

      // Check if tracker collected any deps
      let hasDeps = false
      depMap.forEach((m: Map<string | symbol, Set<() => void>>) => {
        m.forEach((s: Set<() => void>) => {
          if (s.has(tracker)) hasDeps = true
        })
      })

      // Static source: no deps → cleanup tracker and skip
      if (!hasDeps) {
        return () => {}
      }

      // Move deps from tracker → collector
      depMap.forEach((m: Map<string | symbol, Set<() => void>>) => {
        m.forEach((s: Set<() => void>) => {
          if (s.has(tracker)) {
            s.delete(tracker)
            s.add(collector)
          }
        })
      })

      return () => {
        stopped = true
        depMap.forEach((m: Map<string | symbol, Set<() => void>>) => {
          m.forEach((s: Set<() => void>) => s.delete(collector))
        })
      }
    },

    effectScope(): { run<T>(fn: () => T): T | undefined; stop(): void } {
      return builtinEffectScope()
    },

    ref<T>(value: T): Ref<T> {
      return ref(value) as unknown as Ref<T>
    },

    unref<T>(value: T | Ref<T>): T {
      return unref(value as T | CallableRef<T> | { value: T })
    },

    setValue<T>(ref: Ref<T>, value: T): void {
      setValue(ref as unknown as CallableRef<T> | { value: T }, value)
    },

    isRef(value: unknown): boolean {
      return (
        typeof value === 'function' &&
        REF_MARKER in (value as object)
      )
    },
  }
}

// ─── Convenience API ───

/** Callable ref — ref(v), read with ref(), write with ref(v). */
export interface CallableRef<T> {
  (): T
  (value: T): void
  [REF_MARKER]: true
}

/**
 * Create a reactive ref (callable).
 *
 * ```ts
 * const count = ref(0)
 * count()     // read → 0
 * count(5)    // write → 5
 * ```
 */
export function ref<T>(initial: T): CallableRef<T> {
  const scope = currentScope
  let value = initial

  function r(): T
  function r(v: T): void
  function r(v?: T): T | void {
    if (arguments.length === 0) {
      track(r, REF_MARKER)
      return value
    }
    if (!Object.is(v, value)) {
      value = v!
      trigger(r, REF_MARKER)
    }
  }

  Object.defineProperty(r, REF_MARKER, { value: true as const })

  if (scope) {
    scope.effects.push(() => {
      depMap.delete(r)
    })
  }

  return r as unknown as CallableRef<T>
}

/**
 * Unwrap a ref: callable ref → invoke, .value object → read .value, plain value → pass through.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unref<T>(value: T | CallableRef<T> | { value: T }): T {
  if (typeof value === 'function' && REF_MARKER in (value as object)) {
    return (value as CallableRef<T>)()
  }
  if (value !== null && typeof value === 'object' && 'value' in (value as object)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (value as any).value as T
  }
  return value as T
}

/**
 * Write a ref's value: callable ref → invoke with value, .value object → set .value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setValue<T>(target: any, value: T): void {
  if (typeof target === 'function' && REF_MARKER in (target as object)) {
    ;(target as { (v: T): void })(value)
  } else {
    ;(target as { value: T }).value = value
  }
}

/**
 * Computed ref — lazy evaluation, cached, auto-tracks dependencies.
 *
 * ```ts
 * const doubled = computed(() => count() * 2)
 * doubled()    // reads, re-evaluates only when count changes
 * ```
 */
export function computed<T>(getter: () => T): ReadonlyRef<T> & (() => T) {
  let dirty = true
  let cached: T

  const c = (() => {
    if (dirty) {
      cached = getter()
      dirty = false
    }
    track(c, 'value')
    return cached
  }) as ReadonlyRef<T> & (() => T)

  Object.defineProperty(c, REF_MARKER, { value: true as const })

  builtinEffect(() => {
    getter()
    if (dirty) return // first run, already computed above
    dirty = true
    trigger(c, 'value')
  })

  if (currentScope) {
    currentScope.effects.push(() => {
      depMap.delete(c)
    })
  }

  return c
}

/**
 * Global reactive runtime — defaults to the builtin implementation.
 * Call `setReactiveRuntime()` to override with an adapter.
 */
let globalRuntime: ReactiveRuntime | null = null

/**
 * 设置响应式运行时
 */
export function setReactiveRuntime(runtime: ReactiveRuntime) {
  globalRuntime = runtime
}

/**
 * 获取响应式运行时（未设置时自动使用 builtin 实现）
 */
export function getReactiveRuntime(): ReactiveRuntime {
  if (!globalRuntime) {
    globalRuntime = createBuiltinRuntime()
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
