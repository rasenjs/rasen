# Canvas 2D Rendering

This guide covers 2D graphics rendering with `@rasenjs/canvas-2d`.

::: tip
Canvas 2D is ideal for data visualization, games, and animations.
:::

## Overview

```typescript
import { canvas, mount } from '@rasenjs/dom'
import { context, rect, circle, text, line } from '@rasenjs/canvas-2d'
```

## Basic Setup

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import { canvas, mount } from '@rasenjs/dom'
import { context, rect, circle } from '@rasenjs/canvas-2d'
import { ref } from 'vue'

setReactiveRuntime(createVueRuntime())

const x = ref(100)

const Visualization = () => canvas({
  width: 400,
  height: 300,
  children: context({
    children: [
      rect({ x: 0, y: 0, width: 400, height: 300, fill: '#1a1a2e' }),
      circle({ x, y: 150, radius: 30, fill: '#e94560' })
    ]
  })
})

mount(Visualization(), document.getElementById('app'))
```

## Components

### rect

```typescript
rect({
  x: PropValue<number>,
  y: PropValue<number>,
  width: PropValue<number>,
  height: PropValue<number>,
  fill?: PropValue<string>,
  stroke?: PropValue<string>,
  strokeWidth?: PropValue<number>
})
```

### circle

```typescript
circle({
  x: PropValue<number>,
  y: PropValue<number>,
  radius: PropValue<number>,
  fill?: PropValue<string>,
  stroke?: PropValue<string>,
  strokeWidth?: PropValue<number>
})
```

### line

```typescript
line({
  x1: PropValue<number>,
  y1: PropValue<number>,
  x2: PropValue<number>,
  y2: PropValue<number>,
  stroke?: PropValue<string>,
  strokeWidth?: PropValue<number>
})
```

### text

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

## Animation

```typescript
const time = ref(0)
const x = computed(() => 200 + Math.sin(time.value * 0.02) * 150)

// Animation loop
setInterval(() => time.value++, 16)

const Animation = () => canvas({
  width: 400,
  height: 300,
  children: context({
    children: [
      rect({ x: 0, y: 0, width: 400, height: 300, fill: '#1a1a2e' }),
      circle({ x, y: 150, radius: 30, fill: '#e94560' })
    ]
  })
})
```

## Interactive Graphics

```typescript
const mouseX = ref(0)
const mouseY = ref(0)

const Interactive = () => canvas({
  width: 400,
  height: 300,
  on: {
    mousemove: (e) => {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
      mouseX.value = e.clientX - rect.left
      mouseY.value = e.clientY - rect.top
    }
  },
  children: context({
    children: [
      rect({ x: 0, y: 0, width: 400, height: 300, fill: '#1a1a2e' }),
      circle({ x: mouseX, y: mouseY, radius: 20, fill: '#4ecdc4' }),
      text({ 
        text: () => `(${mouseX.value}, ${mouseY.value})`, 
        x: 10, y: 20, 
        fill: 'white' 
      })
    ]
  })
})
```

## RenderContext

The `RenderContext` manages batched updates:

```typescript
import { RenderContext } from '@rasenjs/canvas-2d'
```

Features:
- Automatic dirty region tracking
- RequestAnimationFrame batching
- Efficient redraws

## Example: Data Visualization

```typescript
const data = ref([30, 50, 80, 40, 60, 90, 45])
const barWidth = 40
const gap = 10

const BarChart = () => canvas({
  width: 400,
  height: 200,
  children: context({
    children: [
      // Background
      rect({ x: 0, y: 0, width: 400, height: 200, fill: '#f5f5f5' }),
      
      // Bars
      ...data.value.map((value, i) => rect({
        x: i * (barWidth + gap) + 20,
        y: () => 200 - data.value[i] * 2,
        width: barWidth,
        height: () => data.value[i] * 2,
        fill: '#4CAF50'
      })),
      
      // Labels
      ...data.value.map((value, i) => text({
        text: () => `${data.value[i]}`,
        x: i * (barWidth + gap) + 20 + barWidth / 2,
        y: () => 200 - data.value[i] * 2 - 10,
        fill: '#333',
        textAlign: 'center'
      }))
    ]
  })
})
```

## Performance Tips

1. **Batch updates** - Changes within the same tick are batched
2. **Use computed** - For derived values that change together
3. **Minimize redraws** - Canvas redraws entire scene on change
