# @rasenjs/core

Core runtime and type definitions for the Rasen reactive rendering framework.

## Installation

```bash
npm install @rasenjs/core
```

## Overview

\`@rasenjs/core\` provides:

- **Reactive Runtime Interface** - Abstract interface for reactive systems
- **Component Types** - Type definitions for components and mount functions
- **Runtime Management** - Global reactive runtime configuration

## Reactive Runtime

Rasen is reactive-system agnostic. You need to configure a reactive runtime before using components:

```typescript
import { setReactiveRuntime, getReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'

// Set the runtime (do this once at app startup)
setReactiveRuntime(createReactiveRuntime())

// Get the runtime (used internally by renderers)
const runtime = getReactiveRuntime()
```

## Component Model

### Component Types

```typescript
// Sync component - returns mount function immediately
type SyncComponent<Host, Props> = (props: Props) => (host: Host) => (() => void) | undefined

// Async component - returns mount function via Promise
type AsyncComponent<Host, Props> = (props: Props) => Promise<(host: Host) => (() => void) | undefined>

// Component can be either sync or async
type Component<Host, Props> = SyncComponent<Host, Props> | AsyncComponent<Host, Props>

// Mount function type
type MountFunction<Host> = (host: Host) => (() => void) | undefined
```

### The `com` Wrapper Function

The `com` function wraps your setup logic with automatic effect scope management. It ensures that all reactive watchers created during component setup are properly cleaned up on unmount, preventing memory leaks.

```typescript
import { com, getReactiveRuntime } from '@rasenjs/core'

// Usage: com(setupFunction)
// - setupFunction: returns a mount function
// - Automatically manages an effectScope for the component
// - All watchers created in setup are auto-cleaned on unmount

const MyComponent = com(() => {
  const runtime = getReactiveRuntime()
  const count = runtime.ref(0)
  
  // Mount function - return MountFunction directly
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

// Use the component
const cleanup = MyComponent()({} as HTMLElement)
cleanup?.() // All watchers are cleaned up
```

#### Benefits of `com`:

- **Memory Safety**: Automatic cleanup of all effects in the scope
- **Simplified Code**: No need to manually manage effectScope lifecycle
- **Leak Prevention**: Watchers are guaranteed to be disposed on unmount
- **Works with Nested Components**: Proper cleanup order for component trees

### Component Lifecycle

1. **Setup Phase** - Component function is called, reactive state is initialized
2. **Mount Phase** - Mount function is called with host, watchers are set up
3. **Update Phase** - Watchers trigger updates when reactive state changes
4. **Unmount Phase** - Cleanup function is called, watchers are disposed

### Example Component

```typescript
import { getReactiveRuntime } from '@rasenjs/core'

const Counter = (props: { initial: number }) => {
  const runtime = getReactiveRuntime()
  
  // Setup: create reactive state
  const count = runtime.ref(props.initial)
  
  // Return mount function
  return div({
    children: [
      span({ textContent: () => `Count: ${count.value}` }),
      button({
        textContent: 'Increment',
        on: { click: () => count.value++ }
      })
    ]
  })
}
```

## Reactive Runtime Interface

```typescript
interface ReactiveRuntime {
  // Watch a reactive source and call callback on changes
  watch: <T>(
    source: () => T,
    callback: (value: T, oldValue: T) => void,
    options?: { immediate?: boolean }
  ) => () => void

  // Create an effect scope for cleanup
  effectScope: () => { run: (fn: () => void) => void; stop: () => void }

  // Create a reactive ref
  ref: <T>(value: T) => Ref<T>

  // Create a computed ref
  computed: <T>(getter: () => T) => ReadonlyRef<T>

  // Unwrap a ref value
  unref: <T>(value: T | Ref<T>) => T

  // Check if value is a ref
  isRef: (value: unknown) => boolean
}
```

## PropValue Type

For reactive props, use the \`PropValue\` type:

```typescript
import type { PropValue } from '@rasenjs/core'

interface MyProps {
  // Can be static value, ref, or getter function
  text: PropValue<string>
  count: PropValue<number>
}
```

## Available Adapters

- **[@rasenjs/reactive-vue](../reactive-vue)** - Vue 3 Composition API
- **[@rasenjs/reactive-signals](../reactive-signals)** - TC39 Signals proposal

## API Reference

### \`setReactiveRuntime(runtime)\`

Set the global reactive runtime.

### \`getReactiveRuntime()\`

Get the current reactive runtime. Throws if not set.

### \`hasReactiveRuntime()\`

Check if a reactive runtime has been set.

## License

MIT
