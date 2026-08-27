/**
 * TC39 Signals adapter
 * Adapts TC39 Signals proposal's reactivity system to Rasen
 */

import { Signal } from 'signal-polyfill'
import { setReactiveRuntime, type ReactiveRuntime, type Ref } from '@rasenjs/core'

// The Signal itself IS the ref — a TC39 Signal.State / Signal.Computed
// subclass that ALSO exposes a `.value` accessor (delegating to get()/set()).
// The native proposal only offers get()/set(); the `.value` alias keeps the
// adapter drop-in compatible with code written against Vue-style refs.
// Detectable via `Signal.isState` / `Signal.isComputed` (subclasses pass).

/** Signal.State + `.value` 访问器（读 = get()，写 = set()） */
class StateRef<T> extends Signal.State<T> {
  get value(): T {
    return this.get()
  }

  set value(next: T) {
    this.set(next)
  }
}

/** Signal.Computed + `.value` 访问器（读 = get()） */
class ComputedRef<T> extends Signal.Computed<T> {
  get value(): T {
    return this.get()
  }
}

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
    subscribe<T>(
      getter: () => T,
      callback: (value: T, oldValue: T) => void
    ): () => void {
      let oldValue: T | undefined = undefined
      let hasPrev = false
      let stopped = false

      // The Computed ONLY computes the value — it must NOT run the callback.
      // Initial evaluation (below) establishes dependencies without firing;
      // the binding layer applies the first value itself (watchProp).
      const effect = new Signal.Computed<T | undefined>(() => {
        if (stopped) return undefined
        return getter()
      })

      const run = () => {
        if (stopped) return
        const newValue = effect.get() as T
        if (hasPrev) {
          // Equal-value skip: unchanged computeds never re-fire callbacks,
          // keeping updates O(changed) instead of O(subscribers)
          // (e.g. 1000 rows watching one `selected` signal).
          if (!Object.is(newValue, oldValue)) {
            const old = oldValue as T
            oldValue = newValue
            callback(newValue, old)
            return
          }
        } else {
          hasPrev = true
        }
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
      // The Signal itself is the ref — Signal.State plus a `.value` alias.
      return new StateRef(value) as unknown as Ref<T>
    },

    unref: <T>(value: T | Ref<T> | Ref<T>): T => {
      // The ref IS the Signal itself: read via Signal.get().
      if (value && typeof value === 'object') {
        if (Signal.isState(value) || Signal.isComputed(value)) {
          return (value as unknown as Signal.State<T> | Signal.Computed<T>).get()
        }
      }
      return value as T
    },

    setValue: <T>(ref: Ref<T>, value: T): void => {
      // The ref IS the Signal itself: write via Signal.set().
      if (Signal.isState(ref)) {
        ;(ref as unknown as Signal.State<T>).set(value)
      }
    },

    isRef: (value: unknown): boolean => {
      // The ref IS the Signal itself — detect via TC39 Signal type guards.
      return (
        value !== null &&
        typeof value === 'object' &&
        (Signal.isState(value) || Signal.isComputed(value))
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
 * Convenient ref function — creates a Signal via the active runtime.
 *
 * The returned type is core's `Ref<T>`, which this package augments to
 * extend the real `StateRef<T>` (a `Signal.State` subclass with a `.value`
 * alias — see the `declare module` below), so `.value` / `.get()` / `.set()`
 * all work directly.
 */
export function ref<T>(value: T): Ref<T> {
  return getRuntime().ref(value)
}

/**
 * Convenient computed function — returns the REAL Signal type
 * (`ComputedRef<T>`, a `Signal.Computed` subclass with a `.value` alias).
 */
export function computed<T>(getter: () => T): ComputedRef<T> {
  return new ComputedRef(getter)
}

/**
 * Convenient unref function
 */
export function unref<T>(value: T | Ref<T> | Ref<T>): T {
  return getRuntime().unref(value)
}

/**
 * Convenient isRef function
 */
export function isRef(value: unknown): boolean {
  return getRuntime().isRef(value)
}

/**
 * 模块增强：让 core 的占位 `Ref<T>` 变成真实的 Signal 类型。
 *
 * 用户引入本包后，core 的 `Ref<T>` 即 `StateRef<T>`（`Signal.State`
 * 子类 + `.value` 别名），`.value` / `.get()` / `.set()` 直接可用，
 * 且与组件 props 期望的 core `Ref<T>` 完全一致。
 */
declare module '@rasenjs/core' {
  interface Ref<T> extends StateRef<T> {}
}
