/**
 * Vue Reactivity adapter
 * Adapts Vue's reactivity system to Rasen
 * 
 * Uses @vue/reactivity instead of the full vue package to reduce bundle size
 */

import {
  effectScope as vueEffectScope,
  ref as vueRef,
  unref as vueUnref,
  isRef,
  ReactiveEffect,
  type Ref as VueRef,
  type ComputedRef
} from '@vue/reactivity'
import { setReactiveRuntime, getReactiveRuntime, type ReactiveRuntime, type Ref } from '@rasenjs/core'

export type { Ref } from '@rasenjs/core'

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

    ref<T>(value: T): Ref<T> {
      return vueRef(value) as unknown as Ref<T>
    },

    unref<T>(value: T | Ref<T>): T {
      // Vue 语义：只解包 ref，不调用 getter（getter 由 core 的 toValue 处理）
      return (isRef(value) ? vueUnref(value as unknown as VueRef<T> | ComputedRef<T>) : value) as T
    },

    setValue<T>(ref: Ref<T>, value: T): void {
      // 双重断言：Vue 3.5+ 的 Ref 带第二泛型参数，与我们的品牌接口
      // 之间没有直接可比性；运行时形状兼容（.value 可写）。
      ;(ref as unknown as VueRef<T>).value = value
    },

    isRef(value: unknown): value is Ref<unknown> | Ref<unknown> {
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
 * Convenient ref function — creates a Vue ref via the active runtime.
 *
 * The returned type is core's `Ref<T>`, which this package augments to
 * extend `@vue/reactivity`'s real `Ref<T>` (see the `declare module` below),
 * so `.value` works directly.
 */
export function ref<T>(value: T): Ref<T> {
  return getReactiveRuntime().ref(value)
}

/**
 * Convenient unref — unwraps a Vue ref via the active runtime.
 */
export function unref<T>(value: T | Ref<T>): T {
  return getReactiveRuntime().unref(value)
}

/**
 * Convenient setValue — writes a Vue ref via the active runtime.
 */
export function setValue<T>(ref: Ref<T>, value: T): void {
  getReactiveRuntime().setValue(ref, value)
}

/**
 * 模块增强：让 core 的占位 `Ref<T>` 变成 Vue 的真实 `Ref<T>`。
 *
 * 用户引入本包后，core 的 `Ref<T>` 即 `@vue/reactivity` 的 `Ref<T>`
 * （带 `.value` / `__v_isRef` 等），`ref().value` 直接可用，且与
 * 组件 props 期望的 core `Ref<T>` 完全一致。
 */
declare module '@rasenjs/core' {
  type VueRefType<T> = import('@vue/reactivity').Ref<T>
  interface Ref<T> extends VueRefType<T> {}
}
