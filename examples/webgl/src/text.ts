import { setReactiveRuntime, type MountFunction } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, h1, p, a, canvas, mount } from '@rasenjs/dom'
import { text, line, circle } from '@rasenjs/canvas-2d'

setReactiveRuntime(createReactiveRuntime())

const backLink = a({
  href: './index.html',
  class: 'back-link',
  children: ['← Back to Examples']
})

const pageHeader = div({
  class: 'page-header',
  children: [
    h1({ children: ['🔤 Text & Images'] }),
    p({ children: ['Text rendering with different styles'] })
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
      // 垂直参考线
      line({
        x1: 150,
        y1: 40,
        x2: 150,
        y2: 160,
        stroke: '#ccc',
        lineWidth: 1
      }),
      // Left 对齐点和基线
      circle({
        x: 150,
        y: 60,
        radius: 3,
        fill: '#667eea'
      }),
      line({
        x1: 0,
        y1: 60,
        x2: 300,
        y2: 60,
        stroke: '#667eea',
        lineWidth: 0.5,
        opacity: 0.3
      }),
      text({
        text: 'Left',
        x: 150,
        y: 60,
        font: '20px Arial',
        fill: '#333',
        textAlign: 'left'
      }),
      // Center 对齐点和基线
      circle({
        x: 150,
        y: 100,
        radius: 3,
        fill: '#667eea'
      }),
      line({
        x1: 0,
        y1: 100,
        x2: 300,
        y2: 100,
        stroke: '#667eea',
        lineWidth: 0.5,
        opacity: 0.3
      }),
      text({
        text: 'Center',
        x: 150,
        y: 100,
        font: '20px Arial',
        fill: '#333',
        textAlign: 'center'
      }),
      // Right 对齐点和基线
      circle({
        x: 150,
        y: 140,
        radius: 3,
        fill: '#667eea'
      }),
      line({
        x1: 0,
        y1: 140,
        x2: 300,
        y2: 140,
        stroke: '#667eea',
        lineWidth: 0.5,
        opacity: 0.3
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
