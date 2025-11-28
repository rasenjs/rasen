# @rasenjs/canvas-2d

Canvas 2D rendering components for the Rasen reactive rendering framework.

## Installation

```bash
npm install @rasenjs/canvas-2d @rasenjs/core @rasenjs/dom
```

## Overview

`@rasenjs/canvas-2d` provides reactive Canvas 2D components that automatically redraw when reactive state changes.

## Quick Start

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import { canvas, mount } from '@rasenjs/dom'
import { context, rect, circle, text } from '@rasenjs/canvas-2d'
import { ref, computed } from 'vue'

// Setup reactive runtime
setReactiveRuntime(createVueRuntime())

// Create reactive state
const x = ref(50)

// Create canvas component
const App = () => canvas({
  width: 400,
  height: 300,
  children: [
    context({
      children: [
        rect({
          x: x,           // Reactive position
          y: 50,
          width: 100,
          height: 80,
          fill: '#4CAF50'
        }),
        circle({
          x: 200,
          y: 150,
          radius: 40,
          fill: '#2196F3'
        }),
        text({
          text: computed(() => `X: ${x.value}`),
          x: 10,
          y: 20,
          fill: '#000'
        })
      ]
    })
  ]
})

// Mount
mount(App(), document.getElementById('app'))

// Animate
setInterval(() => {
  x.value = 50 + Math.sin(Date.now() / 500) * 100
}, 16)
```

## Components

### `context`

Creates a render context for Canvas 2D. Must be a child of a `<canvas>` element.

```typescript
import { context } from '@rasenjs/canvas-2d'

context({
  children: [
    // Canvas 2D components go here
  ]
})
```

### `rect`

Draws a rectangle.

```typescript
import { rect } from '@rasenjs/canvas-2d'

rect({
  x: 10,
  y: 10,
  width: 100,
  height: 50,
  fill: '#ff0000',        // Fill color
  stroke: '#000000',      // Stroke color
  strokeWidth: 2          // Stroke width
})
```

### `circle`

Draws a circle.

```typescript
import { circle } from '@rasenjs/canvas-2d'

circle({
  x: 100,          // Center X
  y: 100,          // Center Y
  radius: 50,
  fill: '#00ff00',
  stroke: '#000',
  strokeWidth: 1
})
```

### `line`

Draws a line.

```typescript
import { line } from '@rasenjs/canvas-2d'

line({
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 100,
  stroke: '#000',
  strokeWidth: 2
})
```

### `text`

Draws text.

```typescript
import { text } from '@rasenjs/canvas-2d'

text({
  text: 'Hello Canvas!',
  x: 50,
  y: 50,
  fill: '#000',
  font: '24px Arial',
  textAlign: 'center',      // 'left' | 'center' | 'right'
  textBaseline: 'middle'    // 'top' | 'middle' | 'bottom'
})
```

## Reactive Props

All props can be reactive:

```typescript
const position = ref({ x: 0, y: 0 })
const color = ref('#ff0000')
const size = computed(() => Math.abs(Math.sin(Date.now() / 1000)) * 50 + 10)

rect({
  x: computed(() => position.value.x),
  y: computed(() => position.value.y),
  width: size,
  height: size,
  fill: color
})
```

## Render Context

The `RenderContext` manages the canvas drawing:

```typescript
import { RenderContext, type Bounds } from '@rasenjs/canvas-2d'

// Create context manually
const ctx = canvas.getContext('2d')
const renderContext = new RenderContext(ctx)

// Request redraw
renderContext.requestRedraw()

// Register drawable
const bounds: Bounds = { x: 0, y: 0, width: 100, height: 100 }
renderContext.registerDrawable(id, bounds, (ctx) => {
  ctx.fillRect(0, 0, 100, 100)
})

// Unregister
renderContext.unregisterDrawable(id)
```

## Animation

Use `requestAnimationFrame` for smooth animations:

```typescript
const angle = ref(0)

const animate = () => {
  angle.value += 0.02
  requestAnimationFrame(animate)
}

animate()

// In component
circle({
  x: computed(() => 200 + Math.cos(angle.value) * 100),
  y: computed(() => 200 + Math.sin(angle.value) * 100),
  radius: 20,
  fill: '#ff0000'
})
```

## Layering

Children are drawn in order (first child at bottom):

```typescript
context({
  children: [
    // Background (drawn first)
    rect({ x: 0, y: 0, width: 400, height: 300, fill: '#eee' }),
    
    // Middle layer
    circle({ x: 200, y: 150, radius: 80, fill: '#ccc' }),
    
    // Foreground (drawn last, on top)
    text({ text: 'Hello', x: 200, y: 150, fill: '#000' })
  ]
})
```

## Integration with DOM

Canvas 2D components work with DOM canvas element:

```typescript
import { canvas } from '@rasenjs/dom'
import { context, rect } from '@rasenjs/canvas-2d'

const App = () => canvas({
  width: 800,
  height: 600,
  style: { border: '1px solid #ccc' },
  children: [
    context({
      children: [
        rect({ x: 10, y: 10, width: 100, height: 100, fill: 'blue' })
      ]
    })
  ]
})
```

## License

MIT
