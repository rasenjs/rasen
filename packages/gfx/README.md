# @rasenjs/gfx

WebGL-based 2D rendering components for the Rasen reactive rendering framework.

## Features

- 🚀 **GPU-Accelerated**: All rendering happens on the GPU
- 📦 **Batch Rendering**: Automatic batching of similar shapes for optimal performance
- 🎨 **Same API as canvas-2d**: Drop-in replacement with identical API
- ⚡ **High Performance**: Handle thousands of shapes at 60fps
- 🔄 **Reactive**: Automatic updates when reactive state changes

## Installation

```bash
npm install @rasenjs/gfx @rasenjs/core @rasenjs/dom
```

## Quick Start

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { canvas, mount } from '@rasenjs/dom'
import { rect, circle } from '@rasenjs/gfx'
import { ref } from '@vue/reactivity'

// Setup reactive runtime
useReactiveRuntime()

// Create reactive state
const x = ref(50)

// Create canvas with WebGL context
const App = () =>
  canvas({
    width: 400,
    height: 300,
    webgl: true, // Enable WebGL context
    children: [
      rect({
        x: x,
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
      })
    ]
  })

mount(App(), document.getElementById('app'))
```

## API

The API is identical to `@rasenjs/canvas-2d`. See the [canvas-2d documentation](../canvas-2d/README.md) for details.

## Performance Comparison

| Scenario | Canvas 2D | WebGL 2D |
|----------|-----------|----------|
| 100 shapes | ~60fps | ~60fps |
| 1,000 shapes | ~30fps | ~60fps |
| 10,000 shapes | <10fps | ~60fps |

## Architecture

```
@rasenjs/gfx
├── renderer/        # Core WebGL renderer
│   ├── shader.ts    # Shader program management
│   ├── geometry.ts  # Geometry generation
│   └── batch.ts     # Batch rendering
├── components/      # 2D shape components
│   ├── rect.ts
│   ├── circle.ts
│   └── ...
└── render-context.ts # WebGL render context
```

## License

MIT
