/**
 * Vanilla Canvas 2D — imperative baseline (the denominator of every ratio).
 * One full-scene redraw per change, scheduled through rAF like the other
 * libraries schedule theirs.
 */

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
  type ShapeSpec
} from '../shared/spec'

const canvas = installCanvas()
const ctx = canvas.getContext('2d')!

let shapes: ShapeSpec[] = []
let drawScheduled = false

function draw(): void {
  drawScheduled = false
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  for (const s of shapes) {
    ctx.fillStyle = PALETTE[s.colorIndex]
    if (s.kind === 'rect') {
      const { w, h } = rectSize(s)
      ctx.fillRect(s.x - w / 2, s.y - h / 2, w, h)
    } else {
      ctx.beginPath()
      ctx.arc(s.x, s.y, circleRadius(s), 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function scheduleDraw(): void {
  if (drawScheduled) return
  drawScheduled = true
  requestAnimationFrame(draw)
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
      shapes = generateShapes(count)
      scheduleDraw()
    })
  },

  async updateEvery10th() {
    return timed(() => {
      for (const s of shapes) applyUpdateRule(s)
      scheduleDraw()
    })
  },

  async clear() {
    return timed(() => {
      shapes = []
      scheduleDraw()
    })
  },

  async animate(durationMs, count = 1000) {
    await bench.create(count)
    return measureAnimation(durationMs, () => {
      for (const s of shapes) moveShape(s)
      draw()
    })
  },

  async debugStep(steps) {
    for (let i = 0; i < steps; i++) {
      for (const s of shapes) moveShape(s)
    }
    draw()
  },

  hitQuery(count) {
    const t0 = performance.now()
    let hits = 0
    for (let i = 0; i < count; i++) {
      const px = (i * 7919) % CANVAS_W
      const py = (i * 104729) % CANVAS_H
      // Topmost-first scan, exact geometry — mirrors RenderContext.hitTest.
      let hit = false
      for (let j = shapes.length - 1; j >= 0 && !hit; j--) {
        const s = shapes[j]
        if (s.kind === 'rect') {
          const { w, h } = rectSize(s)
          hit = px >= s.x - w / 2 && px <= s.x + w / 2 && py >= s.y - h / 2 && py <= s.y + h / 2
        } else {
          const r = circleRadius(s)
          const dx = px - s.x
          const dy = py - s.y
          hit = dx * dx + dy * dy <= r * r
        }
      }
      if (hit) hits++
    }
    return { ms: performance.now() - t0, hits }
  }
}

window.__bench = bench
