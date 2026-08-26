/**
 * Fabric (tuned) — same scene as fabric.ts but with Fabric's documented
 * performance knobs for a pure-rendering workload:
 *   - StaticCanvas instead of interactive Canvas (no upper overlay canvas,
 *     no targeting/group machinery)
 *   - enableRetinaScaling: false → 1× backing store like every other target
 *     (Fabric defaults to DPR scaling; on a Mac that is 4× the pixels)
 *   - objectCaching: false on shapes → no per-shape offscreen cache canvas
 *     allocation/rasterization (the default caches every shape)
 *   - no setCoords() in updates (interaction-only bookkeeping)
 */

import { StaticCanvas, Rect, Circle } from 'fabric'
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

const canvas = new StaticCanvas(installCanvas(), {
  width: CANVAS_W,
  height: CANVAS_H,
  renderOnAddRemove: false,
  enableRetinaScaling: false
})

let shapes: ShapeSpec[] = []
let objects = new Map<number, Rect | Circle>()

function toObject(s: ShapeSpec): Rect | Circle {
  if (s.kind === 'rect') {
    const { w, h } = rectSize(s)
    return new Rect({
      left: s.x - w / 2,
      top: s.y - h / 2,
      width: w,
      height: h,
      fill: PALETTE[s.colorIndex],
      objectCaching: false
    })
  }
  const r = circleRadius(s)
  return new Circle({
    left: s.x - r,
    top: s.y - r,
    radius: r,
    fill: PALETTE[s.colorIndex],
    objectCaching: false
  })
}

function syncAttrs(obj: Rect | Circle, s: ShapeSpec): void {
  obj.set({ fill: PALETTE[s.colorIndex] })
  if (s.kind === 'rect') {
    const { w, h } = rectSize(s)
    obj.set({ width: w, height: h, left: s.x - w / 2, top: s.y - h / 2 })
  } else {
    const r = circleRadius(s)
    obj.set({ radius: r, left: s.x - r, top: s.y - r })
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
      canvas.remove(...canvas.getObjects())
      objects.clear()
      shapes = generateShapes(count)
      const created: (Rect | Circle)[] = []
      for (const s of shapes) {
        const obj = toObject(s)
        objects.set(s.id, obj)
        created.push(obj)
      }
      canvas.add(...created)
      canvas.requestRenderAll()
    })
  },

  async updateEvery10th() {
    return timed(() => {
      for (const s of shapes) {
        if (s.id % UPDATE_STRIDE !== 0) continue
        applyUpdateRule(s)
        syncAttrs(objects.get(s.id)!, s)
      }
      canvas.requestRenderAll()
    })
  },

  async clear() {
    return timed(() => {
      canvas.remove(...canvas.getObjects())
      objects.clear()
      shapes = []
      canvas.requestRenderAll()
    })
  },

  async animate(durationMs, count = 1000) {
    await bench.create(count)
    return measureAnimation(durationMs, () => {
      for (const s of shapes) {
        moveShape(s)
        const obj = objects.get(s.id)!
        if (s.kind === 'rect') {
          const { w, h } = rectSize(s)
          obj.set({ left: s.x - w / 2, top: s.y - h / 2 })
        } else {
          const r = circleRadius(s)
          obj.set({ left: s.x - r, top: s.y - r })
        }
      }
      canvas.requestRenderAll()
    })
  },

  async debugStep(steps) {
    for (let i = 0; i < steps; i++) {
      for (const s of shapes) {
        moveShape(s)
        const obj = objects.get(s.id)!
        if (s.kind === 'rect') {
          const { w, h } = rectSize(s)
          obj.set({ left: s.x - w / 2, top: s.y - h / 2 })
        } else {
          const r = circleRadius(s)
          obj.set({ left: s.x - r, top: s.y - r })
        }
      }
    }
    canvas.renderAll()
  }
}

window.__bench = bench
