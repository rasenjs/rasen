/**
 * Vue Reactivity adapter
 * Adapts Vue's reactivity system to Rasen
 * 
 * Uses @vue/reactivity instead of the full vue package to reduce bundle size
 */

import {
  computed as vueComputed,
  effectScope as vueEffectScope,
  ref as vueRef,
  unref as vueUnref,
  isRef,
  ReactiveEffect,
  type Ref as VueRef,
  type ComputedRef
} from '@vue/reactivity'
import { setReactiveRuntime, getReactiveRuntime, type ReactiveRuntime, type Ref, type ReadonlyRef } from '@rasenjs/core'

/**
 * Creates Vue reactive runtime
 */
export function createReactiveRuntime(): ReactiveRuntime {
  return {
    /**
     * 渲染层订阅原语（契约见 ReactiveRuntime.subscribe）。
     *
     * 用轻量 ReactiveEffect 包住 getter：首次求值即完成依赖收集——
     * 未收集到任何依赖（纯静态读取）时立即销毁 effect，静态绑定零订阅；
     * 有依赖时经 scheduler 同步重估，并按 Object.is 跳过等值回调
     * （Vue hasChanged 门控的等价物）。投递选择同步。
     */
    subscribe<T>(
      getter: () => T,
      onChange: (value: T, oldValue: T) => void
    ): () => void {
      let stopped = false
      let prev: T
      const eff = new ReactiveEffect(getter)
      prev = eff.run()
      // 静态源：首次求值无任何依赖 → 不建立订阅，直接释放。
      // （deps 在部分 @vue/reactivity 版本中未公开类型，走结构化读取）
      const deps = (eff as unknown as { deps?: unknown[] }).deps
      if (!deps || deps.length === 0) {
        eff.stop()
        return () => {}
      }
      eff.scheduler = () => {
        if (stopped) return
        const value = eff.run()
        if (!Object.is(value, prev)) {
          const oldValue = prev
          prev = value
          onChange(value, oldValue)
        }
      }
      return () => {
        stopped = true
        eff.stop()
      }
    },

    effectScope(): {
      run<T>(fn: () => T): T | undefined
      stop(): void
    } {
      const scope = vueEffectScope()
      return {
        run: <T>(fn: () => T) => scope.run(fn),
        stop: () => scope.stop()
      }
    },

    computed<T>(getter: () => T): ReadonlyRef<T> {
      return vueComputed(getter) as unknown as ReadonlyRef<T>
    },

    ref<T>(value: T): Ref<T> {
      return vueRef(value) as unknown as Ref<T>
    },

    unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T {
      // Vue 语义：只解包 ref，不调用 getter（getter 由 core 的 toValue 处理）
      return (isRef(value) ? vueUnref(value as unknown as VueRef<T> | ComputedRef<T>) : value) as T
    },

    setValue<T>(ref: Ref<T>, value: T): void {
      // 双重断言：Vue 3.5+ 的 Ref 带第二泛型参数，与我们的品牌接口
      // 之间没有直接可比性；运行时形状兼容（.value 可写）。
      ;(ref as unknown as VueRef<T>).value = value
    },

    isRef(value: unknown): value is Ref<unknown> | ReadonlyRef<unknown> {
      // Vue 原生 isRef 已覆盖 ref 和 computed（通过 __v_isRef 标记）
      return isRef(value)
    }
  }
}

/**
 * Convenience function that creates and sets the Vue reactive runtime
 * 
 * @example
 * ```ts
 * import { useReactiveRuntime } from '@rasenjs/reactive-vue'
 * 
 * useReactiveRuntime()
 * ```
 */
export function useReactiveRuntime(): void {
  setReactiveRuntime(createReactiveRuntime())
}

/**
 * Convenient ref function — mirrors @rasenjs/reactive-signals' standalone `ref`.
 * Creates a Vue ref via the active runtime.
 */
export function ref<T>(value: T): Ref<T> {
  return getReactiveRuntime().ref(value)
}
