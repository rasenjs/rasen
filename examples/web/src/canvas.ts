import { ref, useReactiveRuntime } from '@rasenjs/reactive-signals'
import { div, h1, button, mount, canvas } from '@rasenjs/dom'
import { rect, circle, text } from '@rasenjs/canvas-2d'

// 初始化 Signals 响应式运行时
useReactiveRuntime()

const x = ref(100)
const y = ref(100)
const radius = ref(30)

function moveRight() {
  x.value = Math.min(x.value + 20, 350)
}

function moveLeft() {
  x.value = Math.max(x.value - 20, 50)
}

function moveUp() {
  y.value = Math.max(y.value - 20, 50)
}

function moveDown() {
  y.value = Math.min(y.value + 20, 350)
}

function grow() {
  radius.value = Math.min(radius.value + 10, 100)
}

function shrink() {
  radius.value = Math.max(radius.value - 10, 10)
}

const app = div(
  {},
  h1('🎨 Canvas 2D Example'),
  canvas({
    width: 400,
    height: 400,
    children: [
      rect({
        x: 0,
        y: 0,
        width: 400,
        height: 400,
        fill: '#f0f9ff'
      }),
      circle({
        x,
        y,
        radius,
        fill: '#667eea'
      }),
      text({
        x,
        y,
        text: '🌀',
        font: '24px sans-serif',
        textAlign: 'center',
        textBaseline: 'middle',
        fill: 'white'
      })
    ]
  }),
  div(
    { class: 'controls' },
    button({ onClick: moveLeft }, '← Left'),
    button({ onClick: moveUp }, '↑ Up'),
    button({ onClick: moveDown }, '↓ Down'),
    button({ onClick: moveRight }, '→ Right'),
    button({ onClick: shrink }, '− Shrink'),
    button({ onClick: grow }, '+ Grow')
  )
)

mount(app, document.getElementById('app')!)
