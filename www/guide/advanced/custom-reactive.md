# Custom Reactive Runtime

Rasen can work with any reactive system. This guide shows how to create custom adapters.

## The ReactiveRuntime Interface

```typescript
interface ReactiveRuntime {
  watch<T>(
    source: () => T,
    callback: (value: T, oldValue: T) => void,
    options?: { immediate?: boolean; deep?: boolean }
  ): () => void

  effectScope(): {
    run<T>(fn: () => T): T | undefined
    stop(): void
  }

  ref<T>(value: T): Ref<T>
  computed<T>(getter: () => T): ReadonlyRef<T>
  unref<T>(value: T | Ref<T>): T
  isRef(value: unknown): boolean
}
```

## Example: Solid.js Adapter

```typescript
import type { ReactiveRuntime } from '@rasenjs/core'
import { createSignal, createEffect, createMemo, onCleanup } from 'solid-js'

export function createSolidRuntime(): ReactiveRuntime {
  return {
    watch(source, callback, options) {
      let oldValue: any
      let isFirst = true
      
      createEffect(() => {
        const newValue = source()
        if (!isFirst || options?.immediate) {
          callback(newValue, oldValue)
        }
        oldValue = newValue
        isFirst = false
      })
      
      // Solid handles cleanup automatically via onCleanup
      return () => {}
    },

    effectScope() {
      let disposed = false
      const cleanups: (() => void)[] = []
      
      return {
        run: <T>(fn: () => T): T | undefined => {
          if (disposed) return undefined
          return fn()
        },
        stop: () => {
          disposed = true
          cleanups.forEach(fn => fn())
        }
      }
    },

    ref<T>(value: T) {
      const [get, set] = createSignal(value)
      return {
        get value() { return get() },
        set value(v: T) { set(() => v) }
      }
    },

    computed<T>(getter: () => T) {
      const memo = createMemo(getter)
      return {
        get value() { return memo() }
      }
    },

    unref<T>(value: T | { value: T }): T {
      if (this.isRef(value)) {
        return (value as { value: T }).value
      }
      return value as T
    },

    isRef(value: unknown): boolean {
      return value !== null && 
             typeof value === 'object' && 
             'value' in value
    }
  }
}
```

## Example: MobX Adapter

```typescript
import type { ReactiveRuntime } from '@rasenjs/core'
import { observable, computed as mobxComputed, autorun, runInAction } from 'mobx'

export function createMobXRuntime(): ReactiveRuntime {
  return {
    watch(source, callback, options) {
      let oldValue: any
      let isFirst = true
      
      const disposer = autorun(() => {
        const newValue = source()
        if (!isFirst || options?.immediate) {
          callback(newValue, oldValue)
        }
        oldValue = newValue
        isFirst = false
      })
      
      return disposer
    },

    effectScope() {
      const disposers: (() => void)[] = []
      let stopped = false
      
      return {
        run: <T>(fn: () => T): T | undefined => {
          if (stopped) return undefined
          return fn()
        },
        stop: () => {
          stopped = true
          disposers.forEach(d => d())
        }
      }
    },

    ref<T>(value: T) {
      const box = observable.box(value)
      return {
        get value() { return box.get() },
        set value(v: T) { runInAction(() => box.set(v)) }
      }
    },

    computed<T>(getter: () => T) {
      const comp = mobxComputed(getter)
      return {
        get value() { return comp.get() }
      }
    },

    unref<T>(value: T | { value: T }): T {
      if (this.isRef(value)) {
        return (value as { value: T }).value
      }
      return value as T
    },

    isRef(value: unknown): boolean {
      return value !== null && 
             typeof value === 'object' && 
             'value' in value
    }
  }
}
```

## Usage

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createSolidRuntime } from './solid-adapter'

setReactiveRuntime(createSolidRuntime())
```

## Implementation Tips

### 1. Handle `immediate` Option

```typescript
watch(source, callback, options) {
  if (options?.immediate) {
    callback(source(), undefined)
  }
  // Set up watching...
}
```

### 2. Return Stop Handle

```typescript
watch(source, callback) {
  const cleanup = setupEffect(...)
  return () => cleanup()
}
```

### 3. Ref Interface

Ensure your ref implementation has a getter and setter:

```typescript
ref<T>(value: T) {
  return {
    get value() { /* read */ },
    set value(v: T) { /* write */ }
  }
}
```

### 4. Computed Is Read-Only

```typescript
computed<T>(getter: () => T) {
  return {
    get value() { return getter() }
    // No setter!
  }
}
```

### 5. isRef Detection

```typescript
isRef(value: unknown): boolean {
  // Check for your specific reactive primitive
  // or fall back to duck typing
  return value !== null && 
         typeof value === 'object' && 
         'value' in value
}
```
