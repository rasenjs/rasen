# 🌀 Rasen Design Philosophy

> **らせん (Rasen)** — Japanese for "Spiral". Inspired by the anime *Tengen Toppa Gurren Lagann*, where spiral energy represents the power to break through all limits.

## Why Rasen?

Modern frontend frameworks are mature, but we've observed several fundamental issues:

### 1. Reinventing the Reactive Wheel

Vue, Solid, Signals... Reactive systems have been nearly perfected. As framework developers, we should let users choose "the best" rather than forcing them to accept yet another homegrown reactive solution.

### 2. The Overhead of Virtual DOM

VDOM adds unnecessary complexity in many scenarios. Direct manipulation is often simpler and more efficient.

### 3. The Cross-Platform Struggle

When you need to switch from HTML to Canvas to WebGL within the same context, existing frameworks offer little help. Cross-platform rendering shouldn't be this hard.

### 4. Frameworks Are Too Narrow

Why is React limited to DOM and React Native? Why is Vue confined to DOM? The realm of graphical rendering extends far beyond these boundaries.

---

## Core Design: Dual Decoupling

Rasen's architecture is built on two fundamental decouplings:

```
┌─────────────────────────────────────────────────────────┐
│                      User Code                          │
├─────────────────────────────────────────────────────────┤
│                  Rasen Core (Paradigm)                  │
├──────────────────────┬──────────────────────────────────┤
│  Reactive Runtime    │       Render Target              │
│     Adapters         │         Adapters                 │
│  ┌────────────────┐  │  ┌─────────────────────────────┐ │
│  │ Vue Reactivity │  │  │ DOM / Canvas / React Native │ │
│  │ TC39 Signals   │  │  │ HTML(SSR) / WebGL / ...     │ │
│  │ Any reactive   │  │  │ Any mountable target...     │ │
│  └────────────────┘  │  └─────────────────────────────┘ │
└──────────────────────┴──────────────────────────────────┘
```

### Reactive Decoupling

We don't create a new reactive system. Through the `ReactiveRuntime` interface, users choose freely:

```typescript
// Use Vue's reactivity
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
useReactiveRuntime()

// Or use TC39 Signals
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
useReactiveRuntime()
```

### Render Target Decoupling

Through the unified `MountFunction<Host>` pattern, the same component paradigm renders to any target:

```typescript
// DOM
const Button = () => div({ children: [...] })

// Canvas 2D  
const Circle = () => circle({ x: 100, y: 100, radius: 50 })

// React Native
const Card = () => view({ style: {...}, children: [...] })

// HTML (SSR/SSG)
const Page = () => html({ children: [...] })
```

---

## Three-Phase Functions: Lifecycle as Closures

A Rasen component is a **three-phase function**, each phase corresponding to a lifecycle stage:

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

### Why This Design?

**1. Closures Naturally Isolate — Avoiding React's Stale Closure Problem**

React Hooks' stale closure issue stems from function components re-executing on every render. Rasen's three-layer closure structure inherently avoids this — each lifecycle phase has its own isolated closure scope.

**2. Lifecycle Is Visible**

No need to memorize `useEffect` dependency array rules. No need to understand when `onMounted` vs `onUnmounted` fires. The nested function structure directly expresses the lifecycle hierarchy.

**3. Composition Over Inheritance**

Components are functions. Functions compose freely. No classes, no `extends`, no `mixins`.

---

## Self-Controlled Rendering: Components as Mounters

Traditional framework rendering flow:

```
Component declares tags → Framework collects → Framework schedules → Framework operates host
```

Rasen's rendering flow:

```
Component receives host → Component decides how to mount
```

### Host Passes Down the Chain

The host isn't a black box inside the framework. It passes down the mount chain to every component:

```typescript
// Primitive component: directly operates the host
const div = (props) => (host: HTMLElement) => {
  const el = document.createElement('div')
  host.appendChild(el)
  // ...set attributes, events, children
  return () => el.remove()
}

// Business component: appears as a single-layer function
const Counter = () => div({
  children: [
    span({ textContent: count }),
    button({ onClick: increment, children: '+' })
  ]
})
```

### The `com` Wrapper: Automatic EffectScope Management

Due to the reactive scope implementation, components with watchers or other effects require **an extra nesting layer** to automatically manage the effect scope lifecycle. Rasen provides the `com` wrapper to automate this pattern.

**The Problem:**

```typescript
// Without com: manual effectScope management required
const Counter = (props) => {
  const runtime = getReactiveRuntime()
  const count = runtime.ref(0)
  const scope = runtime.effectScope()  // ← Extra layer needed
  
  return (host: HTMLElement) => {
    return scope.run(() => {
      // All watchers must be registered in this scope
      runtime.watch(() => count.value, (val) => {
        // Update rendering based on watched value
      }, { immediate: true })
      
      return () => scope.stop()  // ← Must manually stop
    })
  }
}
```

**The Solution:**

```typescript
// With com: automatic scope management
const Counter = com(() => {
  const runtime = getReactiveRuntime()
  const count = runtime.ref(0)
  
  // Return MountFunction directly - scope is automatically managed
  return div({
    children: [
      span({ textContent: () => `Count: ${count.value}` }),
      button({
        textContent: 'Increment',
        on: { click: () => count.value++ }
      })
    ]
  })
  
  // Scope is automatically stopped when component unmounts
})
```

**Why `com` Matters:**

1. **Eliminates Boilerplate** — No need for `effectScope()` and `scope.run()`
2. **Guaranteed Cleanup** — Effects are automatically stopped on unmount, preventing memory leaks
3. **Correct Lifecycle** — User cleanup runs before scope stops, ensuring proper resource release
4. **Clearer Intent** — Using `com` signals "this component has reactive side effects"

For any component using `watch`, `effect`, or similar lifecycle-dependent reactive APIs, **`com` is not optional—it's the idiomatic pattern**. While technically you could manage scopes manually, doing so is error-prone and defeats the clarity of Rasen's design.

### Unified Components

In Rasen, **business components and primitive components have no fundamental difference**. `div`, `view`, `circle` — these "tags" are also component functions; they just encapsulate host operations.

Benefits:
- No distinction between "native components" and "custom components"
- Primitive component implementation is transparent, freely extensible
- Business components appear as single-layer functions (primitives encapsulate mount logic)
- `com` wrapper enables idiomatic business component definition

---

## Minimal Core, Infinite Possibilities

Rasen's core code is extremely small — **nearly zero**. Because what it delivers isn't code, but a **paradigm**.

### The Essence of the Paradigm

```typescript
type MountFunction<Host> = (host: Host) => (() => void) | undefined
```

Anything with a concept of "mount" and "unmount" can use Rasen's pattern:

| Render Target | Host Type | Examples |
|--------------|-----------|----------|
| DOM | `HTMLElement` | `div`, `span`, `button` |
| Canvas 2D | `CanvasRenderingContext2D` | `rect`, `circle`, `text` |
| React Native | `Container` (Fabric) | `view`, `text`, `image` |
| HTML (SSR) | `string[]` | String concatenation |
| WebGL | `WebGLRenderingContext` | Shaders, meshes |
| Three.js | `Scene` | 3D objects |
| Terminal TUI | `Terminal` | Text interfaces |
| File Generation | `FileWriter` | Any file format |

**Rasen has no boundaries** — because it's just a paradigm.

---

## Positioning: Universal Graphical Rendering Paradigm for JS

Rasen isn't just another frontend framework.

Our vision spans the entire **graphical rendering domain within JavaScript execution environments**:

- DOM/HTML is just one of many render targets
- On par with Canvas, WebGL, React Native, Terminal
- Long-term goal: become the universal rendering layer for the JS ecosystem

```
                    ┌───────────────────┐
                    │  Rasen Paradigm   │
                    └────────┬──────────┘
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
      ┌────────┐        ┌────────┐        ┌────────┐
      │  DOM   │        │ Canvas │        │   RN   │  ...
      └────────┘        └────────┘        └────────┘
```

---

## Comparison with Other Frameworks

| Feature | React | Vue | Solid | Rasen |
|---------|-------|-----|-------|-------|
| Virtual DOM | ✅ | ✅ | ❌ | ❌ |
| Built-in Reactivity | ❌ (Hooks) | ✅ | ✅ | ❌ (Pluggable) |
| Cross Render Targets | Limited | ❌ | ❌ | ✅ Core Design |
| Closure Pitfalls | Common | Rare | Rare | Structurally Avoided |
| Core Size | Large | Medium | Small | Minimal |
| Learning Curve | Steep | Moderate | Moderate | Gentle |

**Rasen doesn't aim to replace these frameworks** — it provides a lower-level, more flexible paradigm, letting developers choose freely based on their scenarios.

---

## Summary

> **One Reactive Core, Multiple Render Targets**

Rasen's core philosophy:

1. **Don't Reinvent Wheels** — Use the best existing reactive systems
2. **Don't Over-Engineer** — Abandon VDOM, operate directly
3. **Set No Boundaries** — Render to any mountable target
4. **Solve Closures with Closures** — Three-phase functions, clear lifecycle
5. **Paradigm Over Implementation** — Minimal core, infinite possibilities

Like the spiral energy in *Tengen Toppa Gurren Lagann*, Rasen pursues **constant breakthrough** — breaking through framework boundaries, rendering limitations, and the very definition of frontend.
