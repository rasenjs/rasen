/**
 * @rasenjs/canvas-2d — idiomatic reactive usage: an `each` list whose items
 * bind per-property refs; any ref change marks the canvas dirty and the
 * RenderContext coalesces one full-scene redraw per frame. No explicit draw
 * calls anywhere — reactivity drives rendering.
 *
 * Anchor note: the shared spec speaks in shape CENTERS. Rasen's rect anchors
 * at top-left while circle anchors at its center, so rect bindings store
 * top-left refs and circles bind their center refs directly.
 */

import { each } from '@rasenjs/core'
import { useReactiveRuntime, ref } from '@rasenjs/reactive-vue'
import { canvas, mount } from '@rasenjs/dom'
import { rect, circle, getRenderContext } from '@rasenjs/canvas-2d'
import {
  timed,
  measureAnimation,
  nextPaint,
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

useReactiveRuntime()

/** Bound refs per shape. Circles use x/y/radius/fill; rects use all five. */
interface ShapeRefs {
  x: ReturnType<typeof ref<number>>
  y: ReturnType<typeof ref<number>>
  w: ReturnType<typeof ref<number>>
  h: ReturnType<typeof ref<number>>
  radius: ReturnType<typeof ref<number>>
  fill: ReturnType<typeof ref<string>>
}

let shapes: ShapeSpec[] = []
const shapesRef = ref<ShapeSpec[]>([])
const refsById = new Map<number, ShapeRefs>()

function makeRefs(s: ShapeSpec): ShapeRefs {
  if (s.kind === 'rect') {
    const { w, h } = rectSize(s)
    return {
      x: ref(s.x - w / 2),
      y: ref(s.y - h / 2),
      w: ref(w),
      h: ref(h),
      radius: ref(0),
      fill: ref(PALETTE[s.colorIndex])
    }
  }
  return {
    x: ref(s.x),
    y: ref(s.y),
    w: ref(0),
    h: ref(0),
    radius: ref(circleRadius(s)),
    fill: ref(PALETTE[s.colorIndex])
  }
}

/** Push the full spec state into the bound refs (position + size + color). */
function syncRefs(s: ShapeSpec): void {
  const r = refsById.get(s.id)!
  r.fill.value = PALETTE[s.colorIndex]
  if (s.kind === 'rect') {
    const { w, h } = rectSize(s)
    r.x.value = s.x - w / 2
    r.y.value = s.y - h / 2
    r.w.value = w
    r.h.value = h
  } else {
    r.x.value = s.x
    r.y.value = s.y
    r.radius.value = circleRadius(s)
  }
}

function renderShape(s: ShapeSpec) {
  const r = refsById.get(s.id)!
  return s.kind === 'rect'
    ? rect({ x: r.x, y: r.y, width: r.w, height: r.h, fill: r.fill })
    : circle({ x: r.x, y: r.y, radius: r.radius, fill: r.fill })
}

function moveShape(s: ShapeSpec): void {
  const { vx, vy } = velocity(s.id)
  const { hx, hy } = halfExtents(s)
  s.x += vx
  s.y += vy
  if (s.x < hx || s.x > CANVAS_W - hx) s.x = Math.max(hx, Math.min(CANVAS_W - hx, s.x))
  if (s.y < hy || s.y > CANVAS_H - hy) s.y = Math.max(hy, Math.min(CANVAS_H - hy, s.y))
  // Position-only ref writes; sizes/colors unchanged.
  const r = refsById.get(s.id)!
  if (s.kind === 'rect') {
    const { w, h } = rectSize(s)
    r.x.value = s.x - w / 2
    r.y.value = s.y - h / 2
  } else {
    r.x.value = s.x
    r.y.value = s.y
  }
}

const bench: BenchAPI = {
  async create(count) {
    return timed(() => {
      refsById.clear()
      shapes = generateShapes(count)
      const fresh: ShapeSpec[] = []
      for (const s of shapes) {
        // New object identity per scene => each() treats it as a new row.
        const copy = { ...s }
        refsById.set(copy.id, makeRefs(copy))
        fresh.push(copy)
      }
      shapes = fresh
      shapesRef.value = fresh
    })
  },

  async updateEvery10th() {
    return timed(() => {
      for (const s of shapes) {
        if (s.id % UPDATE_STRIDE !== 0) continue
        applyUpdateRule(s)
        syncRefs(s)
      }
    })
  },

  async clear() {
    return timed(() => {
      shapes = []
      shapesRef.value = []
      refsById.clear()
    })
  },

  async animate(durationMs, count = 1000) {
    await bench.create(count)
    return measureAnimation(durationMs, () => {
      for (const s of shapes) moveShape(s)
    })
  },

  async debugStep(steps) {
    for (let i = 0; i < steps; i++) {
      for (const s of shapes) moveShape(s)
    }
    // Rendering is rAF-scheduled by the RenderContext — wait one frame so
    // the coalesced redraw of the final state has actually run.
    await nextPaint()
  },

  hitQuery(count) {
    const r = ensureRc()
    if (!r) return { ms: NaN, hits: 0 }
    const t0 = performance.now()
    let hits = 0
    for (let i = 0; i < count; i++) {
      const px = (i * 7919) % CANVAS_W
      const py = (i * 104729) % CANVAS_H
      if (r.hitTest(px, py)) hits++
    }
    return { ms: performance.now() - t0, hits }
  }
}

mount(
  canvas({
    width: CANVAS_W,
    height: CANVAS_H,
    children: [each(() => shapesRef.value, renderShape)]
  }),
  document.getElementById('app')!
)

// Lazily capture the auto-created RenderContext. It does not exist until the
// first shape mounts (empty initial list → no createNode calls), so resolve
// it on first use instead of at module load.
let rc: ReturnType<typeof getRenderContext> | null = null
function ensureRc(): ReturnType<typeof getRenderContext> | null {
  if (!rc) {
    const el = document.querySelector('#app canvas') as HTMLCanvasElement | null
    if (el) {
      try {
        rc = getRenderContext(el.getContext('2d')!)
      } catch {
        rc = null // scene still empty — nothing mounted yet
      }
    }
  }
  return rc
}

window.__bench = bench
