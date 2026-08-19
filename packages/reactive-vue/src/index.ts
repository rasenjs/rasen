/**
 * Vue Reactivity adapter
 * Adapts Vue's reactivity system to Rasen
 * 
 * Uses @vue/reactivity instead of the full vue package to reduce bundle size
 */

import {
  watch as vueWatch,
  effectScope as vueEffectScope,
  ref as vueRef,
  computed as vueComputed,
  unref as vueUnref,
  isRef,
  type WatchStopHandle,
  type WatchOptions,
  type Ref as VueRef,
  type ComputedRef
} from '@vue/reactivity'
import { setReactiveRuntime, type ReactiveRuntime, type Ref, type ReadonlyRef } from '@rasenjs/core'

/**
 * Creates Vue reactive runtime
 */
export function createReactiveRuntime(): ReactiveRuntime {
  return {
    watch<T>(
      source: (() => T) | Ref<T> | ReadonlyRef<T>,
      callback: (value: T, oldValue: T) => void,
      options?: { immediate?: boolean; deep?: boolean }
    ): () => void {
      return vueWatch(source as (() => T), callback, options as WatchOptions) as WatchStopHandle
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

    computed<T>(getter: () => T): ReadonlyRef<T> {
      return vueComputed(getter) as unknown as ReadonlyRef<T>
    },

    unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T {
      // Vue 语义：只解包 ref，不调用 getter（getter 由 core 的 toValue 处理）
      return (isRef(value) ? vueUnref(value as VueRef<T> | ComputedRef<T>) : value) as T
    },

    setValue<T>(ref: Ref<T>, value: T): void {
      ;(ref as VueRef<T>).value = value
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
