# Custom Reactive Runtime

Rasen can work with any reactive system. This guide shows how to create custom adapters.

## The ReactiveRuntime Interface

```typescript
interface ReactiveRuntime {
  subscribe<T>(
    getter: () => T,
    callback: (value: T, oldValue: T) => void
  ): () => void

  effectScope(): {
    run<T>(fn: () => T): T | undefined
    stop(): void
  }

  ref<T>(value: T): Ref<T>
  unref<T>(value: T | Ref<T>): T
  setValue<T>(ref: Ref<T>, value: T): void
  isRef(value: unknown): boolean
}
```

## Example: Solid.js Adapter

```typescript
import type { ReactiveRuntime, Ref } from '@rasenjs/core'
import { createSignal, createEffect, createRoot } from 'solid-js'

export function createSolidRuntime(): ReactiveRuntime {
  return {
    subscribe<T>(getter: () => T, callback: (value: T, oldValue: T) => void): () => void {
      let current = getter()
      const dispose = createRoot((dispose) => {
        createEffect(() => {
          const next = getter()
          if (!Object.is(next, current)) {
            const previous = current
            current = next
            callback(next, previous)
          }
        })
        return dispose
      })
      // subscribe() never fires with the initial value, and disposes the effect
      return dispose
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

    setValue<T>(ref: Ref<T>, value: T): void {
      ;(ref as { value: T }).value = value
    },

    unref<T>(value: T | Ref<T>): T {
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
import type { ReactiveRuntime, Ref } from '@rasenjs/core'
import { observable, autorun, runInAction } from 'mobx'

export function createMobXRuntime(): ReactiveRuntime {
  return {
    subscribe<T>(getter: () => T, callback: (value: T, oldValue: T) => void): () => void {
      let current = getter()
      return autorun(() => {
        const next = getter()
        if (!Object.is(next, current)) {
          const previous = current
          current = next
          callback(next, previous)
        }
      })
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

    setValue<T>(ref: Ref<T>, value: T): void {
      ;(ref as { value: T }).value = value
    },

    ref<T>(value: T) {
      const box = observable.box(value)
      return {
        get value() { return box.get() },
        set value(v: T) { runInAction(() => box.set(v)) }
      }
    },

    unref<T>(value: T | Ref<T>): T {
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
import { createSolidRuntime } from './solid-adapter'

setReactiveRuntime(createSolidRuntime())
```

## Implementation Tips

### 1. The initial value is the caller's business

`subscribe()` only reports *changes* — it must not fire with the value current at
Subscribe time. The contract exists so a binding can treat a static source as
a one-off write:

```typescript
subscribe<T>(getter: () => T, callback: (value: T, oldValue: T) => void): () => void {
  let current = getter()   // first evaluation collects the dependencies
  if (/* nothing was tracked */ false) return () => {}

  const stop = watchSource(() => {
    const next = getter()
    if (Object.is(next, current)) return   // equal values are skipped
    const previous = current
    current = next
    callback(next, previous)
  })

  return () => {
    stop()
    /* release whatever tracked `getter` */ 
  }
}
```

Refs are written through `setValue`, not by writing `.value` directly — the ref
shape belongs to the adapter:

```typescript
setValue<T>(ref: Ref<T>, value: T): void {
  ;(ref as { value: T }).value = value
}
```

### 2. Return Stop Handle

```typescript
subscribe(getter, callback) {
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
