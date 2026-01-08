import { mount } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { rect, circle, RenderContext } from '@rasenjs/webgl'
import { ref, computed } from '@vue/reactivity'

// Setup reactive runtime
useReactiveRuntime()

// Create reactive state
const x = ref(100)
const y = ref(100)
const radius = ref(50)
const rotation = ref(0)

// Animation state
let animationId: number | null = null
let lastTime = 0
let fps = 60

// WebGL canvas setup
const canvas = document.getElementById('canvas') as HTMLCanvasElement
const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

if (!gl) {
  alert('WebGL not supported!')
  throw new Error('WebGL not supported')
}

// Create WebGL render context
const renderContext = new RenderContext(gl, {
  batching: true,
  dirtyTracking: true
})

// Create component
const App = () => [
  rect({
    x,
    y,
    width: 150,
    height: 100,
    fill: '#4CAF50',
    rotation
  }),
  circle({
    x: computed(() => x.value + 250),
    y,
    radius,
    fill: '#2196F3'
  })
]

// Mount components directly to WebGL context
const components = App()
components.forEach(component => {
  const mountFn = component as (gl: WebGLRenderingContext | WebGL2RenderingContext) => void
  mountFn(gl)
})

// Animation loop
function animate(time: number) {
  // Calculate FPS
  if (lastTime) {
    const delta = time - lastTime
    fps = Math.round(1000 / delta)
    document.getElementById('fps')!.textContent = fps.toString()
  }
  lastTime = time

  // Update values
  x.value = 150 + Math.sin(time / 1000) * 100
  y.value = 150 + Math.cos(time / 800) * 100
  radius.value = 50 + Math.sin(time / 500) * 20
  rotation.value = time / 1000

  animationId = requestAnimationFrame(animate)
}

// Controls
document.getElementById('startBtn')!.addEventListener('click', () => {
  if (animationId === null) {
    lastTime = 0
    animationId = requestAnimationFrame(animate)
  }
})

document.getElementById('stopBtn')!.addEventListener('click', () => {
  if (animationId !== null) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
})

// Auto-start
animationId = requestAnimationFrame(animate)

console.log('✅ Rasen WebGL example loaded')
