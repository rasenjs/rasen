import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { canvas, mount } from '@rasenjs/dom'
import { rect, circle, text } from '@rasenjs/canvas-2d'
import { ref, computed } from '@vue/reactivity'

useReactiveRuntime()

const time = ref(0)
const x = computed(() => 200 + Math.sin(time.value * 0.02) * 150)
const y = computed(() => 150 + Math.cos(time.value * 0.03) * 100)
const radius = computed(() => 30 + Math.sin(time.value * 0.05) * 10)
const hue = computed(() => Math.floor(time.value * 0.5) % 360)

// Animation loop
setInterval(() => time.value++, 16)

const Animation = () =>
  canvas({
    width: 400,
    height: 300,
    style: { border: '1px solid #ccc' },
    children: [
      // Background
      rect({ x: 0, y: 0, width: 400, height: 300, fill: '#1a1a2e' }),

      // Animated circle
      circle({
        x,
        y,
        radius,
        fill: () => `hsl(${hue.value}, 70%, 60%)`
      }),

      // Trail circles
      ...Array.from({ length: 10 }, (_, i) => {
        const offset = i * 5
        return circle({
          x: () => 200 + Math.sin((time.value - offset) * 0.02) * 150,
          y: () => 150 + Math.cos((time.value - offset) * 0.03) * 100,
          radius: () => 5 + (10 - i),
          fill: () =>
            `hsla(${(hue.value - i * 10) % 360}, 70%, 60%, ${0.1 + (10 - i) * 0.05})`
        })
      }),

      // FPS counter
      text({
        text: () => `Frame: ${time.value}`,
        x: 10,
        y: 20,
        fill: 'white',
        font: '14px monospace'
      })
    ]
  })

mount(Animation(), document.getElementById('app')!)
