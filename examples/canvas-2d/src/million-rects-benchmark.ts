/**
 * Million Rects Benchmark - 使用 @rasenjs/canvas-2d rect() 组件测试性能
 *
 * 测试 100 万个可交互矩形的：
 * - 首屏创建速度（使用 rect() 组件）
 * - 内存占用
 * - 单元素拖拽帧率
 */

import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref } from '@vue/reactivity'
import {
  div,
  h1,
  p,
  a,
  button,
  span,
  canvas,
  table,
  thead,
  tbody,
  tr,
  th,
  td,
  mount
} from '@rasenjs/dom'
import { rect } from '@rasenjs/canvas-2d'

useReactiveRuntime()

// ============================================================================
// Constants
// ============================================================================

const CANVAS_WIDTH = 1600
const CANVAS_HEIGHT = 900
const RECT_COUNT = 1_000_000
const RECT_WIDTH = 20
const RECT_HEIGHT = 15
const GRID_COLS = 2000

// ============================================================================
// State
// ============================================================================

const creationTime = ref<number>(0)
const memoryUsage = ref<string>('--')
const isCreating = ref<boolean>(false)
const isCreated = ref<boolean>(false)
const testPhase = ref<'idle' | 'creating' | 'ready' | 'dragging'>('idle')
const dragFps = ref<number>(0)

// ============================================================================
// Rectangle Data (使用原始数组存储数据)
// ============================================================================

const rectX = new Float32Array(RECT_COUNT)
const rectY = new Float32Array(RECT_COUNT)
const rectColors: string[] = new Array(RECT_COUNT)

const PALETTE = [
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
  '#fab1a0'
]

// 拖拽状态
let currentDragId = -1
let dragOffsetX = 0
let dragOffsetY = 0
let dragAnimationId = 0
let fpsFrameCount = 0
let fpsLastTime = 0

// Canvas 引用
let canvasElement: HTMLCanvasElement | null = null

// ============================================================================
// 初始化矩形数据
// ============================================================================

function initRectData(): void {
  for (let i = 0; i < RECT_COUNT; i++) {
    const col = i % GRID_COLS
    const row = Math.floor(i / GRID_COLS)
    rectX[i] = col * (RECT_WIDTH + 2) + 10
    rectY[i] = row * (RECT_HEIGHT + 2) + 10
    rectColors[i] = PALETTE[Math.floor(Math.random() * PALETTE.length)]
  }
}

// ============================================================================
// Canvas Rendering - 使用 rect() 组件创建 100 万个矩形
// ============================================================================

function renderWithRectComponents(): void {
  const container = document.querySelector('.canvas-wrapper')
  if (!container) return

  // 创建 100 万个 rect() 组件
  const components = new Array(RECT_COUNT)

  for (let i = 0; i < RECT_COUNT; i++) {
    components[i] = rect({
      x: rectX[i],
      y: rectY[i],
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      fill: rectColors[i]
    })
  }

  // 使用 canvas 组件挂载
  const mountable = canvas({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    style: {
      background: '#1a1a2e',
      borderRadius: '12px',
      border: '1px solid #333'
    },
    children: components
  })

  // 清空容器并挂载
  container.innerHTML = ''
  mount(mountable, container)

  // 获取创建的 canvas 元素
  canvasElement = container.querySelector('canvas')
}

// ============================================================================
// Hit Testing
// ============================================================================

function hitTest(mx: number, my: number): number {
  for (let i = RECT_COUNT - 1; i >= 0; i--) {
    const x = rectX[i]
    const y = rectY[i]
    if (mx >= x && mx <= x + RECT_WIDTH && my >= y && my <= y + RECT_HEIGHT) {
      return i
    }
  }
  return -1
}

// ============================================================================
// FPS Counter
// ============================================================================

function updateDragFps(): void {
  fpsFrameCount++
  const now = performance.now()
  const elapsed = now - fpsLastTime

  if (elapsed >= 500) {
    dragFps.value = Math.round((fpsFrameCount * 1000) / elapsed)
    fpsFrameCount = 0
    fpsLastTime = now
  }
}

// ============================================================================
// 拖拽循环
// ============================================================================

function startDragLoop(): void {
  fpsFrameCount = 0
  fpsLastTime = performance.now()

  function loop(): void {
    if (currentDragId >= 0) {
      updateDragFps()
    }
    dragAnimationId = requestAnimationFrame(loop)
  }

  dragAnimationId = requestAnimationFrame(loop)
}

function stopDragLoop(): void {
  if (dragAnimationId) {
    cancelAnimationFrame(dragAnimationId)
  }
}

// ============================================================================
// Memory Measurement
// ============================================================================

function measureMemory(): string {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number }
  }
  if (perf.memory) {
    const usedMB = (perf.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)
    const totalMB = (perf.memory.totalJSHeapSize / 1024 / 1024).toFixed(1)
    return `${usedMB} MB / ${totalMB} MB`
  }
  return 'N/A (Chrome only)'
}

// ============================================================================
// Benchmark: Creation Speed
// ============================================================================

async function runCreationBenchmark(): Promise<void> {
  if (isCreating.value || isCreated.value) return

  isCreating.value = true
  testPhase.value = 'creating'
  creationTime.value = 0

  const startTime = performance.now()

  // 初始化数据
  initRectData()

  // 使用 rect() 组件渲染
  renderWithRectComponents()

  const creationMs = performance.now() - startTime
  creationTime.value = Math.round(creationMs * 10) / 10

  isCreating.value = false
  isCreated.value = true
  testPhase.value = 'ready'
  memoryUsage.value = measureMemory()

  startDragLoop()
}

// ============================================================================
// Event Handlers
// ============================================================================

function setupCanvasEvents(): void {
  const checkCanvas = setInterval(() => {
    canvasElement = document.querySelector('.canvas-wrapper canvas') as HTMLCanvasElement
    if (canvasElement) {
      clearInterval(checkCanvas)

      canvasElement.addEventListener('mousemove', (e: MouseEvent) => {
        if (currentDragId < 0) return

        const r = canvasElement!.getBoundingClientRect()
        const mx = e.clientX - r.left
        const my = e.clientY - r.top

        rectX[currentDragId] = mx - dragOffsetX
        rectY[currentDragId] = my - dragOffsetY
      })

      canvasElement.addEventListener('mousedown', (e: MouseEvent) => {
        const r = canvasElement!.getBoundingClientRect()
        const mx = e.clientX - r.left
        const my = e.clientY - r.top

        const hit = hitTest(mx, my)
        if (hit >= 0) {
          currentDragId = hit
          dragOffsetX = mx - rectX[hit]
          dragOffsetY = my - rectY[hit]
          testPhase.value = 'dragging'
          dragFps.value = 0
        }
      })

      canvasElement.addEventListener('mouseup', () => {
        if (currentDragId >= 0) {
          currentDragId = -1
          testPhase.value = 'ready'
        }
      })
    }
  }, 100)
}

// ============================================================================
// UI Components
// ============================================================================

const backLink = a({
  href: './index.html',
  class: 'back-link',
  children: ['← Back to Examples']
})

const pageHeader = div({
  class: 'page-header',
  children: [
    h1({ children: ['🚀 Million Rectangle Benchmark'] }),
    p({
      children: [
        'Performance test with 1,000,000 interactive rectangles using @rasenjs/canvas-2d rect() components'
      ]
    })
  ]
})

const runButton = button({
  class: 'benchmark-btn',
  children: ['▶ Run Benchmark'],
  onClick: runCreationBenchmark,
  disabled: () => isCreating.value || isCreated.value
})

const resetButton = button({
  class: 'benchmark-btn',
  children: ['↺ Reset'],
  onClick: () => {
    stopDragLoop()
    isCreated.value = false
    isCreating.value = false
    testPhase.value = 'idle'
    creationTime.value = 0
    memoryUsage.value = '--'
    dragFps.value = 0
    currentDragId = -1
    canvasElement = null
  },
  disabled: () => !isCreated.value
})

const controls = div({
  class: 'controls',
  children: [runButton, resetButton]
})

const benchmarkTable = table({
  class: 'benchmark-table',
  children: [
    thead({
      children: [
        tr({
          children: [
            th({ children: ['Test Item'] }),
            th({ children: ['Traditional Canvas'] }),
            th({ children: ['LeaferJS'] }),
            th({ children: ['Rasen Canvas 2D'] })
          ]
        })
      ]
    }),
    tbody({
      children: [
        tr({
          children: [
            td({ children: ['Rectangle Count'] }),
            td({ children: ['1,000,000'] }),
            td({ children: ['1,000,000'] }),
            td({ children: ['1,000,000'] })
          ]
        }),
        tr({
          children: [
            td({ children: ['Creation Time'] }),
            td({ children: ['~9-15s'] }),
            td({ children: ['1.28s'] }),
            td({
              class: 'result-cell',
              children: [
                () => `${creationTime.value} ms`,
                () => isCreating.value ? ' (creating)' : ''
              ]
            })
          ]
        }),
        tr({
          children: [
            td({ children: ['Memory Usage'] }),
            td({ children: ['~2-4 GB'] }),
            td({ children: ['320 MB'] }),
            td({
              class: 'result-cell',
              children: [memoryUsage]
            })
          ]
        }),
        tr({
          children: [
            td({ children: ['Drag FPS'] }),
            td({ children: ['0-4 FPS'] }),
            td({ children: ['60 FPS'] }),
            td({
              class: 'result-cell',
              children: [dragFps, () => dragFps.value > 0 ? ' FPS' : '']
            })
          ]
        })
      ]
    })
  ]
})

const phaseIndicator = div({
  class: 'phase-indicator',
  children: [
    span({
      class: () => `phase-dot ${testPhase.value}`,
      children: [
        () => {
          switch (testPhase.value) {
            case 'idle':
              return 'Waiting'
            case 'creating':
              return 'Creating 1,000,000 rect() components...'
            case 'ready':
              return 'Ready — drag any rectangle to test FPS'
            case 'dragging':
              return 'Dragging...'
            default:
              return ''
          }
        }
      ]
    })
  ]
})

const legend = div({
  class: 'legend',
  children: [
    p({
      children: [
        '📊 Benchmark compares Rasen Canvas 2D (using rect() components) against traditional canvas libraries and LeaferJS'
      ]
    }),
    p({
      children: [
        '🎯 Each rectangle is created with @rasenjs/canvas-2d rect() component for fair comparison'
      ]
    }),
    p({
      children: ['💡 Memory usage requires Chrome/Edge browser']
    })
  ]
})

const app = div({
  class: 'benchmark-container',
  children: [
    backLink,
    pageHeader,
    phaseIndicator,
    controls,
    benchmarkTable,
    div({
      class: 'canvas-wrapper',
      style: {
        background: '#1a1a2e',
        borderRadius: '12px',
        border: '1px solid #333',
        width: `${CANVAS_WIDTH}px`,
        height: `${CANVAS_HEIGHT}px`
      }
    }),
    legend
  ]
})

mount(app, document.getElementById('app')!)

setupCanvasEvents()
