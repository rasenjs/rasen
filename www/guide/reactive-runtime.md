# Reactive Runtime

Rasen is designed to work with any reactive system. This guide explains how reactive runtimes integrate with Rasen.

## Overview

Instead of building its own reactive system, Rasen provides a `ReactiveRuntime` interface that adapters implement:

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

## Setting Up a Runtime

Before using Rasen, you must set up a reactive runtime:

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-vue'

useReactiveRuntime()
```

This should be done once at app initialization, before mounting any components.

## Available Adapters

### Vue Reactivity

The recommended adapter for most use cases:

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref, computed, watch } from '@vue/reactivity'

useReactiveRuntime()

// Use Vue's reactive primitives directly
const count = ref(0)
const doubled = computed(() => count.value * 2)
```

### TC39 Signals

For projects preferring the emerging Signals standard:

```typescript
import { createReactiveRuntime, ref } from '@rasenjs/reactive-signals'

useReactiveRuntime()

// Use the adapter's ref
const count = ref(0)
```

## Using Reactive State

### With Vue Runtime

```typescript
import { ref, computed, reactive } from '@vue/reactivity'

// Primitive values
const count = ref(0)
const name = ref('World')

// Computed values
const greeting = computed(() => `Hello, ${name.value}!`)
const doubled = computed(() => count.value * 2)

// Reactive objects
const state = reactive({
  items: [],
  loading: false
})

// In components
const Counter = () => div({
  children: [
    span({ textContent: () => `Count: ${count.value}` }),
    span({ textContent: doubled }),  // Can pass computed directly
    span({ textContent: greeting })
  ]
})
```

### With Signals Runtime

```typescript
import { ref, computed } from '@rasenjs/reactive-signals'

const count = ref(0)
const doubled = computed(() => count.value * 2)

// Usage is the same
const Counter = () => div({
  children: [
    span({ textContent: () => `Count: ${count.value}` }),
    span({ textContent: doubled })
  ]
})
```

## PropValue Type

Rasen components accept props that can be:

1. **Static values** — Plain values that don't change
2. **Ref values** — Reactive references (mutable)
3. **Computed values** — Derived reactive values (readonly)
4. **Getter functions** — Functions that return values

```typescript
import type { PropValue } from '@rasenjs/core'

// All of these work:
div({ textContent: 'Hello' })                    // Static
div({ textContent: ref('Hello') })               // Ref
div({ textContent: computed(() => 'Hello') })    // Computed  
div({ textContent: () => 'Hello' })              // Getter
```

The component will automatically track dependencies and update when reactive values change.

## Creating a Custom Runtime

You can create adapters for any reactive library:

```typescript
import type { ReactiveRuntime } from '@rasenjs/core'
import { createSignal, createEffect, createMemo } from 'solid-js'

function createSolidRuntime(): ReactiveRuntime {
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
      
      return () => {
        // Solid handles cleanup automatically
      }
    },

    effectScope() {
      // Solid doesn't have explicit scopes
      return {
        run: (fn) => fn(),
        stop: () => {}
      }
    },

    ref(value) {
      const [get, set] = createSignal(value)
      return {
        get value() { return get() },
        set value(v) { set(v) }
      }
    },

    computed(getter) {
      const memo = createMemo(getter)
      return {
        get value() { return memo() }
      }
    },

    unref(value) {
      if (this.isRef(value)) {
        return value.value
      }
      return value
    },

    isRef(value) {
      return value && typeof value === 'object' && 'value' in value
    }
  }
}
```

## Best Practices

### 1. Initialize Early

Set the reactive runtime before any components are created:

```typescript
// main.ts
import { useReactiveRuntime } from '@rasenjs/reactive-vue'

useReactiveRuntime()

// Now safe to import and use components
import { App } from './App'
mount(App(), document.getElementById('app'))
```

### 2. Use the Library Directly

Don't import reactive primitives from Rasen — use the library directly:

```typescript
// ✅ Good
import { ref, computed } from '@vue/reactivity'

// ❌ Avoid
import { ref } from '@rasenjs/core'  // Only for internal use
```

### 3. Prefer Getters for Simple Expressions

For simple computed values, getter functions are often cleaner:

```typescript
// Both work, but getters are more concise for simple cases
div({ textContent: () => `Count: ${count.value}` })
div({ textContent: computed(() => `Count: ${count.value}`) })
```

## Next Steps

- [Render Targets](/guide/render-targets) — Learn about different hosts
- [Components](/guide/components) — Building reusable components
