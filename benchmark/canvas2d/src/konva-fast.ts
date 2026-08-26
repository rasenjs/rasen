/**
 * Konva (tuned) — same scene as konva.ts but with Konva's documented
 * performance knobs applied for a non-interactive rendering workload:
 *   - Layer `listening: false`  → hit canvas is never drawn (default draws
 *     every shape twice: scene + hit graph)
 *   - per-shape `perfectDrawEnabled: false` and
 *     `shadowForStrokeEnabled: false` (official perf guide)
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
const layer = new Konva.Layer({ listening: false })
stage.add(layer)

const shell = document.querySelector('#app > canvas')
shell?.remove()

let shapes: ShapeSpec[] = []
let nodes = new Map<number, Konva.Shape>()

const PERF_SHAPE_OPTS = {
  perfectDrawEnabled: false,
  shadowForStrokeEnabled: false
} as const

function toNode(s: ShapeSpec): Konva.Shape {
  if (s.kind === 'rect') {
    const { w, h } = rectSize(s)
    return new Konva.Rect({
      x: s.x,
      y: s.y,
      offsetX: w / 2,
      offsetY: h / 2,
      width: w,
      height: h,
      fill: PALETTE[s.colorIndex],
      ...PERF_SHAPE_OPTS
    })
  }
  return new Konva.Circle({
    x: s.x,
    y: s.y,
    radius: circleRadius(s),
    fill: PALETTE[s.colorIndex],
    ...PERF_SHAPE_OPTS
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
  }
}

window.__bench = bench
