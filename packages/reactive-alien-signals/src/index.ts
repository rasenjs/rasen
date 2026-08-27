/**
 * alien-signals adapter
 * Adapts the alien-signals reactivity system (the push-pull signal core used
 * by Vue Language Tools and ported into Vue 3.6) to Rasen.
 *
 * The signal itself IS the ref — a plain alien-signals `signal()` callable,
 * read via `sig()` and written via `sig(value)`. Rasen's Ref type is opaque
 * (it does not mandate a `.value` property), so the raw callable serves as
 * the ref without any wrapper object. Refs are detected through
 * alien-signals' own `isSignal` / `isComputed` guards.
 */

// All alien-signals imports are prefixed like the Vue adapter does, so the
// standalone convenience exports below (e.g. `computed`) never shadow them.
import {
  effect as alienEffect,
  effectScope as alienEffectScope,
  isComputed as alienIsComputed,
  isSignal as alienIsSignal,
  signal as alienSignal
} from 'alien-signals'
import { setReactiveRuntime, type ReactiveRuntime, type Ref } from '@rasenjs/core'

/**
 * Shape of an alien-signals writable signal: a callable that reads with no
 * arguments and writes with one.
 */
interface SignalCallable<T> {
  (): T
  (value: T): void
}

/**
 * Type guard: is this value an alien-signals signal or computed callable?
 * Plain functions never match — the guards compare against alien-signals'
 * own bound-method names.
 */
function isSignalCallable(value: unknown): boolean {
  return (
    typeof value === 'function' &&
    (alienIsSignal(value as () => void) || alienIsComputed(value as () => void))
  )
}

/**
 * Reads a ref-or-plain value. Plain values (including plain functions) are
 * returned as-is; only genuine alien-signals callables are invoked.
 */
function readRef<T>(value: T | Ref<T>): T {
  if (isSignalCallable(value)) {
    return (value as unknown as SignalCallable<T>)()
  }
  return value as T
}

// Create singleton runtime (lazily initialized)
let runtime: ReactiveRuntime | undefined

// Batched delivery queue — internal, no developer API change.
// One write can dirty N watchers (the js-framework-benchmark select-row case
// wakes ~1000 row watchers at once). Coalescing all pending deliveries into
// a SINGLE microtask flush removes per-watcher scheduling overhead.
const pendingJobs = new Set<() => void>()
let flushScheduled = false

function scheduleJob(job: () => void): void {
  pendingJobs.add(job)
  if (flushScheduled) return
  flushScheduled = true
  queueMicrotask(() => {
    flushScheduled = false
    const jobs = Array.from(pendingJobs)
    pendingJobs.clear()
    for (const job of jobs) job()
  })
}

/**
 * Shared value-subscription machinery for watch/subscribe: a Computed
 * isolates dependency tracking to the source read (never the callback), and
 * delivery goes through the shared batched microtask flush so N woken
 * watchers share one microtask. The first effect run only records the
 * baseline — callbacks fire on subsequent CHANGES (Object.is-gated). Static
 * sources (a getter reading no signals) yield a Computed that never dirties,
 * so the effect runs its baseline once and nothing ever fires — matching the
 * subscribe contract's static-tolerance clause at zero extra cost.
 *
 * WHY MICROTASK DELIVERY IS MANDATORY (verified by A/B, do not "optimize" to
 * synchronous callbacks): with sync delivery, a list-level subscription's
 * callback — each's diff — runs INSIDE the signal propagation pass. Creating
 * new subscriptions while propagation is in flight corrupts registration on
 * the signals those getters read: rows mounted during that diff never join
 * `selected`'s notified subscriber list, so later selection writes silently
 * reach zero rows (benchmark select broke, swap/clear only looked faster
 * because the diff skipped the microtask boundary). Deferred delivery keeps
 * subscription creation out of the propagation pass.
 */
function createValueSubscription<T>(
  readSource: () => T,
  callback: (value: T, oldValue: T) => void
): () => void {
  let oldValue: T | undefined
  let stopped = false
  // First effect run only establishes the dependency edge; delivery jobs are
  // scheduled on subsequent runs only. Without this gate a static source's
  // single queued job would still pull whatever the source returns at flush
  // time — including non-reactive external changes — and fire spuriously.
  let armed = false

  // Baseline is seeded synchronously at subscription time (NOT via the job
  // queue): a test may write immediately after subscribing without flushing,
  // and the pull-style job would then conflate the baseline with the real
  // change, silently dropping the callback.
  oldValue = readSource()

  // Stable job closure (allocated once per subscription, never per trigger).
  // The value is PULLED at flush time so N triggers of the same signal
  // coalesce into one read, and unchanged rows skip the callback entirely.
  const job = () => {
    if (stopped) return
    const newValue = readSource()
    if (!Object.is(newValue, oldValue)) {
      const prev = oldValue as T
      oldValue = newValue
      callback(newValue, prev)
    }
  }

  const stopEffect = alienEffect(() => {
    // Reading the source here establishes this effect's dependency edge;
    // delivery is deferred to the shared microtask flush (see the mandatory
    // microtask note above — sync callbacks corrupt in-flight propagation).
    readSource()
    if (armed) {
      scheduleJob(job)
    } else {
      armed = true
    }
  })

  return () => {
    stopped = true
    stopEffect()
  }
}

/**
 * Creates an alien-signals reactive runtime
 *
 * Watch design mirrors the TC39 adapter: dependency tracking is isolated to
 * the source read (via a Computed), and the user callback is delivered in a
 * microtask so reads/writes inside the callback never become hidden
 * dependencies of the watcher. Callbacks whose value did not actually change
 * (Object.is) are skipped, keeping updates O(changed) instead of
 * O(subscribers).
 */
export function createReactiveRuntime(): ReactiveRuntime {
  return {
    /**
     * 渲染层订阅原语（契约见 ReactiveRuntime.subscribe）。依赖追踪隔离在
     * source 读取内（经 Computed），投递走共享微任务批处理；静态源（getter
     * 不读任何 signal）的 Computed 永不失效，effect 只跑基线一次——回调
     * 自然永不触发。
     */
    subscribe<T>(
      getter: () => T,
      onChange: (value: T, oldValue: T) => void
    ): () => void {
      return createValueSubscription(getter, onChange)
    },

    effectScope() {
      // Each run() creates an alien-signals scope; effects created
      // synchronously inside link to it and are disposed by its stop handle.
      // Nested scopes chain naturally through alien-signals' active-sub stack.
      const stops: (() => void)[] = []
      let isActive = true
      return {
        run: <T>(fn: () => T): T | undefined => {
          if (!isActive) return undefined
          let result: T | undefined
          stops.push(
            alienEffectScope(() => {
              result = fn()
            })
          )
          return result
        },
        stop: () => {
          if (!isActive) return
          isActive = false
          for (const stopInner of stops) stopInner()
          stops.length = 0
        }
      }
    },

    ref: <T>(value: T): Ref<T> => {
      // The signal itself is the ref — a plain alien-signals callable.
      return alienSignal(value) as unknown as Ref<T>
    },

    unref: readRef,

    setValue: <T>(ref: Ref<T>, value: T): void => {
      // The ref IS the signal callable: write via sig(value).
      if (isSignalCallable(ref)) {
        ;(ref as unknown as SignalCallable<T>)(value)
      }
    },

    isRef: isSignalCallable
  }
}

/**
 * Convenience function that creates and sets the alien-signals reactive runtime
 *
 * @example
 * ```ts
 * import { useReactiveRuntime } from '@rasenjs/reactive-alien-signals'
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
 * Convenient unref function
 */
export function unref<T>(value: T | Ref<T>): T {
  return getRuntime().unref(value)
}

/**
 * Convenient isRef function
 */
export function isRef(value: unknown): boolean {
  return getRuntime().isRef(value)
}

/**
 * 模块增强：让 core 的占位 `Ref<T>` 变成真实的 alien-signals 类型。
 *
 * 用户引入本包后，core 的 `Ref<T>` 即 `SignalCallable<T>`（可调用信号：
 * `()` 读、`(v)` 写），与组件 props 期望的 core `Ref<T>` 完全一致。
 */
declare module '@rasenjs/core' {
  interface Ref<T> extends SignalCallable<T> {}
}
