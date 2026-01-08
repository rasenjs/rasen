import { type MountFunction } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref } from '@vue/reactivity'
import { div, h1, p, a, button, canvas, mount } from '@rasenjs/dom'
import { group, rect, circle } from '@rasenjs/canvas-2d'

useReactiveRuntime()

const groupRotation = ref(0)
const animX = ref(100)
const direction = ref(1)

const backLink = a({
  href: './index.html',
  class: 'back-link',
  children: ['← Back to Examples']
})

const pageHeader = div({
  class: 'page-header',
  children: [
    h1({ children: ['🚀 Advanced Features'] }),
    p({ children: ['Groups, animations, and interactions'] })
  ]
})

function createExample(
  title: string,
  description: string,
  width: number,
  height: number,
  children: MountFunction<CanvasRenderingContext2D>[]
) {
  return div({
    class: 'example-card',
    children: [
      h1({ children: [title] }),
      canvas({
        width,
        height,
        children
      }),
      p({ class: 'example-description', children: [description] })
    ]
  })
}

// Simple animation loop
setInterval(() => {
  animX.value = animX.value + direction.value * 2
  if (animX.value > 250 || animX.value < 50) {
    direction.value = -direction.value
  }
}, 16)

const examplesGrid = div({
  class: 'examples-grid',
  children: [
    createExample(
      'Group Transform',
      'Apply transforms to multiple shapes',
      300,
      200,
      [
        group({
          x: 150,
          y: 100,
          rotation: groupRotation,
          children: [
            rect({ x: -50, y: -30, width: 100, height: 60, fill: '#667eea' }),
            circle({ x: 0, y: 0, radius: 15, fill: '#fff' })
          ]
        })
      ]
    ),

    createExample(
      'Group Opacity',
      'Shared opacity for multiple shapes',
      300,
      200,
      [
        group({
          opacity: 0.6,
          children: [
            rect({ x: 50, y: 50, width: 80, height: 80, fill: '#ff6b6b' }),
            rect({ x: 90, y: 90, width: 80, height: 80, fill: '#4ecdc4' }),
            rect({ x: 130, y: 50, width: 80, height: 80, fill: '#ffd93d' })
          ]
        })
      ]
    ),

    createExample('Animation', 'Reactive animated position', 300, 200, [
      circle({
        x: animX,
        y: 100,
        radius: 30,
        fill: '#a29bfe'
      })
    ])
  ]
})

const controls = div({
  class: 'controls',
  children: [
    button({
      children: ['Rotate Group'],
      onClick: () => {
        groupRotation.value =
          (groupRotation.value + Math.PI / 4) % (Math.PI * 2)
      }
    })
  ]
})

const app = div({
  children: [backLink, pageHeader, examplesGrid, controls]
})

mount(app, document.getElementById('app')!)
