import { setReactiveRuntime, type MountFunction } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, h1, p, a, canvas, mount } from '@rasenjs/dom'
import { line, arrow, polygon } from '@rasenjs/webgl'

setReactiveRuntime(createReactiveRuntime())

const backLink = a({
  href: './index.html',
  class: 'back-link',
  children: ['← Back to Examples']
})

const pageHeader = div({
  class: 'page-header',
  children: [
    h1({ children: ['✏️ Paths & Lines'] }),
    p({ children: ['Lines, arrows, curves, and SVG paths'] })
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
        contextType: 'webgl',
        children
      }),
      p({ class: 'example-description', children: [description] })
    ]
  })
}

const examplesGrid = div({
  class: 'examples-grid',
  children: [
    createExample(
      'Basic Line',
      'Simple lines with different styles',
      300,
      200,
      [
        line({
          x1: 50,
          y1: 50,
          x2: 250,
          y2: 50,
          stroke: '#667eea',
          lineWidth: 2
        }),
        line({
          x1: 50,
          y1: 100,
          x2: 250,
          y2: 100,
          stroke: '#ff6b6b',
          lineWidth: 4
        }),
        line({
          x1: 50,
          y1: 150,
          x2: 250,
          y2: 150,
          stroke: '#4ecdc4',
          lineWidth: 6
        })
      ]
    ),

    createExample(
      'Diagonal Lines',
      'Lines at different angles',
      300,
      200,
      [
        line({
          x1: 50,
          y1: 50,
          x2: 250,
          y2: 150,
          stroke: '#a29bfe',
          lineWidth: 3
        }),
        line({
          x1: 50,
          y1: 150,
          x2: 250,
          y2: 50,
          stroke: '#fd79a8',
          lineWidth: 3
        })
      ]
    ),

    createExample('Arrows', 'Lines with arrow heads', 300, 200, [
      arrow({
        x1: 50,
        y1: 100,
        x2: 250,
        y2: 100,
        fill: '#fd79a8',
        headSize: 15
      }),
      arrow({
        x1: 150,
        y1: 50,
        x2: 150,
        y2: 150,
        fill: '#74b9ff',
        headSize: 12
      })
    ]),

    createExample('Polygon Paths', 'Connected points forming polygons', 300, 200, [
      polygon({
        points: [
          { x: 150, y: 50 },
          { x: 200, y: 100 },
          { x: 175, y: 150 },
          { x: 125, y: 150 },
          { x: 100, y: 100 }
        ],
        fill: '#55efc4'
      })
    ]),

    createExample('Multiple Polygons', 'Overlapping shapes', 300, 200, [
      polygon({
        points: [
          { x: 100, y: 50 },
          { x: 150, y: 80 },
          { x: 130, y: 130 },
          { x: 70, y: 130 },
          { x: 50, y: 80 }
        ],
        fill: '#ffeaa7',
        opacity: 0.7
      }),
      polygon({
        points: [
          { x: 200, y: 70 },
          { x: 250, y: 100 },
          { x: 230, y: 150 },
          { x: 170, y: 150 },
          { x: 150, y: 100 }
        ],
        fill: '#74b9ff',
        opacity: 0.7
      })
    ])
  ]
})

const app = div({
  children: [backLink, pageHeader, examplesGrid]
})

mount(app, document.getElementById('app')!)
