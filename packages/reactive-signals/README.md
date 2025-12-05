# @rasenjs/reactive-signals

TC39 Signals adapter for the Rasen reactive rendering framework.

## Installation

```bash
npm install @rasenjs/reactive-signals @rasenjs/core signal-polyfill
```

## Overview

`@rasenjs/reactive-signals` adapts the [TC39 Signals proposal](https://github.com/tc39/proposal-signals) for use with Rasen, using the `signal-polyfill` package.

## Quick Start

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime, ref, computed } from '@rasenjs/reactive-signals'

// Setup runtime (do this once at app startup)
setReactiveRuntime(createReactiveRuntime())

// Use Signals-based reactivity
const count = ref(0)
const double = computed(() => count.value * 2)

console.log(double.value) // 0
count.value = 5
console.log(double.value) // 10
```

## API

### `createReactiveRuntime()`

Creates a Rasen-compatible reactive runtime using TC39 Signals.

```typescript
import { createReactiveRuntime } from '@rasenjs/reactive-signals'
import { setReactiveRuntime } from '@rasenjs/core'

const runtime = createReactiveRuntime()
setReactiveRuntime(runtime)
```

### `ref(initialValue)`

Creates a mutable signal (state).

```typescript
import { ref } from '@rasenjs/reactive-signals'

const count = ref(0)
console.log(count.value) // 0

count.value = 10
console.log(count.value) // 10
```

### `computed(getter)`

Creates a computed signal (derived state).

```typescript
import { ref, computed } from '@rasenjs/reactive-signals'

const firstName = ref('John')
const lastName = ref('Doe')

const fullName = computed(() => `${firstName.value} ${lastName.value}`)
console.log(fullName.value) // 'John Doe'

firstName.value = 'Jane'
console.log(fullName.value) // 'Jane Doe'
```

### `watch(source, callback, options?)`

Watches a reactive source and calls callback on changes.

```typescript
import { ref, watch } from '@rasenjs/reactive-signals'

const count = ref(0)

const stop = watch(
  () => count.value,
  (newValue, oldValue) => {
    console.log(`Changed from ${oldValue} to ${newValue}`)
  }
)

count.value = 1 // Logs: "Changed from 0 to 1"

// Stop watching
stop()
```

#### Watch Options

```typescript
watch(source, callback, {
  immediate: true  // Call immediately with current value
})
```

### `effectScope()`

Creates an effect scope to manage multiple reactive effects and watchers as a group. All watchers created within the scope are automatically cleaned up when `stop()` is called.

```typescript
import { ref, effectScope } from '@rasenjs/reactive-signals'

const count = ref(0)
const scope = effectScope()

scope.run(() => {
  // All watchers created here are collected by the scope
  watch(() => count.value, (val) => console.log('Watch 1:', val))
  watch(() => count.value * 2, (val) => console.log('Watch 2:', val))
})

count.value = 1 // Logs both watchers

// Clean up all watchers in the scope at once
scope.stop()

count.value = 2 // No logs - watchers are cleaned up
```

#### Key Features:

- **Automatic Collection**: All watchers created in `scope.run()` are automatically tracked
- **Batch Cleanup**: `scope.stop()` cleans up all watchers together
- **Memory Safe**: Prevents memory leaks in long-lived applications
- **Composable**: Scopes can be nested

#### Use with Components:

The `com` wrapper from `@rasenjs/core` automatically manages a scope for you:

```typescript
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, span, button } from '@rasenjs/dom'

const MyComponent = com(() => {
  const runtime = getReactiveRuntime()
  const count = runtime.ref(0)
  
  // All watchers are automatically collected
  return div({
    children: [
      span({ textContent: () => `Count: ${count.value}` }),
      button({
        textContent: 'Increment',
        on: { click: () => count.value++ }
      })
    ]
  })
})
```

## With Rasen Components

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime, ref, computed } from '@rasenjs/reactive-signals'
import { div, button, mount } from '@rasenjs/dom'

setReactiveRuntime(createReactiveRuntime())

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

The Signals runtime implements the Rasen `ReactiveRuntime` interface:

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

## Why TC39 Signals?

- **Future Standard** - Will be native JavaScript
- **Minimal Bundle** - Smaller than full reactive libraries
- **Framework Agnostic** - Standard across all frameworks
- **Performance** - Optimized for modern JavaScript engines

## About signal-polyfill

This package uses [signal-polyfill](https://github.com/nicolo-ribaudo/signal-polyfill) which implements the TC39 Signals proposal. When Signals become native in JavaScript, you can remove the polyfill.

## License

MIT
