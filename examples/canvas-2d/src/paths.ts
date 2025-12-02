import { setReactiveRuntime, type MountFunction } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, h1, p, a, canvas, mount } from '@rasenjs/dom'
import { path, line, arrow } from '@rasenjs/canvas-2d'

setReactiveRuntime(createReactiveRuntime())

const backLink = a({
  href: './index.html',
  class: 'back-link',
  textContent: '← Back to Examples'
})

const pageHeader = div({
  class: 'page-header',
  children: [
    h1({ textContent: '✏️ Paths & Lines' }),
    p({ textContent: 'Lines, arrows, curves, and SVG paths' })
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
      'Multi-point Line',
      'Lines connecting multiple points',
      300,
      200,
      [
        line({
          points: [50, 150, 100, 50, 150, 100, 200, 50, 250, 150],
          stroke: '#a29bfe',
          lineWidth: 3
        })
      ]
    ),

    createExample('Arrows', 'Lines with arrow heads', 300, 200, [
      arrow({
        points: [50, 100, 250, 100],
        pointerLength: 20,
        pointerWidth: 15,
        stroke: '#fd79a8',
        fill: '#fd79a8',
        lineWidth: 3
      })
    ]),

    createExample('SVG Path', 'Using SVG path data', 300, 200, [
      path({
        data: 'M 50 150 L 100 50 L 150 100 L 200 50 L 250 150',
        stroke: '#74b9ff',
        lineWidth: 3
      })
    ]),

    createExample('Bezier Curve', 'Smooth curves with SVG', 300, 200, [
      path({
        data: 'M 50 100 Q 150 20 250 100',
        stroke: '#55efc4',
        lineWidth: 3
      })
    ]),

    createExample('Complex Path', 'Complex SVG path with curves', 300, 200, [
      path({
        data: 'M 50 150 C 50 50 250 50 250 150 S 150 250 50 150',
        stroke: '#ffeaa7',
        fill: 'rgba(255, 234, 167, 0.3)',
        lineWidth: 2
      })
    ])
  ]
})

const app = div({
  children: [backLink, pageHeader, examplesGrid]
})

mount(app, document.getElementById('app')!)
