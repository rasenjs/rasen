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
    details: The core is nearly zero — it's just a paradigm. MountFunction is all you need to understand.
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

```typescript [DOM]
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, button, mount } from '@rasenjs/dom'
import { ref } from 'vue'

useReactiveRuntime()

const count = ref(0)

const Counter = () =>
  div({
    children: [
      div({ textContent: () => `Count: ${count.value}` }),
      button({
        textContent: '+',
        on: { click: () => count.value++ }
      })
    ]
  })

mount(Counter(), document.getElementById('app'))
```

```typescript [Canvas 2D]
import { canvas } from '@rasenjs/dom'
import { rect, text } from '@rasenjs/canvas-2d'
import { ref } from 'vue'

const x = ref(50)

mount(
  canvas({
    width: 400,
    height: 200,
    children: [
      rect({ x, y: 50, width: 100, height: 80, fill: '#4CAF50' }),
      text({ text: () => `X: ${x.value}`, x: 10, y: 20 })
    ]
  }),
  document.getElementById('app')
)
```

```typescript [React Native]
import { view, text, touchableOpacity } from '@rasenjs/react-native'
import { ref } from 'vue'

const count = ref(0)

view({
  style: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  children: [
    text({
      style: { fontSize: 48 },
      children: () => `${count.value}`
    }),
    touchableOpacity({
      onPress: () => count.value++,
      children: text({ children: '+' })
    })
  ]
})
```

```typescript [HTML (SSR)]
import { renderToString, div, p, ul, li } from '@rasenjs/html'

const html = renderToString(
  div(
    { class: 'container' },
    p({ class: 'title' }, 'Hello from SSR!'),
    ul({ class: 'list' }, li('Item 1'), li('Item 2'), li('Item 3'))
  )
)
```

:::

## The Paradigm

Everything in Rasen comes down to one simple type:

```typescript
type MountFunction<Host> = (host: Host) => (() => void) | undefined
```

A component receives a host, mounts itself, and returns a cleanup function. That's it.

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
