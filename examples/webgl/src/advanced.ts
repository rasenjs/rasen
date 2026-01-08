import { type MountFunction } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref } from '@vue/reactivity'
import { div, h1, p, a, button, canvas, mount } from '@rasenjs/dom'
import { rect, circle } from '@rasenjs/webgl'

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
  children: MountFunction<WebGLRenderingContext>[]
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
    createExample('Animation', 'Reactive animated position', 300, 200, [
      canvas({
        width: 300,
        height: 200,
        contextType: 'webgl',
        children: [
          circle({
            x: animX,
            y: 100,
            radius: 30,
            fill: '#a29bfe'
          })
        ]
      })
    ]),

    createExample(
      'Multiple Shapes',
      'Layered shapes with different colors',
      300,
      200,
      [
        canvas({
          width: 300,
          height: 200,
          contextType: 'webgl',
          children: [
            rect({ x: 50, y: 50, width: 80, height: 80, fill: '#ff6b6b' }),
            rect({ x: 90, y: 90, width: 80, height: 80, fill: '#4ecdc4' }),
            rect({ x: 130, y: 50, width: 80, height: 80, fill: '#ffd93d' })
          ]
        })
      ]
    ),

    createExample(
      'Rotating Rectangle',
      'Apply rotation transform',
      300,
      200,
      [
        canvas({
          width: 300,
          height: 200,
          contextType: 'webgl',
          children: [
            rect({ 
              x: 100, 
              y: 70, 
              width: 100, 
              height: 60, 
              fill: '#667eea',
              rotation: groupRotation
            }),
            circle({ x: 150, y: 100, radius: 15, fill: '#fff' })
          ]
        })
      ]
    )
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
