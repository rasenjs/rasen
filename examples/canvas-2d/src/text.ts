import { setReactiveRuntime, type MountFunction } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import { div, h1, p, a, canvas, mount } from '@rasenjs/dom'
import { text } from '@rasenjs/canvas-2d'

setReactiveRuntime(createVueRuntime())

const backLink = a({
  href: './index.html',
  class: 'back-link',
  textContent: '← Back to Examples'
})

const pageHeader = div({
  class: 'page-header',
  children: [
    h1({ textContent: '🔤 Text & Images' }),
    p({ textContent: 'Text rendering with different styles' })
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
      h1({ textContent: title }),
      canvas({
        width,
        height,
        children
      }),
      p({ class: 'example-description', textContent: description })
    ]
  })
}

const examplesGrid = div({
  class: 'examples-grid',
  children: [
    createExample('Basic Text', 'Simple text rendering', 300, 200, [
      text({
        text: 'Hello Rasen!',
        x: 150,
        y: 100,
        font: '32px Arial',
        fill: '#667eea',
        textAlign: 'center'
      })
    ]),

    createExample('Text Alignment', 'Left, center, right alignment', 300, 200, [
      text({
        text: 'Left',
        x: 150,
        y: 60,
        font: '20px Arial',
        fill: '#333',
        textAlign: 'left'
      }),
      text({
        text: 'Center',
        x: 150,
        y: 100,
        font: '20px Arial',
        fill: '#333',
        textAlign: 'center'
      }),
      text({
        text: 'Right',
        x: 150,
        y: 140,
        font: '20px Arial',
        fill: '#333',
        textAlign: 'right'
      })
    ]),

    createExample('Letter Spacing', 'Custom letter spacing', 300, 200, [
      text({
        text: 'SPACING',
        x: 150,
        y: 100,
        font: '24px Arial',
        fill: '#ff6b6b',
        textAlign: 'center',
        letterSpacing: 10
      })
    ]),

    createExample('Underline', 'Text with underline decoration', 300, 200, [
      text({
        text: 'Underlined Text',
        x: 150,
        y: 100,
        font: '24px Arial',
        fill: '#4ecdc4',
        textAlign: 'center',
        textDecoration: 'underline'
      })
    ])
  ]
})

const app = div({
  children: [backLink, pageHeader, examplesGrid]
})

mount(app, document.getElementById('app')!)
