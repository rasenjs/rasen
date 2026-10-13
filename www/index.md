---
layout: home

hero:
  name: '🌀 Rasen'
  text: 'One Reactive Core, Multiple Render Targets'
  tagline: A reactive rendering framework agnostic to both reactive systems and rendering targets.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Design Philosophy
      link: /guide/design-philosophy
    - theme: alt
      text: View on GitHub
      link: https://github.com/rasenjs/rasen

features:
  - icon: 🎯
    title: Cross-Platform Rendering
    details: Write once, render to DOM, Canvas 2D, React Native, HTML (SSR), and more. Same reactive logic, different render targets.
  - icon: 🔌
    title: Reactive System Agnostic
    details: Use Vue's reactivity, TC39 Signals, or any reactive library. We don't reinvent wheels — we let you choose the best.
  - icon: ⚡
    title: No Virtual DOM
    details: Direct manipulation without VDOM overhead. Components control their own rendering via watchers for maximum efficiency.
  - icon: 📦
    title: Minimal Core
    details: The core is nearly zero — it's just a paradigm. `Mountable` is all you need to understand.
  - icon: 🔄
    title: Three-Phase Functions
    details: Setup → Mount → Unmount. Closures naturally isolate state, avoiding React's stale closure problems.
  - icon: 🧩
    title: Unified Components
    details: Business components and primitive components have no fundamental difference. Everything is a function.
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #6366f1 30%, #a855f7);
}
</style>

## Quick Example

::: code-group

```tsx [DOM]
import { Signal } from 'signal-polyfill'
import { com } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { mount } from '@rasenjs/dom'

// Install the reactivity adapter once, at startup.
useReactiveRuntime()

// A component is a function that returns a mountable. `com()` gives each
// instance its own effect scope, so its subscriptions stop on unmount.
const Counter = com(() => {
  const count = new Signal.State(0)

  return (
    <div class="counter">
      {/* a bare ref child is bound by the host as a reactive text node */}
      <p>Count: {count}</p>
      <button onClick={() => count.set(count.get() + 1)}>+</button>
    </div>
  )
})

mount(<Counter />, document.getElementById('app')!)
```

```tsx [Canvas 2D]
import { Signal } from 'signal-polyfill'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { canvas, mount } from '@rasenjs/dom'
import { rect, text } from '@rasenjs/canvas-2d'

useReactiveRuntime()

const x = new Signal.State(50)

// The canvas bridge lives in @rasenjs/dom; the shapes come from the target.
mount(
  canvas({
    width: 400,
    height: 200,
    children: [
      rect({ x, y: 50, width: 100, height: 80, fill: '#4CAF50' }),
      text({ text: 'Rasen', x: 12, y: 24, fill: '#333' })
    ]
  }),
  document.getElementById('app')!
)

// Shape props are reactive: writing the signal marks the canvas dirty.
const start = performance.now()
const spin = (now: number) => {
  x.set(150 + Math.sin((now - start) / 500) * 100)
  requestAnimationFrame(spin)
}
requestAnimationFrame(spin)
```

```tsx [HTML (SSR)]
import { renderToString, div, p, ul, li } from '@rasenjs/html'

// Same components, string host — no DOM required.
const html = renderToString(
  div(
    { class: 'container' },
    p({ class: 'title' }, 'Hello from SSR!'),
    ul({ class: 'list' }, li('Item 1'), li('Item 2'))
  )
)
```

```tsx [React Native]
import { View, Text, TouchableOpacity, registerApp } from '@rasenjs/react-native'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref } from '@vue/reactivity'

useReactiveRuntime()

const count = ref(0)

registerApp('MyApp', () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ fontSize: 48 }}>{count}</Text>
    <TouchableOpacity onPress={() => count.value++}>
      <Text>+</Text>
    </TouchableOpacity>
  </View>
))
```

:::

::: tip What this needs
`jsxImportSource` in `tsconfig.json` (`"@rasenjs/dom"` here) and the three
packages above — the whole example is JSX, `com()` and TC39 signals. Adding
`@rasenjs/compiler` is optional: it hoists static subtrees and turns `.map()` /
`cond && <El/>` in a child position into `each()` / `when()`
([JSX & the Compiler](/guide/advanced/jsx)).
:::

## The Paradigm

Everything in Rasen comes down to one simple type:

```typescript
type Mountable<Node = unknown> = (
  node: Node,
  hooks: HostHooks<Node> | undefined
) => (() => void) | undefined
```

A component receives a host, mounts itself into it, and returns a cleanup
function. That's it — no virtual DOM, no component instances.

<div style="text-align: center; margin: 3rem 0;">
  <a href="/guide/introduction" style="
    display: inline-block;
    padding: 0.75rem 2rem;
    background: linear-gradient(120deg, #6366f1, #a855f7);
    color: white;
    border-radius: 8px;
    font-weight: 600;
    text-decoration: none;
  ">
    Learn More →
  </a>
</div>
