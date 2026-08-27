/**
 * Shared test helpers: mock reactive runtime (same contract as core tests)
 */

import type { ReactiveRuntime, Ref } from '@rasenjs/core'

export function createMockReactiveRuntime(): ReactiveRuntime & {
  triggerWatchers: () => void
} {
  const watchers: Array<{
    source: () => unknown
    callback: (value: unknown, oldValue: unknown) => void
  }> = []

  const refs = new WeakSet<{ value: unknown }>()

  return {
    ref: <T>(value: T): Ref<T> => {
      const r = { value }
      refs.add(r)
      return r as unknown as Ref<T>
    },

    subscribe: <T>(
      source: () => T,
      callback: (value: T, oldValue: T) => void
    ) => {
      const watcher = {
        source: source as () => unknown,
        callback: callback as (value: unknown, oldValue: unknown) => void,
      }
      watchers.push(watcher)
      return () => {
        const index = watchers.indexOf(watcher)
        if (index > -1) watchers.splice(index, 1)
      }
    },

    effectScope: () => ({
      run: <T>(fn: () => T) => fn(),
      stop: () => {},
    }),

    unref: <T>(value: T | Ref<T>) => {
      if (value && typeof value === 'object' && 'value' in value) {
        return (value as unknown as { value: T }).value
      }
      return value as T
    },

    setValue: <T>(ref: Ref<T>, value: T): void => {
      ;(ref as unknown as { value: T }).value = value
    },

    isRef: (value: unknown): boolean => {
      return (
        value !== null &&
        typeof value === 'object' &&
        refs.has(value as { value: unknown })
      )
    },

    triggerWatchers: () => {
      for (const watcher of [...watchers]) {
        const newValue = watcher.source()
        watcher.callback(newValue, undefined)
      }
    },
  }
}
