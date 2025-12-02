# @rasenjs/canvas-2d

Canvas 2D rendering components for the Rasen reactive rendering framework.

## Installation

```bash
npm install @rasenjs/canvas-2d @rasenjs/core @rasenjs/dom
```

## Overview

`@rasenjs/canvas-2d` provides reactive Canvas 2D components that automatically redraw when reactive state changes. Components can be used directly as children of DOM canvas elements.

## Quick Start

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { canvas, mount } from '@rasenjs/dom'
import { rect, circle, text } from '@rasenjs/canvas-2d'
import { ref, computed } from 'vue'

// Setup reactive runtime
setReactiveRuntime(createReactiveRuntime())

// Create reactive state
const x = ref(50)

// Create canvas component - shapes are direct children
const App = () =>
  canvas({
    width: 400,
    height: 300,
    children: [
      rect({
        x: x, // Reactive position
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

// Mount
mount(App(), document.getElementById('app'))

// Animate
setInterval(() => {
  x.value = 50 + Math.sin(Date.now() / 500) * 100
}, 16)
```

## Components

### Basic Shapes

#### `rect`

Draws a rectangle.

```typescript
import { rect } from '@rasenjs/canvas-2d'

rect({
  x: 10,
  y: 10,
  width: 100,
  height: 50,
  fill: '#ff0000',
  stroke: '#000000',
  lineWidth: 2,
  cornerRadius: 8 // Optional rounded corners
})
```

#### `circle`

Draws a circle.

```typescript
import { circle } from '@rasenjs/canvas-2d'

circle({
  x: 100, // Center X
  y: 100, // Center Y
  radius: 50,
  fill: '#00ff00',
  stroke: '#000',
  lineWidth: 1
})
```

#### `ellipse`

Draws an ellipse.

```typescript
import { ellipse } from '@rasenjs/canvas-2d'

ellipse({
  x: 100,
  y: 100,
  radiusX: 80,
  radiusY: 50,
  fill: '#ff6600',
  stroke: '#000'
})
```

#### `line`

Draws a line.

```typescript
import { line } from '@rasenjs/canvas-2d'

line({
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 100,
  stroke: '#000',
  lineWidth: 2
})
```

#### `text`

Draws text.

```typescript
import { text } from '@rasenjs/canvas-2d'

text({
  text: 'Hello Canvas!',
  x: 50,
  y: 50,
  fill: '#000',
  font: '24px Arial',
  textAlign: 'center', // 'left' | 'center' | 'right'
  textBaseline: 'middle' // 'top' | 'middle' | 'bottom'
})
```

### Advanced Shapes

#### `arc`

Draws an arc (partial circle, not closed).

```typescript
import { arc } from '@rasenjs/canvas-2d'

arc({
  x: 100,
  y: 100,
  radius: 50,
  startAngle: 0, // Radians
  endAngle: Math.PI, // Half circle
  anticlockwise: false,
  stroke: '#000',
  lineWidth: 2
})
```

#### `ring`

Draws a ring (donut shape).

```typescript
import { ring } from '@rasenjs/canvas-2d'

ring({
  x: 100,
  y: 100,
  innerRadius: 30,
  outerRadius: 50,
  fill: '#4CAF50'
})
```

#### `wedge`

Draws a wedge (pie slice).

```typescript
import { wedge } from '@rasenjs/canvas-2d'

wedge({
  x: 100,
  y: 100,
  radius: 50,
  angle: 60, // Degrees
  rotation: 0, // Start rotation (radians)
  fill: '#FF9800'
})
```

#### `star`

Draws a star shape.

```typescript
import { star } from '@rasenjs/canvas-2d'

star({
  x: 100,
  y: 100,
  numPoints: 5,
  innerRadius: 20,
  outerRadius: 50,
  fill: '#FFD700',
  stroke: '#000'
})
```

#### `polygon`

Draws a polygon (regular or custom).

```typescript
import { polygon } from '@rasenjs/canvas-2d'

// Regular polygon (hexagon)
polygon({
  x: 100,
  y: 100,
  sides: 6,
  radius: 50,
  fill: '#9C27B0'
})

// Custom polygon with points
polygon({
  points: [50, 0, 100, 100, 0, 100], // [x1, y1, x2, y2, ...]
  fill: '#2196F3',
  closed: true
})
```

#### `arrow`

Draws a line with arrow heads.

```typescript
import { arrow } from '@rasenjs/canvas-2d'

arrow({
  points: [0, 50, 100, 50, 150, 100], // [x1, y1, x2, y2, ...]
  pointerLength: 10,
  pointerWidth: 10,
  pointerAtBeginning: false,
  pointerAtEnding: true,
  stroke: '#000',
  lineWidth: 2
})
```

#### `image`

Draws an image.

```typescript
import { image } from '@rasenjs/canvas-2d'

const img = new Image()
img.src = 'path/to/image.png'

image({
  image: img,
  x: 0,
  y: 0,
  width: 100, // Optional, uses image width
  height: 100, // Optional, uses image height
  crop: { x: 0, y: 0, width: 50, height: 50 } // Optional cropping
})
```

### Path & Group

#### `path`

Draws complex paths with bezier curves.

```typescript
import { path, point } from '@rasenjs/canvas-2d'

// Using SVG path data
path({
  data: 'M 10 10 L 100 10 L 100 100 Z',
  fill: '#4CAF50',
  stroke: '#000'
})

// Using points with handles
path({
  points: [
    { x: 10, y: 10 },
    { x: 100, y: 10, handleIn: { x: -20, y: 0 }, handleOut: { x: 20, y: 0 } },
    { x: 100, y: 100 }
  ],
  closed: true,
  fill: '#2196F3'
})

// Using child point components
path({
  closed: true,
  fill: '#FF9800',
  children: [
    point({ x: 10, y: 10 }),
    point({ x: 100, y: 10, handleOut: { x: 20, y: 20 } }),
    point({ x: 100, y: 100 })
  ]
})
```

#### `group`

Groups multiple shapes with shared transforms.

```typescript
import { group, rect, circle } from '@rasenjs/canvas-2d'

group({
  x: 100, // Offset position
  y: 100,
  rotation: Math.PI / 4, // Shared rotation
  scaleX: 1.5,
  scaleY: 1.5,
  opacity: 0.8,
  clip: { x: 0, y: 0, width: 200, height: 200 }, // Optional clipping
  children: [
    rect({ x: 0, y: 0, width: 50, height: 50, fill: '#f00' }),
    circle({ x: 25, y: 25, radius: 20, fill: '#00f' })
  ]
})
```

## Common Properties

### Fill & Stroke

All shapes support fill and stroke properties:

```typescript
rect({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  fill: '#4CAF50', // Fill color
  stroke: '#000', // Stroke color
  lineWidth: 2 // Stroke width
})
```

### Line Styles

Line-based shapes support additional styling:

```typescript
line({
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 100,
  stroke: '#000',
  lineWidth: 2,
  lineDash: [5, 5], // Dashed line
  lineDashOffset: 0,
  lineCap: 'round', // 'butt' | 'round' | 'square'
  lineJoin: 'round', // 'miter' | 'round' | 'bevel'
  miterLimit: 10
})
```

### Transforms

All shapes support transforms:

```typescript
rect({
  x: 50,
  y: 50,
  width: 100,
  height: 100,
  fill: '#4CAF50',
  // Transform properties
  rotation: Math.PI / 4, // Rotation in radians
  scaleX: 1.5,
  scaleY: 1.5,
  skewX: 0.1,
  skewY: 0,
  translateX: 10,
  translateY: 10,
  offsetX: 50, // Transform origin X offset
  offsetY: 50 // Transform origin Y offset
})
```

### Shadow & Opacity

```typescript
rect({
  x: 50,
  y: 50,
  width: 100,
  height: 100,
  fill: '#4CAF50',
  // Shadow
  shadowColor: 'rgba(0,0,0,0.5)',
  shadowBlur: 10,
  shadowOffsetX: 5,
  shadowOffsetY: 5,
  // Opacity
  opacity: 0.8,
  // Composite operation
  globalCompositeOperation: 'source-over'
})
```

## Reactive Props

All props can be reactive:

```typescript
import { ref, computed } from 'vue'

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

## Animation

Use `requestAnimationFrame` for smooth animations:

```typescript
const angle = ref(0)

const animate = () => {
  angle.value += 0.02
  requestAnimationFrame(animate)
}

animate()

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
canvas({
  width: 400,
  height: 300,
  children: [
    // Background (drawn first)
    rect({ x: 0, y: 0, width: 400, height: 300, fill: '#eee' }),

    // Middle layer
    circle({ x: 200, y: 150, radius: 80, fill: '#ccc' }),

    // Foreground (drawn last, on top)
    text({ text: 'Hello', x: 200, y: 150, fill: '#000', textAlign: 'center' })
  ]
})
```

## Integration with DOM

Canvas 2D components work seamlessly with DOM canvas element:

```typescript
import { canvas, mount } from '@rasenjs/dom'
import { rect, circle, text } from '@rasenjs/canvas-2d'

const App = () =>
  canvas({
    width: 800,
    height: 600,
    style: { border: '1px solid #ccc' },
    children: [
      rect({ x: 10, y: 10, width: 100, height: 100, fill: 'blue' }),
      circle({ x: 200, y: 100, radius: 50, fill: 'red' }),
      text({
        text: 'Canvas 2D',
        x: 400,
        y: 50,
        fill: '#000',
        font: '24px Arial'
      })
    ]
  })

mount(App(), document.getElementById('app'))
```

## API Reference

### Components

| Component | Description                             |
| --------- | --------------------------------------- |
| `rect`    | Rectangle with optional rounded corners |
| `circle`  | Circle                                  |
| `ellipse` | Ellipse                                 |
| `line`    | Line segment                            |
| `text`    | Text rendering                          |
| `arc`     | Arc (partial circle)                    |
| `ring`    | Ring/donut shape                        |
| `wedge`   | Wedge/pie slice                         |
| `star`    | Star shape                              |
| `polygon` | Regular or custom polygon               |
| `arrow`   | Line with arrow heads                   |
| `image`   | Image rendering                         |
| `path`    | Complex path with bezier curves         |
| `point`   | Path point (used with path)             |
| `group`   | Group with shared transforms            |

### Types

```typescript
import type {
  Bounds,
  PathPoint,
  CommonDrawProps,
  LineStyleProps,
  TransformProps
} from '@rasenjs/canvas-2d'
```

## License

MIT
