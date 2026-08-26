/**
 * Nanostores adapter
 * Adapts Nanostores to Rasen
 * 
 * Nanostores is a tiny state manager with many atomic tree-shakable stores
 */

import { atom } from 'nanostores'
import { setReactiveRuntime, type ReactiveRuntime, type Ref, type ReadonlyRef } from '@rasenjs/core'

// Symbol for internal listen method
const LISTEN_SYMBOL = Symbol('rasen.nanostores.listen')

// Track dependencies during getter execution
let trackingContext: Set<ReturnType<typeof atom>> | null = null

// Currently-active effect scope (set by effectScope().run). Subscriptions
// created while a scope is active register their stop function into it, so
// stopping the scope releases every effect created inside in one call —
// mirrors the TC39 adapter's currentScope design.
let activeScope: { addCleanup(cleanup: () => void): void } | null = null

/**
 * Creates Nanostores reactive runtime
 */
export function createReactiveRuntime(): ReactiveRuntime {
  return {
    /**
     * 渲染层订阅原语（契约见 ReactiveRuntime.subscribe）。依赖追踪通过
     * 执行 getter 收集 atoms：静态 getter 收集不到任何 atom，订阅列表
     * 为空——回调自然永不触发；等值跳过由 newValue !== lastValue 门控。
     */
    subscribe<T>(
      getter: () => T,
      onChange: (value: T, oldValue: T) => void
    ): () => void {
      // Track dependencies by executing the getter
      const dependencies = new Set<ReturnType<typeof atom>>()
      trackingContext = dependencies
      let lastValue = getter()
      trackingContext = null

      // Subscribe to all dependencies
      const unsubscribers = Array.from(dependencies).map(dep => {
        return dep.listen(() => {
          const newValue = getter()
          if (newValue !== lastValue) {
            const oldValue = lastValue
            lastValue = newValue
            onChange(newValue, oldValue)
          }
        })
      })

      const stop = () => {
        unsubscribers.forEach(unsub => unsub())
      }
      // Auto-register into the enclosing effect scope (runtime contract):
      // scope.stop() then bulk-releases this subscription.
      if (activeScope) {
        activeScope.addCleanup(stop)
      }
      return stop
    },

    effectScope() {
      const cleanups: Array<() => void> = []
      let isActive = true

      const scope = {
        addCleanup(cleanup: () => void): void {
          if (isActive) {
            cleanups.push(cleanup)
          }
        },
        run<T>(fn: () => T): T | undefined {
          if (!isActive) return undefined
          const prev = activeScope
          activeScope = scope
          try {
            return fn()
          } finally {
            activeScope = prev
          }
        },
        stop() {
          if (!isActive) return
          isActive = false
          cleanups.forEach(cleanup => cleanup())
          cleanups.length = 0
        }
      }
      return scope
    },

    ref<T>(value: T): Ref<T> {
      const store = atom<T>(value)
      
      // Create wrapper with .value getter/setter
      const wrapper = {
        get value() {
          // Track when this ref is accessed
          if (trackingContext) {
            trackingContext.add(store)
          }
          return store.get()
        },
        set value(newValue: T) {
          store.set(newValue)
        },
        // Internal method for watch implementation
        [LISTEN_SYMBOL]: (callback: (value: T) => void) => store.listen(callback)
      }
      
      return wrapper as unknown as Ref<T>
    },

    unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T {
      // Vue 语义：只解包 ref，不调用 getter（getter 由 core 的 toValue 处理）
      if (this.isRef(value)) {
        return (value as unknown as { value: T }).value
      }
      return value as T
    },

    setValue<T>(ref: Ref<T>, value: T): void {
      ;(ref as unknown as { value: T }).value = value
    },

    isRef(value: unknown): value is Ref<unknown> | ReadonlyRef<unknown> {
      return (
        value !== null && 
        typeof value === 'object' && 
        LISTEN_SYMBOL in value
      )
    }
  }
}

/**
 * Convenience function that creates and sets the Nanostores reactive runtime
 * 
 * @example
 * ```ts
 * import { useReactiveRuntime } from '@rasenjs/reactive-nanostores'
 * 
 * useReactiveRuntime()
 * ```
 */
export function useReactiveRuntime(): void {
  setReactiveRuntime(createReactiveRuntime())
}
