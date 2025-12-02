import { setReactiveRuntime, type MountFunction } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, h1, p, a, canvas, mount } from '@rasenjs/dom'
import {
  rect,
  circle,
  ellipse,
  arc,
  ring,
  star,
  polygon,
  wedge
} from '@rasenjs/canvas-2d'

setReactiveRuntime(createReactiveRuntime())

// Helper function to create an example card
function createExample(
  title: string,
  description: string,
  width: number,
  height: number,
  content:
    | MountFunction<CanvasRenderingContext2D>
    | MountFunction<CanvasRenderingContext2D>[]
) {
  return div({
    class: 'example-card',
    children: [
      h1({ textContent: title }),
      canvas({
        width,
        height,
        children: Array.isArray(content) ? content : [content]
      }),
      p({ class: 'example-description', textContent: description })
    ]
  })
}

const backLink = a({
  href: './index.html',
  class: 'back-link',
  textContent: '← Back to Examples'
})

const pageHeader = div({
  class: 'page-header',
  children: [
    h1({ textContent: '🔷 Basic Shapes' }),
    p({ textContent: 'Explore different shapes available in Canvas 2D' })
  ]
})

const examplesGrid = div({
  class: 'examples-grid',
  children: [
    // Rectangle
    createExample(
      'Rectangle',
      'Basic rectangles with fill and stroke',
      300,
      200,
      [
        rect({ x: 50, y: 50, width: 200, height: 100, fill: '#667eea' }),
        rect({
          x: 30,
          y: 30,
          width: 100,
          height: 80,
          stroke: '#764ba2',
          lineWidth: 3
        })
      ]
    ),

    // Circle
    createExample('Circle', 'Perfect circles with different styles', 300, 200, [
      circle({ x: 150, y: 100, radius: 60, fill: '#ff6b6b' }),
      circle({ x: 100, y: 80, radius: 40, stroke: '#4ecdc4', lineWidth: 4 })
    ]),

    // Ellipse
    createExample('Ellipse', 'Ellipses with different radii', 300, 200, [
      ellipse({ x: 150, y: 100, radiusX: 100, radiusY: 60, fill: '#ffd93d' }),
      ellipse({
        x: 150,
        y: 100,
        radiusX: 80,
        radiusY: 40,
        stroke: '#6bcf7f',
        lineWidth: 3
      })
    ]),

    // Arc
    createExample('Arc', 'Circular arcs and pie slices', 300, 200, [
      arc({
        x: 80,
        y: 100,
        radius: 50,
        startAngle: 0,
        endAngle: Math.PI,
        fill: '#a29bfe'
      }),
      arc({
        x: 220,
        y: 100,
        radius: 50,
        startAngle: Math.PI / 4,
        endAngle: Math.PI * 1.5,
        stroke: '#fd79a8',
        lineWidth: 4
      })
    ]),

    // Ring
    createExample(
      'Ring (Donut)',
      'Ring shapes with inner and outer radius',
      300,
      200,
      [
        ring({
          x: 150,
          y: 100,
          innerRadius: 40,
          outerRadius: 80,
          fill: '#74b9ff'
        }),
        ring({
          x: 150,
          y: 100,
          innerRadius: 50,
          outerRadius: 70,
          stroke: '#ff7675',
          lineWidth: 2
        })
      ]
    ),

    // Star
    createExample('Star', 'Stars with different numbers of points', 300, 200, [
      star({
        x: 100,
        y: 100,
        numPoints: 5,
        innerRadius: 30,
        outerRadius: 70,
        fill: '#ffeaa7'
      }),
      star({
        x: 200,
        y: 100,
        numPoints: 6,
        innerRadius: 25,
        outerRadius: 55,
        stroke: '#fd79a8',
        lineWidth: 3
      })
    ]),

    // Polygon
    createExample('Polygon', 'Regular polygons and custom shapes', 300, 200, [
      polygon({ x: 80, y: 100, sides: 6, radius: 50, fill: '#55efc4' }),
      polygon({
        x: 220,
        y: 100,
        sides: 8,
        radius: 50,
        stroke: '#6c5ce7',
        lineWidth: 3
      })
    ]),

    // Wedge
    createExample(
      'Wedge (Pie Slice)',
      'Wedge shapes for pie charts',
      300,
      200,
      [
        wedge({
          x: 150,
          y: 100,
          radius: 70,
          angle: 60,
          fill: '#ff6b6b',
          rotation: 0
        }),
        wedge({
          x: 150,
          y: 100,
          radius: 70,
          angle: 90,
          fill: '#4ecdc4',
          rotation: Math.PI / 3
        }),
        wedge({
          x: 150,
          y: 100,
          radius: 70,
          angle: 120,
          fill: '#ffd93d',
          rotation: Math.PI / 3 + Math.PI / 2
        })
      ]
    ),

    // Custom Polygon
    createExample(
      'Custom Polygon',
      'Create custom shapes with point arrays',
      300,
      200,
      polygon({
        points: [150, 30, 220, 100, 190, 170, 110, 170, 80, 100],
        fill: '#a29bfe',
        stroke: '#6c5ce7',
        lineWidth: 2
      })
    ),

    // Rounded Polygon
    createExample(
      'Rounded Polygon',
      'Polygons with rounded corners',
      300,
      200,
      polygon({
        x: 150,
        y: 100,
        sides: 6,
        radius: 70,
        cornerRadius: 10,
        fill: '#fd79a8',
        stroke: '#e84393',
        lineWidth: 2
      })
    )
  ]
})

const app = div({
  children: [backLink, pageHeader, examplesGrid]
})

mount(app, document.getElementById('app')!)
