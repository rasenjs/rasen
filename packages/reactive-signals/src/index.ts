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
 *
 * Performance-critical: the js-framework-benchmark "select row" case creates
 * ~1000 watchers on a single `selected` signal. Naively each watcher enqueues
 * its own queueMicrotask — 1000 microtasks, 1000 re-watches, layout thrashing.
 * We batch them: all dirty watchers are collected in a Set and flushed together
 * in a single microtask, coalescing the DOM writes into one frame.
 */
export function createReactiveRuntime(): ReactiveRuntime {
  // Global batched flush — internal, no developer API change.
  // 1000 `selected` watchers share one microtask and de-duplicated re-watch.
  const pending = new Set<() => void>()
  let flushScheduled = false
  const scheduleFlush = () => {
    if (flushScheduled) return
    flushScheduled = true
    queueMicrotask(() => {
      flushScheduled = false
      const jobs = Array.from(pending)
      pending.clear()
      for (const job of jobs) job()
    })
  }

  return {
    watch<T>(
      source: (() => T) | Ref<T> | ReadonlyRef<T>,
      callback: (value: T, oldValue: T) => void,
      options?: { immediate?: boolean; deep?: boolean }
    ): () => void {
      let oldValue: T | undefined = undefined
      let isFirstRun = true
      let stopped = false

      // The Computed ONLY computes the value — it must NOT run the callback.
      const effect = new Signal.Computed<T | undefined>(() => {
        if (stopped) return undefined
        return typeof source === 'function' ? source() : (source as Ref<T>).value
      })

      const run = () => {
        if (stopped) return
        const newValue = effect.get() as T
        if (!isFirstRun && oldValue !== undefined) {
          callback(newValue, oldValue)
        } else if (options?.immediate) {
          callback(newValue, newValue)
        }
        isFirstRun = false
        oldValue = newValue
      }

      // Each watcher contributes its `run` to the shared batched queue.
      const batchedRun = () => {
        if (stopped) return
        run()
        if (!stopped) watcher.watch(effect)
      }

      const watcher = new Signal.subtle.Watcher(() => {
        if (stopped) return
        pending.add(batchedRun)
        scheduleFlush()
      })

      watcher.watch(effect)

      // Initial execution to establish dependencies and trigger immediate callback.
      // Must also ensure effect is watched after get() re-validates it.
      run()
      watcher.watch(effect)

      const stopFn = () => {
        stopped = true
        pending.delete(batchedRun)
        watcher.unwatch(effect)
      }

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

    unref: <T>(value: T | Ref<T> | ReadonlyRef<T>): T => {
      // Vue 语义：只解包 ref，不调用 getter（getter 由 core 的 toValue 处理）
      if (value && typeof value === 'object' && 'value' in value) {
        return (value as Ref<T>).value
      }
      return value as T
    },

    setValue: <T>(ref: Ref<T>, value: T): void => {
      ;(ref as { value: T }).value = value
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
