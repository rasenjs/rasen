# Render Targets

One of Rasen's core features is the ability to render to multiple targets using the same component paradigm.

## The MountFunction Pattern

Every render target in Rasen follows the same pattern:

```typescript
type MountFunction<Host> = (host: Host) => (() => void) | undefined
```

- Receives a **host** (the render target)
- Returns an **unmount function** (for cleanup)

This simple abstraction enables cross-platform rendering.

## Available Targets

### DOM

The most common target. Components mount to `HTMLElement` hosts:

```typescript
import { div, button, span, mount } from '@rasenjs/dom'

const Counter = () => div({
  children: [
    span({ textContent: () => `Count: ${count.value}` }),
    button({ textContent: '+', on: { click: () => count.value++ } })
  ]
})

mount(Counter(), document.getElementById('app'))
```

[Learn more about DOM rendering →](/guide/targets/dom)

### Canvas 2D

For 2D graphics and animations. Components mount to `CanvasRenderingContext2D`:

```typescript
import { canvas } from '@rasenjs/dom'
import { context, rect, circle, text } from '@rasenjs/canvas-2d'

const Visualization = () => canvas({
  width: 800,
  height: 600,
  children: context({
    children: [
      rect({ x: 0, y: 0, width: 800, height: 600, fill: '#1a1a2e' }),
      circle({ x: x, y: y, radius: 50, fill: '#e94560' }),
      text({ text: () => `Position: (${x.value}, ${y.value})`, x: 10, y: 20, fill: 'white' })
    ]
  })
})
```

[Learn more about Canvas 2D →](/guide/targets/canvas-2d)

### React Native

For mobile apps, bypassing React entirely:

```typescript
import { view, text, touchableOpacity, registerApp } from '@rasenjs/react-native'

const App = () => view({
  style: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  children: [
    text({ style: { fontSize: 24 }, children: 'Hello Rasen!' }),
    touchableOpacity({
      onPress: () => console.log('Pressed!'),
      children: text({ children: 'Press Me' })
    })
  ]
})

registerApp('MyApp', App)
```

[Learn more about React Native →](/guide/targets/react-native)

### HTML (SSR/SSG)

For server-side rendering without a runtime:

```typescript
import { renderToString, div, p, ul, li } from '@rasenjs/html'

const html = renderToString(
  div(
    { class: 'container' },
    p('Hello from the server!'),
    ul(
      li('Item 1'),
      li('Item 2'),
      li('Item 3')
    )
  )
)
```

[Learn more about HTML/SSR →](/guide/targets/html-ssr)

## Cross-Target Components

You can create components that work across targets by abstracting the rendering:

```typescript
// Shared logic
const useCounter = () => {
  const count = ref(0)
  const increment = () => count.value++
  const decrement = () => count.value--
  return { count, increment, decrement }
}

// DOM version
const DOMCounter = () => {
  const { count, increment, decrement } = useCounter()
  return div({
    children: [
      span({ textContent: () => `${count.value}` }),
      button({ textContent: '+', on: { click: increment } }),
      button({ textContent: '-', on: { click: decrement } })
    ]
  })
}

// React Native version
const RNCounter = () => {
  const { count, increment, decrement } = useCounter()
  return view({
    children: [
      text({ children: () => `${count.value}` }),
      touchableOpacity({ onPress: increment, children: text({ children: '+' }) }),
      touchableOpacity({ onPress: decrement, children: text({ children: '-' }) })
    ]
  })
}
```

## Target Architecture

```
                    ┌───────────────────┐
                    │  Rasen Paradigm   │
                    │  MountFunction<T> │
                    └────────┬──────────┘
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │    DOM     │    │  Canvas 2D │    │React Native│
    │HTMLElement │    │ Context2D  │    │  Fabric    │
    └────────────┘    └────────────┘    └────────────┘
           │                 │                 │
           ▼                 ▼                 ▼
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │  Browser   │    │  Browser   │    │   Mobile   │
    │   Window   │    │   Canvas   │    │   Native   │
    └────────────┘    └────────────┘    └────────────┘
```

## Creating Custom Targets

The `MountFunction` pattern makes it easy to create new render targets:

```typescript
// Three.js example
const mesh = (props: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  position?: PropValue<{ x: number; y: number; z: number }>
}) => (scene: THREE.Scene) => {
  const mesh = new THREE.Mesh(props.geometry, props.material)
  
  if (props.position) {
    watchProp(
      () => unref(props.position),
      (pos) => {
        if (pos) mesh.position.set(pos.x, pos.y, pos.z)
      }
    )
  }
  
  scene.add(mesh)
  
  return () => {
    scene.remove(mesh)
    mesh.geometry.dispose()
  }
}
```

[Learn how to create custom targets →](/guide/advanced/custom-targets)

## Next Steps

- [DOM Rendering](/guide/targets/dom) — Browser DOM details
- [Canvas 2D](/guide/targets/canvas-2d) — 2D graphics
- [React Native](/guide/targets/react-native) — Mobile apps
- [Custom Targets](/guide/advanced/custom-targets) — Build your own
