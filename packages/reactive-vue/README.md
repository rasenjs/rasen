# @rasenjs/reactive-vue

Vue 3 reactivity adapter for the Rasen reactive rendering framework.

## Installation

```bash
npm install @rasenjs/reactive-vue @rasenjs/core @vue/reactivity
```

## Overview

`@rasenjs/reactive-vue` adapts Vue 3's Composition API reactivity system for use with Rasen.

## Quick Start

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref, computed, watch } from '@vue/reactivity'

// Setup runtime (do this once at app startup)
useReactiveRuntime()

// Now you can use Vue reactivity with Rasen components
const count = ref(0)
const double = computed(() => count.value * 2)

watch(count, (newVal, oldVal) => {
  console.log(`Count changed from ${oldVal} to ${newVal}`)
})
```

## API

### `createReactiveRuntime()`

Creates a Rasen-compatible reactive runtime using Vue 3's reactivity system.

```typescript
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { setReactiveRuntime } from '@rasenjs/core'

const runtime = createReactiveRuntime()
setReactiveRuntime(runtime)
```

## Using Vue Reactivity

Once the runtime is set, import Vue's reactivity APIs directly:

```typescript
import { ref, computed, reactive, watch, watchEffect } from '@vue/reactivity'

// Refs
const count = ref(0)
count.value++

// Computed
const doubled = computed(() => count.value * 2)

// Reactive objects
const state = reactive({
  items: [],
  loading: false
})

// Watch
watch(count, (value) => {
  console.log('Count:', value)
})

// Watch Effect
watchEffect(() => {
  console.log('Count is:', count.value)
})
```

## With Rasen Components

```typescript
import { ref, computed } from '@vue/reactivity'
import { div, button, mount } from '@rasenjs/dom'

const count = ref(0)

const Counter = () => div({
  children: [
    div({ textContent: computed(() => `Count: ${count.value}`) }),
    button({
      textContent: 'Increment',
      on: { click: () => count.value++ }
    })
  ]
})

mount(Counter(), document.getElementById('app'))
```

## Runtime Interface

The Vue runtime implements the Rasen `ReactiveRuntime` interface:

```typescript
interface ReactiveRuntime {
  watch: (source, callback, options?) => stopHandle
  effectScope: () => { run, stop }
  ref: (value) => Ref
  computed: (getter) => ComputedRef
  unref: (value) => unwrappedValue
  isRef: (value) => boolean
}
```

## Why Vue Reactivity?

- **Mature & Battle-tested** - Used in production by millions
- **Fine-grained** - Only re-runs what needs to update
- **Familiar API** - If you know Vue, you know this
- **Great DevTools** - Vue DevTools work with the reactivity system

## License

MIT
