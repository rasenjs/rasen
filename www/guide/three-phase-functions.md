# Three-Phase Functions

The core of Rasen's component model is the **three-phase function** — a simple yet powerful pattern that maps directly to component lifecycle.

## The Pattern

```typescript
const Component = (props) => {        // 📦 Phase 1: Setup
  // Initialize reactive state
  const count = ref(0)

  return (host) => {                  // 🔌 Phase 2: Mount
    // Mount to host, establish subscriptions
    const stop = getReactiveRuntime().subscribe(count, (value) => {
      // Update the host's representation
    })

    return () => {                    // 🧹 Phase 3: Unmount
      // Cleanup resources
      stop()
    }
  }
}
```

Everything you build on top of the paradigm — the element factories, `when`,
`each`, a compiled template — is just a `Mountable` with phases like these.

## Phase 1: Setup

The outermost function is called during component creation. This is where you:

- Receive props
- Initialize reactive state
- Compute derived values
- Prepare anything that should exist before mounting

```typescript
const UserCard = (props: { userId: string }) => {
  // Setup phase: create reactive state
  const user = ref<User | null>(null)
  const loading = ref(true)
  const error = ref<Error | null>(null)
  
  // Can also do async work
  fetchUser(props.userId)
    .then(data => user.value = data)
    .catch(err => error.value = err)
    .finally(() => loading.value = false)
  
  return (host) => {
    // Mount phase...
  }
}
```

## Phase 2: Mount

The second function is called when the component is mounted to a host. This is where you:

- Create DOM elements or other host representations
- Set up watchers for reactive updates
- Attach event listeners
- Initialize side effects

```typescript
import { getReactiveRuntime, ref } from '@rasenjs/core'

const Counter = () => {
  // core's built-in ref is callable: count() reads, count(v) writes
  const count = ref(0)

  return (host: HTMLElement) => {
    // Create elements
    const container = document.createElement('div')
    const display = document.createElement('span')
    const button = document.createElement('button')

    button.textContent = '+'
    button.addEventListener('click', () => count(count() + 1))

    // Setup reactive updates. subscribe() has no `immediate` option — the
    // callback never fires for the initial value, so write it yourself.
    display.textContent = `Count: ${count()}`
    const stopWatch = getReactiveRuntime().subscribe(count, (value) => {
      display.textContent = `Count: ${value}`
    })

    // Mount to host
    container.appendChild(display)
    container.appendChild(button)
    host.appendChild(container)

    return () => {
      // Unmount phase...
    }
  }
}
```

If the component is wrapped in `com()` you do not have to keep the stop
function around: subscriptions created during mount are collected into the
component's effect scope and stopped on unmount.

## Phase 3: Unmount

The innermost function is called when the component is removed. This is where you:

- Stop watchers
- Remove event listeners
- Clean up any resources
- Remove DOM elements

```typescript
return () => {
  // Stop all watchers
  stopWatch()
  
  // Remove event listeners
  button.removeEventListener('click', handleClick)
  
  // Remove from DOM
  container.remove()
  
  // Clean up any other resources
  abortController.abort()
}
```

## Why Three Phases?

### 1. Closures Naturally Isolate State

Each phase creates a closure that captures variables from the previous phase. This means:

- Setup state is accessible in mount and unmount
- Mount-time variables (like DOM elements) are accessible in unmount
- No need to store references in class properties or hooks

```typescript
const Timer = () => {
  const elapsed = ref(0)           // Captured by mount phase
  
  return (host) => {
    let intervalId: number         // Captured by unmount phase
    
    intervalId = setInterval(() => {
      elapsed.value++
    }, 1000)
    
    // ... mount logic
    
    return () => {
      clearInterval(intervalId)    // Can access intervalId
    }
  }
}
```

### 2. Avoids React's Stale Closure Problem

In React, the stale closure problem occurs because:

```javascript
// React - problematic
function Counter() {
  const [count, setCount] = useState(0)
  
  useEffect(() => {
    const id = setInterval(() => {
      console.log(count)  // Always logs initial value!
    }, 1000)
    return () => clearInterval(id)
  }, [])  // Empty deps = stale closure
  
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
```

In Rasen, this doesn't happen because:

```typescript
// Rasen - works correctly
const Counter = () => {
  const count = ref(0)  // Reactive reference, not a value
  
  return (host) => {
    const id = setInterval(() => {
      console.log(count.value)  // Always reads current value!
    }, 1000)
    
    // ... mount logic
    
    return () => clearInterval(id)
  }
}
```

### 3. Lifecycle Is Visible in Code Structure

The nesting of functions directly shows the lifecycle:

```typescript
const Component = (props) => {
  // SETUP: Runs once when component is created
  
  return (host) => {
    // MOUNT: Runs once when mounted to host
    
    return () => {
      // UNMOUNT: Runs once when removed
    }
  }
}
```

No need to remember which lifecycle hook to use or when it fires.

## Working with Primitive Components

Primitive components (like `div`, `button`) simplify this pattern by encapsulating the mount logic:

Under the hood a factory is doing exactly what Phase 2 describes: create the
element, apply every prop through the host's binding layer (a static value is
written once, a ref or getter becomes a subscription), mount its children, and
return a cleanup that stops the bindings and removes the element.

This means your business components can look simpler:

```tsx
import { Signal } from 'signal-polyfill'
import { com } from '@rasenjs/core'
import { div, span, button } from '@rasenjs/dom'

// Business component — just returns the mountable from div()
const Counter = com(() => {
  const count = new Signal.State(0)

  return div(
    {},
    span({}, 'Count: ', count),                        // ref child → reactive text
    button({ onClick: () => count.set(count.get() + 1) }, '+')
  )
})
```

…and with JSX the same component reads:

```tsx
const Counter = com(() => {
  const count = new Signal.State(0)
  return (
    <div>
      <span>Count: {count}</span>
      <button onClick={() => count.set(count.get() + 1)}>+</button>
    </div>
  )
})
```

## Async setup

The setup phase may be async: `com()` detects a returned Promise and adapts the
component into `Promise<Mountable>`. Hosts mount synchronously, so an async
component is not mounted directly as a child — reach for `lazy()`, which owns
the pending / error states:

```typescript
import { lazy } from '@rasenjs/core'

// loader() resolves to the mountable to render
const UserCard = lazy({
  loader: () => import('./UserCard').then((m) => m.UserCard({ userId })),
  loading: () => spinner()
})
```

If your host drives its own async boundary (the SSR pipeline awaits before
serializing), the raw form is available:

```typescript
const AsyncComponent = com(async (props: { url: string }) => {
  const data = await fetch(props.url).then((r) => r.json())
  return (host: HTMLElement) => div({}, JSON.stringify(data))(host)
})

// the caller awaits, then mounts
const mountable = await AsyncComponent({ url: '/api/user' })
mount(mountable, document.getElementById('app')!)
```

## Next Steps

- [Reactive Runtime](/guide/reactive-runtime) — How reactive systems integrate
- [Components](/guide/components) — Building reusable components
- [Render Targets](/guide/render-targets) — Different host types
