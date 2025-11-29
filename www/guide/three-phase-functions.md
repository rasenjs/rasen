# Three-Phase Functions

The core of Rasen's component model is the **three-phase function** — a simple yet powerful pattern that maps directly to component lifecycle.

## The Pattern

```typescript
const Component = (props) => {        // 📦 Phase 1: Setup
  // Initialize reactive state
  const count = ref(0)
  
  return (host) => {                  // 🔌 Phase 2: Mount
    // Mount to host, establish watchers
    const stop = watch(() => count.value, (val) => {
      // Update rendering
    })
    
    return () => {                    // 🧹 Phase 3: Unmount
      // Cleanup resources
      stop()
    }
  }
}
```

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
const Counter = () => {
  const count = ref(0)
  
  return (host: HTMLElement) => {
    // Create elements
    const container = document.createElement('div')
    const display = document.createElement('span')
    const button = document.createElement('button')
    
    button.textContent = '+'
    button.addEventListener('click', () => count.value++)
    
    // Setup reactive updates
    const stopWatch = watch(
      () => count.value,
      (value) => {
        display.textContent = `Count: ${value}`
      },
      { immediate: true }
    )
    
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

```typescript
// Under the hood, div does something like:
const div = (props) => (host: HTMLElement) => {
  const el = document.createElement('div')
  
  // Apply props, set up watchers
  if (props.textContent) {
    watchProp(() => unref(props.textContent), (v) => {
      el.textContent = v
    })
  }
  
  // Mount children
  const childUnmounts = props.children?.map(child => child(el))
  
  host.appendChild(el)
  
  return () => {
    childUnmounts?.forEach(unmount => unmount?.())
    el.remove()
  }
}
```

This means your business components can look simpler:

```typescript
// Business component - just returns the mount function from div
const Counter = () => {
  const count = ref(0)
  
  return div({
    children: [
      span({ textContent: () => `Count: ${count.value}` }),
      button({ textContent: '+', on: { click: () => count.value++ } })
    ]
  })
}
```

## Async Setup

The setup phase can be async:

```typescript
const AsyncComponent = async (props: { url: string }) => {
  // Async setup
  const data = await fetch(props.url).then(r => r.json())
  
  return (host) => {
    // Mount with fetched data
    return div({
      textContent: JSON.stringify(data)
    })(host)
  }
}
```

## Next Steps

- [Reactive Runtime](/guide/reactive-runtime) — How reactive systems integrate
- [Components](/guide/components) — Building reusable components
- [Render Targets](/guide/render-targets) — Different host types
