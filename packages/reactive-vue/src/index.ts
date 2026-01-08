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

// Symbol for identifying Rasen refs (Vue refs are already marked by Vue's internal implementation)
const RASEN_REF_SYMBOL = Symbol('rasen.vue.ref')

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
      const ref = vueRef(value) as unknown as Ref<T>
      // Mark as Rasen ref
      Object.defineProperty(ref, RASEN_REF_SYMBOL, { value: true, enumerable: false })
      return ref
    },

    computed<T>(getter: () => T): ReadonlyRef<T> {
      const computed = vueComputed(getter) as unknown as ReadonlyRef<T>
      // Mark as Rasen ref
      Object.defineProperty(computed, RASEN_REF_SYMBOL, { value: true, enumerable: false })
      return computed
    },

    unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T {
      // Check if it's a getter function
      if (typeof value === 'function') {
        return (value as () => T)()
      }
      return (isRef(value) ? vueUnref(value as VueRef<T> | ComputedRef<T>) : value) as T
    },

    isRef(value: unknown): value is Ref<unknown> | ReadonlyRef<unknown> {
      return (
        value !== null &&
        typeof value === 'object' &&
        (RASEN_REF_SYMBOL in value || isRef(value))
      )
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
