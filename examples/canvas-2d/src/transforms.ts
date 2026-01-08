import { type MountFunction } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref } from '@vue/reactivity'
import { div, h1, p, a, button, canvas, mount } from '@rasenjs/dom'
import { rect, circle } from '@rasenjs/canvas-2d'

useReactiveRuntime()

const rotation = ref(0)
const scale = ref(1)
const opacity = ref(1)

const backLink = a({
  href: './index.html',
  class: 'back-link',
  children: ['← Back to Examples']
})

const pageHeader = div({
  class: 'page-header',
  children: [
    h1({ children: ['🔄 Transforms & Effects'] }),
    p({ children: ['Rotation, scaling, opacity, and shadows'] })
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

const examplesGrid = div({
  class: 'examples-grid',
  children: [
    createExample('Rotation', 'Rotate shapes around their center', 300, 200, [
      rect({
        x: 100,
        y: 50,
        width: 100,
        height: 100,
        fill: '#667eea',
        rotation
      })
    ]),

    createExample('Scale', 'Scale shapes up or down', 300, 200, [
      circle({
        x: 150,
        y: 100,
        radius: 50,
        fill: '#ff6b6b',
        scaleX: scale,
        scaleY: scale
      })
    ]),

    createExample('Opacity', 'Transparent shapes', 300, 200, [
      rect({ x: 80, y: 50, width: 100, height: 100, fill: '#4ecdc4', opacity }),
      circle({ x: 150, y: 100, radius: 50, fill: '#ffd93d', opacity: 0.7 })
    ]),

    createExample('Shadow', 'Drop shadows with blur', 300, 200, [
      rect({
        x: 80,
        y: 50,
        width: 140,
        height: 100,
        fill: '#a29bfe',
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        shadowBlur: 15,
        shadowOffsetX: 5,
        shadowOffsetY: 5
      })
    ])
  ]
})

const controls = div({
  class: 'controls',
  children: [
    button({
      children: ['Rotate'],
      onClick: () => {
        rotation.value = (rotation.value + Math.PI / 6) % (Math.PI * 2)
      }
    }),
    button({
      children: ['Scale +'],
      onClick: () => {
        scale.value = Math.min(scale.value + 0.2, 2)
      }
    }),
    button({
      children: ['Scale -'],
      onClick: () => {
        scale.value = Math.max(scale.value - 0.2, 0.5)
      }
    }),
    button({
      children: ['Opacity +'],
      onClick: () => {
        opacity.value = Math.min(opacity.value + 0.1, 1)
      }
    }),
    button({
      children: ['Opacity -'],
      onClick: () => {
        opacity.value = Math.max(opacity.value - 0.1, 0.1)
      }
    })
  ]
})

const app = div({
  children: [backLink, pageHeader, examplesGrid, controls]
})

mount(app, document.getElementById('app')!)
