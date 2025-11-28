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
import { createVueRuntime } from '@rasenjs/reactive-vue'

// Set the runtime (do this once at app startup)
setReactiveRuntime(createVueRuntime())

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
  return (host: HTMLElement) => {
    const scope = runtime.effectScope()
    
    scope.run(() => {
      // Watch and update
      runtime.watch(
        () => count.value,
        (value) => {
          host.textContent = \`Count: \${value}\`
        },
        { immediate: true }
      )
    })
    
    // Return cleanup function
    return () => scope.stop()
  }
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
