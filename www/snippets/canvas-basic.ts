import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { canvas, mount } from '@rasenjs/dom'
import { rect, text } from '@rasenjs/canvas-2d'
import { tween } from '@rasenjs/animation'
import { ref } from '@vue/reactivity'

useReactiveRuntime()

// A tween is a ref the animation writes to for you
const x = tween(50)

mount(
  canvas({
    width: 400,
    height: 200,
    children: [
      // a prop can be a getter: it is re-evaluated when its dependencies change
      rect({ x: () => x.value, y: 50, width: 100, height: 80, fill: '#4CAF50' }),
      text({ text: 'Rasen', x: 12, y: 24, fill: '#333' })
    ]
  }),
  document.getElementById('app')!
)

// Writing the ref marks the canvas dirty — no render loop to write
x.to(320, { duration: 800, easing: 'easeOutCubic' })
