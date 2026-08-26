/**
 * Fabric.js — measured in its default idiomatic configuration (interactive
 * `Canvas` with its overlay interaction surface). Bulk mutations use the
 * documented pattern: `renderOnAddRemove: false` + one explicit
 * `requestRenderAll()` after the batch.
 */

import { Canvas, Rect, Circle } from 'fabric'
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

const canvas = new Canvas(installCanvas(), {
  width: CANVAS_W,
  height: CANVAS_H,
  renderOnAddRemove: false
})

// Single source of truth, mirrored into Fabric objects by id.
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
      fill: PALETTE[s.colorIndex]
    })
  }
  const r = circleRadius(s)
  return new Circle({
    left: s.x - r,
    top: s.y - r,
    radius: r,
    fill: PALETTE[s.colorIndex]
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
  obj.setCoords()
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
  },

  hitQuery(count) {
    const t0 = performance.now()
    let hits = 0
    const objects = canvas.getObjects()
    for (let i = 0; i < count; i++) {
      const px = (i * 7919) % CANVAS_W
      const py = (i * 104729) % CANVAS_H
      // Topmost-first scan using Fabric's public point-in-object test.
      let hit = false
      for (let j = objects.length - 1; j >= 0 && !hit; j--) {
        hit = objects[j].containsPoint({ x: px, y: py })
      }
      if (hit) hits++
    }
    return { ms: performance.now() - t0, hits }
  }
}

window.__bench = bench
