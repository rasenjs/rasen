/**
 * Konva — scene-graph canvas library, measured in its default idiomatic
 * configuration (interactive Layer with hit graph enabled). Mutations are
 * explicit; a `batchDraw()` schedules one coalesced redraw, which is the
 * documented way to drive Konva.
 */

import Konva from 'konva'
import {
  installCanvas,
  timed,
  measureAnimation,
  type BenchAPI
} from './bench-api'
import {
  generateShapes,
  applyUpdateRule,
  rectSize,
  circleRadius,
  halfExtents,
  velocity,
  PALETTE,
  CANVAS_W,
  CANVAS_H,
  UPDATE_STRIDE,
  type ShapeSpec
} from '../shared/spec'

const stage = new Konva.Stage({
  container: installCanvas().parentElement as HTMLDivElement,
  width: CANVAS_W,
  height: CANVAS_H
})
const layer = new Konva.Layer()
stage.add(layer)

// Konva creates its own <canvas> inside the container — remove the shared
// shell canvas so only Konva's surface remains visible.
const shell = document.querySelector('#app > canvas')
shell?.remove()

// Single source of truth, mirrored into Konva nodes by id.
let shapes: ShapeSpec[] = []
let nodes = new Map<number, Konva.Shape>()

function toNode(s: ShapeSpec): Konva.Shape {
  if (s.kind === 'rect') {
    const { w, h } = rectSize(s)
    // offsetX/offsetY make (x, y) the CENTER, matching the shared spec.
    return new Konva.Rect({
      x: s.x,
      y: s.y,
      offsetX: w / 2,
      offsetY: h / 2,
      width: w,
      height: h,
      fill: PALETTE[s.colorIndex]
    })
  }
  return new Konva.Circle({
    x: s.x,
    y: s.y,
    radius: circleRadius(s),
    fill: PALETTE[s.colorIndex]
  })
}

function syncAttrs(node: Konva.Shape, s: ShapeSpec): void {
  node.fill(PALETTE[s.colorIndex])
  if (s.kind === 'rect') {
    const { w, h } = rectSize(s)
    node.width(w)
    node.height(h)
    node.offsetX(w / 2)
    node.offsetY(h / 2)
  } else {
    ;(node as Konva.Circle).radius(circleRadius(s))
  }
}

function moveShape(s: ShapeSpec): void {
  const { vx, vy } = velocity(s.id)
  const { hx, hy } = halfExtents(s)
  s.x += vx
  s.y += vy
  if (s.x < hx || s.x > CANVAS_W - hx) s.x = Math.max(hx, Math.min(CANVAS_W - hx, s.x))
  if (s.y < hy || s.y > CANVAS_H - hy) s.y = Math.max(hy, Math.min(CANVAS_H - hy, s.y))
}

const bench: BenchAPI = {
  async create(count) {
    return timed(() => {
      layer.destroyChildren()
      shapes = generateShapes(count)
      nodes = new Map()
      for (const s of shapes) {
        const node = toNode(s)
        nodes.set(s.id, node)
        layer.add(node)
      }
      layer.batchDraw()
    })
  },

  async updateEvery10th() {
    return timed(() => {
      for (const s of shapes) {
        if (s.id % UPDATE_STRIDE !== 0) continue
        applyUpdateRule(s)
        syncAttrs(nodes.get(s.id)!, s)
      }
      layer.batchDraw()
    })
  },

  async clear() {
    return timed(() => {
      layer.destroyChildren()
      shapes = []
      nodes = new Map()
      layer.batchDraw()
    })
  },

  async animate(durationMs, count = 1000) {
    await bench.create(count)
    return measureAnimation(durationMs, () => {
      for (const s of shapes) {
        moveShape(s)
        nodes.get(s.id)!.position({ x: s.x, y: s.y })
      }
      layer.batchDraw()
    })
  },

  async debugStep(steps) {
    for (let i = 0; i < steps; i++) {
      for (const s of shapes) {
        moveShape(s)
        nodes.get(s.id)!.position({ x: s.x, y: s.y })
      }
    }
    layer.draw()
  },

  hitQuery(count) {
    const t0 = performance.now()
    let hits = 0
    for (let i = 0; i < count; i++) {
      const px = (i * 7919) % CANVAS_W
      const py = (i * 104729) % CANVAS_H
      // O(1) per query via Konva's color-keyed hit canvas.
      if (stage.getIntersection({ x: px, y: py })) hits++
    }
    return { ms: performance.now() - t0, hits }
  }
}

window.__bench = bench
