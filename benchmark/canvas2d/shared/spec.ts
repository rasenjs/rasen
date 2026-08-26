/**
 * Shared scene spec — the fairness contract of this benchmark.
 *
 * EVERY target page (vanilla / konva / fabric / rasen) renders exactly this
 * scene: same canvas size, same deterministic shapes (seeded RNG), same
 * update rule, same animation velocities. The ONLY variable between targets
 * is the rendering library.
 *
 * Coordinate convention: (x, y) is the shape CENTER. Each library maps it to
 * its own anchor system (Konva offset, Fabric origin, Rasen rect top-left).
 */

export const CANVAS_W = 1280
export const CANVAS_H = 720

/** Shapes created by the `create` scenario. */
export const SHAPE_COUNT = 1000

/** `updateEvery10th` mutates every N-th shape (1000/10 = 100 mutations). */
export const UPDATE_STRIDE = 10

export const PALETTE = [
  '#667eea',
  '#764ba2',
  '#ff6b6b',
  '#4ecdc4',
  '#ffd93d',
  '#6bcf7f',
  '#a29bfe',
  '#fd79a8',
  '#00b894',
  '#e17055',
  '#74b9ff',
  '#fab1a0'
]

export type ShapeKind = 'rect' | 'circle'

export interface ShapeSpec {
  id: number
  kind: ShapeKind
  /** Center x */
  x: number
  /** Center y */
  y: number
  /**
   * Size scalar: rect is size*1.6 × size; circle radius is size/2.
   * Keeps visual area comparable across kinds.
   */
  size: number
  colorIndex: number
}

/** Deterministic PRNG (mulberry32) so every target gets identical shapes. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Generate the canonical scene. Same output on every page, every run. */
export function generateShapes(count: number = SHAPE_COUNT): ShapeSpec[] {
  const rand = mulberry32(42)
  const shapes: ShapeSpec[] = []
  for (let i = 0; i < count; i++) {
    const size = 8 + rand() * 22
    shapes.push({
      id: i,
      kind: i % 2 === 0 ? 'rect' : 'circle',
      x: size + rand() * (CANVAS_W - size * 2),
      y: size + rand() * (CANVAS_H - size * 2),
      size,
      colorIndex: Math.floor(rand() * PALETTE.length)
    })
  }
  return shapes
}

/**
 * Update rule for `updateEvery10th`: every UPDATE_STRIDE-th shape gets a new
 * palette color and grows by 25%. Deterministic across targets.
 */
export function applyUpdateRule(s: ShapeSpec): void {
  if (s.id % UPDATE_STRIDE !== 0) return
  s.colorIndex = (s.colorIndex + 5) % PALETTE.length
  s.size *= 1.25
}

/** Rect dimensions from the size scalar. */
export function rectSize(s: ShapeSpec): { w: number; h: number } {
  return { w: s.size * 1.6, h: s.size }
}

/** Circle radius from the size scalar. */
export function circleRadius(s: ShapeSpec): number {
  return s.size / 2
}

/** Half-extents per kind — used for wall bouncing during animation. */
export function halfExtents(s: ShapeSpec): { hx: number; hy: number } {
  if (s.kind === 'rect') {
    const { w, h } = rectSize(s)
    return { hx: w / 2, hy: h / 2 }
  }
  const r = circleRadius(s)
  return { hx: r, hy: r }
}

/** Deterministic per-shape velocity (px/frame at 60Hz reference). */
export function velocity(id: number): { vx: number; vy: number } {
  return {
    vx: (((id * 7) % 13) - 6) * 0.8,
    vy: (((id * 11) % 13) - 6) * 0.8
  }
}
