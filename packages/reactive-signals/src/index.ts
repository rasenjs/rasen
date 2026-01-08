/**
 * TC39 Signals adapter
 * Adapts TC39 Signals proposal's reactivity system to Rasen
 */

import { Signal } from 'signal-polyfill'
import { setReactiveRuntime, type ReactiveRuntime, type Ref, type ReadonlyRef } from '@rasenjs/core'

// Symbol for identifying Rasen refs
const RASEN_REF_SYMBOL = Symbol('rasen.signals.ref')

// Create singleton runtime (lazily initialized)
let runtime: ReactiveRuntime | undefined

// Currently active scope (for collecting watchers)
let currentScope: { addCleanup: (cleanup: () => void) => void } | null = null

/**
 * Creates Signals reactive runtime
 */
export function createReactiveRuntime(): ReactiveRuntime {
  return {
    watch<T>(
      source: (() => T) | Ref<T> | ReadonlyRef<T>,
      callback: (value: T, oldValue: T) => void,
      options?: { immediate?: boolean; deep?: boolean }
    ): () => void {
      let oldValue: T | undefined = undefined
      let isFirstRun = true
      let stopped = false

      // Create a Computed as effect
      const effect = new Signal.Computed(() => {
        if (stopped) return
        
        const newValue = typeof source === 'function' ? source() : (source as Ref<T>).value
        
        if (!isFirstRun && oldValue !== undefined) {
          callback(newValue, oldValue)
        } else if (options?.immediate) {
          // For immediate option, first oldValue is also the current value
          callback(newValue, newValue)
        }
        
        if (isFirstRun) {
          isFirstRun = false
        }
        
        oldValue = newValue
        return newValue
      })

      // Create Watcher to listen to effect
      const watcher = new Signal.subtle.Watcher(() => {
        // Delay execution to avoid reading signal during notification phase
        queueMicrotask(() => {
          if (!stopped) {
            // Execute effect first
            effect.get()
            // If not stopped, continue watching
            if (!stopped) {
              watcher.watch(effect)
            }
          }
        })
      })

      // Watch effect itself
      watcher.watch(effect)
      
      // Initial execution to establish dependencies and trigger immediate callback
      effect.get()
      // Need to re-watch after initial execution
      watcher.watch(effect)

      // Return stop function
      const stopFn = () => {
        stopped = true
        watcher.unwatch(effect)
      }
      
      // If within a scope, register cleanup function
      if (currentScope) {
        currentScope.addCleanup(stopFn)
      }
      
      return stopFn
    },

    effectScope: () => {
      // Create scope container to collect all watchers created inside
      const cleanups: (() => void)[] = []
      let isActive = true

      const scope = {
        addCleanup: (cleanup: () => void) => {
          if (isActive) {
            cleanups.push(cleanup)
          }
        },
        run: <T>(fn: () => T): T | undefined => {
          if (!isActive) return undefined
          
          // Set current scope
          const prevScope = currentScope
          currentScope = scope
          try {
            return fn()
          } finally {
            currentScope = prevScope
          }
        },
        stop: () => {
          if (!isActive) return
          isActive = false
          // Clean up all collected side effects
          cleanups.forEach(cleanup => cleanup())
          cleanups.length = 0
        }
      }

      return scope
    },

    ref: <T>(value: T): Ref<T> => {
      const signal = new Signal.State(value)
      const ref = {
        get value() {
          return signal.get()
        },
        set value(newValue: T) {
          signal.set(newValue)
        },
        [RASEN_REF_SYMBOL]: true
      }
      return ref
    },

    computed: <T>(getter: () => T): ReadonlyRef<T> => {
      const signal = new Signal.Computed(getter)
      const computed = {
        get value() {
          return signal.get()
        },
        [RASEN_REF_SYMBOL]: true
      }
      return computed
    },

    unref: <T>(value: T | Ref<T> | ReadonlyRef<T> | (() => T)): T => {
      // Check if it's a getter function (but exclude Ref objects, as they also have value)
      if (typeof value === 'function') {
        // Execute getter function
        return (value as () => T)()
      }
      // Check if it has value property (Ref or ReadonlyRef)
      if (value && typeof value === 'object' && 'value' in value) {
        return (value as Ref<T>).value
      }
      return value as T
    },

    isRef: (value: unknown): boolean => {
      return (
        value !== null &&
        typeof value === 'object' &&
        RASEN_REF_SYMBOL in value
      )
    }
  }
}

/**
 * Convenience function that creates and sets the Signals reactive runtime
 * 
 * @example
 * ```ts
 * import { useReactiveRuntime } from '@rasenjs/reactive-signals'
 * 
 * useReactiveRuntime()
 * ```
 */
export function useReactiveRuntime(): void {
  setReactiveRuntime(createReactiveRuntime())
}

// Get or create singleton runtime
function getRuntime(): ReactiveRuntime {
  if (!runtime) {
    runtime = createReactiveRuntime()
  }
  return runtime
}

/**
 * Convenient ref function
 */
export function ref<T>(value: T): Ref<T> {
  return getRuntime().ref(value)
}

/**
 * Convenient computed function
 */
export function computed<T>(getter: () => T): ReadonlyRef<T> {
  return getRuntime().computed(getter)
}

/**
 * Convenient watch function
 */
export function watch<T>(
  source: () => T,
  callback: (newValue: T, oldValue: T) => void,
  options?: { immediate?: boolean }
): () => void {
  return getRuntime().watch(source, callback, options)
}

/**
 * Convenient unref function
 */
export function unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T {
  return getRuntime().unref(value)
}

/**
 * Convenient isRef function
 */
export function isRef(value: unknown): boolean {
  return getRuntime().isRef(value)
}
