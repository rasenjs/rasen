/**
 * Nanostores adapter
 * Adapts Nanostores to Rasen
 * 
 * Nanostores is a tiny state manager with many atomic tree-shakable stores
 */

import { atom, computed as nanoComputed } from 'nanostores'
import { setReactiveRuntime, type ReactiveRuntime, type Ref, type ReadonlyRef } from '@rasenjs/core'

// Symbol for internal listen method
const LISTEN_SYMBOL = Symbol('rasen.nanostores.listen')

// Track dependencies during getter execution
let trackingContext: Set<ReturnType<typeof atom>> | null = null

/**
 * Creates Nanostores reactive runtime
 */
export function createReactiveRuntime(): ReactiveRuntime {
  return {
    watch<T>(
      source: (() => T) | Ref<T> | ReadonlyRef<T>,
      callback: (value: T, oldValue: T) => void,
      options?: { immediate?: boolean; deep?: boolean }
    ): () => void {
      if (typeof source === 'function') {
        // Track dependencies by executing the getter
        const dependencies = new Set<ReturnType<typeof atom>>()
        trackingContext = dependencies
        let lastValue = source()
        trackingContext = null
        
        // Call immediately if requested
        if (options?.immediate) {
          callback(lastValue, lastValue)
        }
        
        // Subscribe to all dependencies
        const unsubscribers = Array.from(dependencies).map(dep => {
          return dep.listen(() => {
            const newValue = source()
            if (newValue !== lastValue) {
              const oldValue = lastValue
              lastValue = newValue
              callback(newValue, oldValue)
            }
          })
        })
        
        return () => {
          unsubscribers.forEach(unsub => unsub())
        }
      } else {
        // source is a wrapped ref/computed with internal listen method
        const wrapper = source as unknown as { [LISTEN_SYMBOL]: (callback: (value: T) => void) => () => void; value: T }
        let oldValue = wrapper.value
        
        const unsubscribe = wrapper[LISTEN_SYMBOL]((value) => {
          callback(value, oldValue)
          oldValue = value
        })

        if (options?.immediate) {
          const current = wrapper.value
          callback(current, current)
        }

        return unsubscribe
      }
    },

    effectScope() {
      const cleanups: Array<() => void> = []
      let isActive = true

      return {
        run<T>(fn: () => T): T | undefined {
          if (!isActive) return undefined
          try {
            return fn()
          } finally {
            // Keep scope active for subsequent runs
          }
        },
        stop() {
          if (!isActive) return
          isActive = false
          cleanups.forEach(cleanup => cleanup())
          cleanups.length = 0
        }
      }
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

    computed<T>(getter: () => T): ReadonlyRef<T> {
      // Track dependencies during first execution
      const dependencies = new Set<ReturnType<typeof atom>>()
      trackingContext = dependencies
      const initialValue = getter()
      trackingContext = null
      
      // Use nanostores' computed if we have dependencies
      if (dependencies.size > 0) {
        const stores = Array.from(dependencies)
        const computedStore = nanoComputed(stores, () => getter())
        
        // Create wrapper with .value getter
        const wrapper = {
          get value() {
            if (trackingContext) {
              trackingContext.add(computedStore as unknown as ReturnType<typeof atom>)
            }
            return computedStore.get()
          },
          // Internal method for watch implementation
          [LISTEN_SYMBOL]: (callback: (value: T) => void) => computedStore.listen(callback)
        }
        
        return wrapper as unknown as ReadonlyRef<T>
      } else {
        // No dependencies, create a simple computed
        const store = atom<T>(initialValue)
        
        // Create wrapper with .value getter
        const wrapper = {
          get value() {
            if (trackingContext) {
              trackingContext.add(store)
            }
            return getter()
          },
          // Internal method for watch implementation
          [LISTEN_SYMBOL]: (callback: (value: T) => void) => store.listen(callback)
        }
        
        return wrapper as unknown as ReadonlyRef<T>
      }
    },

    unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T {
      if (typeof value === 'function') {
        return (value as () => T)()
      }
      if (this.isRef(value)) {
        return (value as Ref<T>).value
      }
      return value as T
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
