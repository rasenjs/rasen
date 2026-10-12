import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { canvas, mount } from '@rasenjs/dom'
import { rect, circle, text } from '@rasenjs/canvas-2d'
import { ref, computed } from '@vue/reactivity'

useReactiveRuntime()

// One frame counter drives every derived value; each shape subscribes only to
// the props it reads, and a change repaints the canvas once.
const time = ref(0)
const x = computed(() => 200 + Math.sin(time.value * 0.02) * 150)
const y = computed(() => 150 + Math.cos(time.value * 0.03) * 100)
const radius = computed(() => 30 + Math.sin(time.value * 0.05) * 10)

const tick = (now: number) => {
  time.value = now
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

const Animation = () =>
  canvas({
    width: 400,
    height: 300,
    children: [
      rect({ x: 0, y: 0, width: 400, height: 300, fill: '#1a1a2e' }),
      circle({ x, y, radius, fill: '#e94560' }),
      text({ text: () => `x: ${Math.round(x.value)}`, x: 12, y: 24, fill: '#8ecae6' })
    ]
  })

mount(Animation(), document.getElementById('app')!)
