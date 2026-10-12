# Canvas 2D Rendering

This guide covers 2D graphics rendering with `@rasenjs/canvas-2d`.

::: tip
Canvas 2D is ideal for data visualization, games, and animations.
:::

## Overview

```typescript
import { canvas, mount } from '@rasenjs/dom'
import {
  rect,
  circle,
  text,
  line,
  ellipse,
  arc,
  ring,
  wedge,
  star,
  polygon,
  arrow,
  image,
  path,
  point,
  group
} from '@rasenjs/canvas-2d'
```

## Basic Setup

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { canvas, mount } from '@rasenjs/dom'
import { rect, circle } from '@rasenjs/canvas-2d'
import { ref } from '@vue/reactivity'

useReactiveRuntime()

const x = ref(100)

const Visualization = () =>
  canvas({
    width: 400,
    height: 300,
    children: [
      rect({ x: 0, y: 0, width: 400, height: 300, fill: '#1a1a2e' }),
      circle({ x, y: 150, radius: 30, fill: '#e94560' })
    ]
  })

mount(Visualization(), document.getElementById('app')!)
```

## Components

### Basic Shapes

#### rect

```typescript
rect({
  x: PropValue<number>,
  y: PropValue<number>,
  width: PropValue<number>,
  height: PropValue<number>,
  fill?: PropValue<string>,
  stroke?: PropValue<string>,
  lineWidth?: PropValue<number>,
  cornerRadius?: PropValue<number>
})
```

#### circle

```typescript
circle({
  x: PropValue<number>,         // Center X
  y: PropValue<number>,         // Center Y
  radius: PropValue<number>,
  fill?: PropValue<string>,
  stroke?: PropValue<string>,
  lineWidth?: PropValue<number>
})
```

#### ellipse

```typescript
ellipse({
  x: PropValue<number>,
  y: PropValue<number>,
  radiusX: PropValue<number>,
  radiusY: PropValue<number>,
  fill?: PropValue<string>,
  stroke?: PropValue<string>
})
```

#### line

```typescript
line({
  x1: PropValue<number>,
  y1: PropValue<number>,
  x2: PropValue<number>,
  y2: PropValue<number>,
  stroke?: PropValue<string>,
  lineWidth?: PropValue<number>
})
```

#### text

```typescript
text({
  text: PropValue<string>,
  x: PropValue<number>,
  y: PropValue<number>,
  fill?: PropValue<string>,
  font?: PropValue<string>,
  textAlign?: PropValue<'left' | 'center' | 'right'>,
  textBaseline?: PropValue<'top' | 'middle' | 'bottom'>
})
```

### Advanced Shapes

#### arc

```typescript
arc({
  x: PropValue<number>,
  y: PropValue<number>,
  radius: PropValue<number>,
  startAngle: PropValue<number>,  // Radians
  endAngle: PropValue<number>,
  anticlockwise?: PropValue<boolean>,
  stroke?: PropValue<string>
})
```

#### ring

```typescript
ring({
  x: PropValue<number>,
  y: PropValue<number>,
  innerRadius: PropValue<number>,
  outerRadius: PropValue<number>,
  fill?: PropValue<string>
})
```

#### wedge

```typescript
wedge({
  x: PropValue<number>,
  y: PropValue<number>,
  radius: PropValue<number>,
  angle: PropValue<number>,       // Degrees
  rotation?: PropValue<number>,   // Radians
  fill?: PropValue<string>
})
```

#### star

```typescript
star({
  x: PropValue<number>,
  y: PropValue<number>,
  numPoints: PropValue<number>,
  innerRadius: PropValue<number>,
  outerRadius: PropValue<number>,
  fill?: PropValue<string>
})
```

#### polygon

```typescript
// Regular polygon
polygon({
  x: PropValue<number>,
  y: PropValue<number>,
  sides: PropValue<number>,
  radius: PropValue<number>,
  fill?: PropValue<string>
})

// Custom polygon
polygon({
  points: PropValue<number[]>,  // [x1, y1, x2, y2, ...]
  fill?: PropValue<string>,
  closed?: PropValue<boolean>
})
```

#### arrow

```typescript
arrow({
  points: PropValue<number[]>,  // [x1, y1, x2, y2, ...]
  pointerLength?: PropValue<number>,
  pointerWidth?: PropValue<number>,
  pointerAtBeginning?: PropValue<boolean>,
  pointerAtEnding?: PropValue<boolean>,
  stroke?: PropValue<string>
})
```

#### image

```typescript
image({
  image: PropValue<CanvasImageSource>,
  x: PropValue<number>,
  y: PropValue<number>,
  width?: PropValue<number>,
  height?: PropValue<number>,
  crop?: PropValue<{ x: number, y: number, width: number, height: number }>
})
```

### Path & Group

#### path

```typescript
// Using SVG path data
path({
  data: PropValue<string>,
  fill?: PropValue<string>,
  stroke?: PropValue<string>,
  closed?: PropValue<boolean>
})

// Using points with bezier handles
path({
  points: PropValue<PathPoint[]>,
  fill?: PropValue<string>,
  closed?: PropValue<boolean>
})

// Using child point components
path({
  fill: '#ff0000',
  children: [
    point({ x: 10, y: 10 }),
    point({ x: 100, y: 10, handleOut: { x: 20, y: 20 } }),
    point({ x: 100, y: 100 })
  ]
})
```

#### group

```typescript
group({
  x?: PropValue<number>,
  y?: PropValue<number>,
  rotation?: PropValue<number>,
  scaleX?: PropValue<number>,
  scaleY?: PropValue<number>,
  opacity?: PropValue<number>,
  clip?: PropValue<{ x: number, y: number, width: number, height: number }>,
  children: MountFunction[]
})
```

## Common Properties

### Transform Properties

All shapes support transforms:

```typescript
rect({
  x: 50,
  y: 50,
  width: 100,
  height: 100,
  fill: '#4CAF50',
  rotation: Math.PI / 4, // Radians
  scaleX: 1.5,
  scaleY: 1.5,
  skewX: 0.1,
  skewY: 0,
  translateX: 10,
  translateY: 10,
  offsetX: 50, // Transform origin offset
  offsetY: 50
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
  shadowColor: 'rgba(0,0,0,0.5)',
  shadowBlur: 10,
  shadowOffsetX: 5,
  shadowOffsetY: 5,
  opacity: 0.8
})
```

### Line Styles

```typescript
line({
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 100,
  stroke: '#000',
  lineWidth: 2,
  lineDash: [5, 5],
  lineCap: 'round', // 'butt' | 'round' | 'square'
  lineJoin: 'round' // 'miter' | 'round' | 'bevel'
})
```

## Animation

Writing a reactive prop marks the canvas dirty, so any state source can drive
an animation. `@rasenjs/animation` gives you tween/spring refs that write to the runtime for
you — hand one to a shape prop and it animates:

```typescript
import { tween } from '@rasenjs/animation'

const x = tween(100)

const Animation = () =>
  canvas({
    width: 400,
    height: 300,
    children: [
      rect({ x: 0, y: 0, width: 400, height: 300, fill: '#1a1a2e' }),
      // an animated ref is read through `.value` — hand the prop a getter so it
      // re-evaluates as the animation advances
      circle({ x: () => x.value, y: 150, radius: 30, fill: '#e94560' })
    ]
  })

// `to()` resolves when the tween settles
x.to(300, { duration: 600, easing: 'easeOutCubic' })
```

For a hand-written loop, drive a ref from `requestAnimationFrame` (or a
`FrameSchedule` if the host provides one) — the canvas repaints when the value
changes, not once per frame:

```typescript
const time = ref(0)
const x = computed(() => 200 + Math.sin(time.value * 0.02) * 150)

const tick = (now: number) => {
  time.value = now
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
```

## Interactive graphics

Shapes take delegated pointer handlers — `onClick`, `onPointerDown`,
`onPointerUp`, `onPointerMove`. The host binds one listener per event type on the
canvas and dispatches to the topmost shape under the point, and the handler
receives canvas-local CSS pixel coordinates (no `getBoundingClientRect` math):

```typescript
const mouseX = ref(0)
const mouseY = ref(0)
const hovering = ref(false)

const Interactive = () =>
  canvas({
    width: 400,
    height: 300,
    children: [
      rect({
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        fill: '#1a1a2e',
        onPointerMove: (e) => {
          mouseX.value = e.x
          mouseY.value = e.y
        }
      }),
      circle({
        x: mouseX,
        y: mouseY,
        radius: hovering.value ? 28 : 20,
        fill: '#4ecdc4',
        onPointerDown: () => (hovering.value = true),
        onPointerUp: () => (hovering.value = false)
      }),
      text({
        text: () => `(${Math.round(mouseX.value)}, ${Math.round(mouseY.value)})`,
        x: 10,
        y: 24,
        fill: 'white'
      })
    ]
  })
```

## Example: Shape Gallery

```typescript
const ShapeGallery = () =>
  canvas({
    width: 600,
    height: 400,
    children: [
      // Background
      rect({ x: 0, y: 0, width: 600, height: 400, fill: '#f5f5f5' }),

      // Basic shapes
      rect({
        x: 20,
        y: 20,
        width: 80,
        height: 60,
        fill: '#4CAF50',
        cornerRadius: 8
      }),
      circle({ x: 180, y: 50, radius: 30, fill: '#2196F3' }),
      ellipse({ x: 280, y: 50, radiusX: 40, radiusY: 25, fill: '#9C27B0' }),

      // Advanced shapes
      star({
        x: 400,
        y: 50,
        numPoints: 5,
        innerRadius: 15,
        outerRadius: 35,
        fill: '#FFD700'
      }),
      polygon({ x: 500, y: 50, sides: 6, radius: 35, fill: '#FF5722' }),

      // Arcs
      ring({
        x: 80,
        y: 150,
        innerRadius: 20,
        outerRadius: 40,
        fill: '#E91E63'
      }),
      wedge({ x: 180, y: 150, radius: 40, angle: 90, fill: '#00BCD4' }),
      arc({
        x: 280,
        y: 150,
        radius: 35,
        startAngle: 0,
        endAngle: Math.PI * 1.5,
        stroke: '#673AB7',
        lineWidth: 4
      }),

      // Group with transforms
      group({
        x: 450,
        y: 150,
        rotation: Math.PI / 6,
        children: [
          rect({ x: -30, y: -20, width: 60, height: 40, fill: '#3F51B5' }),
          circle({ x: 0, y: 0, radius: 15, fill: '#FFC107' })
        ]
      })
    ]
  })
```

## Example: Data Visualization

```typescript
const data = ref([30, 50, 80, 40, 60, 90, 45])
const barWidth = 40
const gap = 10

const BarChart = () =>
  canvas({
    width: 400,
    height: 200,
    children: [
      // Background
      rect({ x: 0, y: 0, width: 400, height: 200, fill: '#f5f5f5' }),

      // Bars
      ...data.value.map((value, i) =>
        rect({
          x: i * (barWidth + gap) + 20,
          y: () => 200 - data.value[i] * 2,
          width: barWidth,
          height: () => data.value[i] * 2,
          fill: '#4CAF50',
          cornerRadius: 4
        })
      ),

      // Labels
      ...data.value.map((value, i) =>
        text({
          text: () => `${data.value[i]}`,
          x: i * (barWidth + gap) + 20 + barWidth / 2,
          y: () => 200 - data.value[i] * 2 - 10,
          fill: '#333',
          textAlign: 'center'
        })
      )
    ]
  })
```

::: tip Spreading fixes the shape of the scene
`...data.value.map(…)` runs once, when the component builds the scene: the
**number** of bars is fixed, while the per-bar getters (`height: () => …`) stay
reactive, because the canvas subscribes to every prop it reads. For a list whose
length changes, build the bars with `each()`.
:::

## Performance Tips

1. **Batch updates** - Changes within the same tick are batched automatically
2. **Use computed** - For derived values that change together
3. **Group related shapes** - Use `group` for shapes with shared transforms
4. **Minimize redraws** - Only dirty regions are redrawn

## API Reference

For complete API documentation, see the [@rasenjs/canvas-2d package documentation](/packages/canvas-2d).
