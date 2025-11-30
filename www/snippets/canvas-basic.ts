import { setReactiveRuntime } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import { canvas, mount } from '@rasenjs/dom'
import { rect, text } from '@rasenjs/canvas-2d'
import { ref, computed } from 'vue'

setReactiveRuntime(createVueRuntime())

const x = ref(50)

mount(
  canvas({
    width: 400,
    height: 200,
    children: [
      rect({ x: x, y: 50, width: 100, height: 80, fill: '#4CAF50' }),
      text({ text: computed(() => `X: ${x.value}`), x: 10, y: 20 })
    ]
  }),
  document.getElementById('app')!
)

// Animate
setInterval(() => (x.value = 50 + Math.sin(Date.now() / 500) * 100), 16)
