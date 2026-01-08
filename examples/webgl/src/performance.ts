import { each } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref, type Ref, type ShallowRef, shallowRef } from '@vue/reactivity'
import { div, h1, p, a, button, span, canvas, mount } from '@rasenjs/dom'
import {
  rect,
  circle,
  ellipse,
  star,
  polygon,
  ring,
  wedge
} from '@rasenjs/webgl'

useReactiveRuntime()

// Canvas dimensions
const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 600

// Performance stats
const fps = ref(0)
const frameTime = ref(0)
const shapeCount = ref(500)

// Shape types
type ShapeType =
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'star'
  | 'polygon'
  | 'ring'
  | 'wedge'
const SHAPE_TYPES: ShapeType[] = [
  'rect',
  'circle',
  'ellipse',
  'star',
  'polygon',
  'ring',
  'wedge'
]

// Colors palette
const COLORS = [
  '#667eea',
  '#764ba2',
  '#ff6b6b',
  '#4ecdc4',
  '#ffd93d',
  '#6bcf7f',
  '#a29bfe',
  '#fd79a8',
  '#00b894',
  '#e17055',
  '#74b9ff',
  '#fab1a0',
  '#81ecec',
  '#dfe6e9',
  '#636e72'
]

// Shape data interface (static data)
interface ShapeData {
  id: number
  type: ShapeType
  vx: number
  vy: number
  rotationSpeed: number
  size: number
  color: string
  opacity: number
}

// Shape position refs (stored separately to avoid each component issues)
// 使用 shallowRef 减少响应式开销
interface ShapeRefs {
  x: ShallowRef<number>
  y: ShallowRef<number>
  rotation: ShallowRef<number>
}

const shapeRefsMap = new Map<number, ShapeRefs>()

// Reactive shape list
const shapes: Ref<ShapeData[]> = ref([])

let shapeIdCounter = 0

// Create a random shape
function createRandomShape(): ShapeData {
  const size = 10 + Math.random() * 40
  const id = shapeIdCounter++

  // Create refs for this shape using shallowRef for better performance
  const x = size + Math.random() * (CANVAS_WIDTH - size * 2)
  const y = size + Math.random() * (CANVAS_HEIGHT - size * 2)
  shapeRefsMap.set(id, {
    x: shallowRef(x),
    y: shallowRef(y),
    rotation: shallowRef(Math.random() * Math.PI * 2)
  })

  return {
    id,
    type: SHAPE_TYPES[Math.floor(Math.random() * SHAPE_TYPES.length)],
    vx: (Math.random() - 0.5) * 4,
    vy: (Math.random() - 0.5) * 4,
    rotationSpeed: (Math.random() - 0.5) * 0.1,
    size,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    opacity: 0.5 + Math.random() * 0.5
  }
}

// Initialize shapes
function initShapes(count: number) {
  // Clear old refs
  shapeRefsMap.clear()
  shapeIdCounter = 0

  const newShapes: ShapeData[] = []
  for (let i = 0; i < count; i++) {
    newShapes.push(createRandomShape())
  }
  shapes.value = newShapes
  shapeCount.value = count
}

// Initialize shapes immediately
initShapes(500)

// Update shapes positions
// P4 优化：让 Vue 自动批量调度，不使用 triggerRef
function updateShapes() {
  const maxX = CANVAS_WIDTH
  const maxY = CANVAS_HEIGHT
  
  for (const shape of shapes.value) {
    const refs = shapeRefsMap.get(shape.id)
    if (!refs) continue

    // 直接修改值（不触发响应式）
    let newX = refs.x.value + shape.vx
    let newY = refs.y.value + shape.vy

    // Bounce off walls - 优化：减少比较次数
    const minBound = shape.size
    const maxBoundX = maxX - shape.size
    const maxBoundY = maxY - shape.size
    
    if (newX <= minBound) {
      shape.vx = -shape.vx
      newX = minBound
    } else if (newX >= maxBoundX) {
      shape.vx = -shape.vx
      newX = maxBoundX
    }
    
    if (newY <= minBound) {
      shape.vy = -shape.vy
      newY = minBound
    } else if (newY >= maxBoundY) {
      shape.vy = -shape.vy
      newY = maxBoundY
    }

    // P4: 直接修改值，Vue 会自动批量调度所有更新
    // 不需要 triggerRef - shallowRef 修改会自动触发依赖
    refs.x.value = newX
    refs.y.value = newY
    refs.rotation.value += shape.rotationSpeed
  }
}

// FPS calculation
let lastTime = performance.now()
let frameCount = 0
let fpsUpdateTime = 0

function updateFPS() {
  const now = performance.now()
  frameCount++
  fpsUpdateTime += now - lastTime
  frameTime.value = Math.round(now - lastTime)
  lastTime = now

  if (fpsUpdateTime >= 1000) {
    fps.value = Math.round((frameCount * 1000) / fpsUpdateTime)
    frameCount = 0
    fpsUpdateTime = 0
  }
}

// Animation loop
let animationId: number = 0
function animate() {
  updateShapes()
  updateFPS()
  animationId = requestAnimationFrame(animate)
}

// Start animation immediately (before UI definition)
animationId = requestAnimationFrame(animate)

// Create shape component based on type
function createShapeComponent(shape: ShapeData) {
  const refs = shapeRefsMap.get(shape.id)
  if (!refs) {
    // Fallback - should not happen
    return rect({ x: 0, y: 0, width: 10, height: 10, fill: '#000' })
  }

  const baseProps = {
    x: refs.x,
    y: refs.y,
    rotation: refs.rotation,
    opacity: shape.opacity
  }

  switch (shape.type) {
    case 'rect':
      return rect({
        ...baseProps,
        width: shape.size * 1.5,
        height: shape.size,
        fill: shape.color
      })
    case 'circle':
      return circle({
        ...baseProps,
        radius: shape.size / 2,
        fill: shape.color
      })
    case 'ellipse':
      return ellipse({
        ...baseProps,
        radiusX: shape.size * 0.75,
        radiusY: shape.size * 0.5,
        fill: shape.color
      })
    case 'star':
      return star({
        ...baseProps,
        innerRadius: shape.size * 0.3,
        outerRadius: shape.size * 0.6,
        numPoints: 5,
        fill: shape.color
      })
    case 'polygon':
      return polygon({
        ...baseProps,
        radius: shape.size / 2,
        sides: 6,
        fill: shape.color
      })
    case 'ring':
      return ring({
        ...baseProps,
        innerRadius: shape.size * 0.3,
        outerRadius: shape.size * 0.5,
        fill: shape.color
      })
    case 'wedge':
      return wedge({
        ...baseProps,
        radius: shape.size / 2,
        angle: Math.PI * 0.8,
        fill: shape.color
      })
  }
}

// UI Components
const backLink = a({
  href: './index.html',
  class: 'back-link',
  children: ['← Back to Examples']
})

const pageHeader = div({
  class: 'page-header',
  children: [
    h1({ children: ['⚡ Performance Test'] }),
    p({ children: ['Stress test with thousands of animated shapes'] })
  ]
})

const fpsDisplay = div({
  class: 'fps-display',
  children: [
    div({
      class: 'fps-main',
      children: [
        span({ class: 'fps-value', children: [fps] }),
        span({ class: 'fps-label', children: [' FPS'] })
      ]
    }),
    div({
      class: 'fps-detail',
      children: [
        span({ children: ['Frame time: '] }),
        span({ children: [frameTime] }),
        span({ children: ['ms | Shapes: '] }),
        span({ children: [shapeCount] })
      ]
    })
  ]
})

const controls = div({
  class: 'controls performance-controls',
  children: [
    div({
      class: 'control-group',
      children: [span({ children: ['Presets: '] })]
    }),
    button({
      children: ['100'],
      onClick: () => initShapes(100)
    }),
    button({
      children: ['500'],
      onClick: () => initShapes(500)
    }),
    button({
      children: ['1000'],
      onClick: () => initShapes(1000)
    }),
    button({
      children: ['2000'],
      onClick: () => initShapes(2000)
    }),
    button({
      children: ['5000'],
      onClick: () => initShapes(5000)
    }),
    button({
      children: ['+ 100'],
      onClick: () => {
        for (let i = 0; i < 100; i++) {
          shapes.value.push(createRandomShape())
        }
        shapes.value = [...shapes.value]
        shapeCount.value = shapes.value.length
      }
    }),
    button({
      children: ['- 100'],
      onClick: () => {
        if (shapes.value.length > 100) {
          shapes.value = shapes.value.slice(0, -100)
          shapeCount.value = shapes.value.length
        }
      }
    })
  ]
})

// Main canvas with all shapes using each component
const mainCanvas = div({
  class: 'canvas-container',
  children: [
    canvas({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      contextType: 'webgl',
      style: { background: '#1a1a2e', borderRadius: '12px' },
      children: [each(shapes, (shape) => createShapeComponent(shape))]
    })
  ]
})

const legend = div({
  class: 'legend',
  children: [
    p({
      children:
        ['🔷 Shape Types: Rectangle, Circle, Ellipse, Star, Polygon, Ring, Wedge']
    }),
    p({
      children:
        ['🎯 All shapes have random velocities, rotation speeds, and bounce off walls']
    }),
    p({
      children:
        ['💡 Tip: Use preset buttons to change shape count and test performance']
    })
  ]
})

const app = div({
  children: [backLink, pageHeader, fpsDisplay, controls, mainCanvas, legend]
})

// Mount the app
mount(app, document.getElementById('app')!)

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(animationId)
})
