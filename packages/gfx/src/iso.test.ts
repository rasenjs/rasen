/**
 * The iso camera must agree with the integer arithmetic the 2D layer draws with.
 *
 * The check that matters is not "does it look isometric" but "does a world point
 * land on the same pixel the sprite layer would put it on", so the projection is
 * verified against the closed form: for a tile diamond `2h x 2v`, a world point
 * `(x, z)` is drawn at `((x - z) * h, (x + z) * v)`.
 */

import { describe, expect, it } from 'vitest'
import { orthoCameraFromTile, transformForTile } from './iso'
import { computeCameraMatrix } from './camera'

const TILE = { x: 80, y: 40 }

/** Project a world point to canvas pixels with the given config. */
function project(
  config: ReturnType<typeof orthoCameraFromTile>,
  world: { x: number; y: number; z: number },
  widthPx: number,
  heightPx: number,
): { x: number; y: number } {
  const { projection: p, view: v } = computeCameraMatrix(config, widthPx, heightPx)
  // Both are Mat4x4f; `source` is COLUMN-major (source[col * 4 + row]).
  const view = v.source
  const projection = p.source
  const vx = [
    view[0] * world.x + view[4] * world.y + view[8] * world.z + view[12],
    view[1] * world.x + view[5] * world.y + view[9] * world.z + view[13],
    view[2] * world.x + view[6] * world.y + view[10] * world.z + view[14],
  ]
  const cx =
    projection[0] * vx[0] + projection[4] * vx[1] + projection[8] * vx[2] + projection[12]
  const cy =
    projection[1] * vx[0] + projection[5] * vx[1] + projection[9] * vx[2] + projection[13]
  const cw =
    projection[3] * vx[0] + projection[7] * vx[1] + projection[11] * vx[2] + projection[15]
  // NDC (-1..1, y up) to canvas pixels (0..size, y down).
  return { x: ((cx / cw) * 0.5 + 0.5) * widthPx, y: (0.5 - (cy / cw) * 0.5) * heightPx }
}

describe('orthoCameraFromTile', () => {
  const width = 800
  const height = 600

  it('lands the target at the canvas centre', () => {
    const config = orthoCameraFromTile({ x: 12, y: 0, z: 34 }, { tile: TILE, width, height })
    const at = project(config, { x: 12, y: 0, z: 34 }, width, height)
    // The matrices are Float32, so a few 1e-5 px of rounding is the floor here.
    expect(at.x).toBeCloseTo(width / 2, 2)
    expect(at.y).toBeCloseTo(height / 2, 2)
  })

  it('projects the ground plane exactly like the 2D arithmetic', () => {
    const target = { x: 20, y: 0, z: 10 }
    const config = orthoCameraFromTile(target, { tile: TILE, width, height })
    const centre = project(config, target, width, height)
    // One tile along +X, +Z, and both at once: the deltas are the diamond's own.
    const plusX = project(config, { x: target.x + 1, y: 0, z: target.z }, width, height)
    const plusZ = project(config, { x: target.x, y: 0, z: target.z + 1 }, width, height)
    const plusBoth = project(config, { x: target.x + 1, y: 0, z: target.z + 1 }, width, height)
    expect(plusX.x - centre.x).toBeCloseTo(TILE.x, 4)
    expect(plusX.y - centre.y).toBeCloseTo(TILE.y, 4)
    expect(plusZ.x - centre.x).toBeCloseTo(-TILE.x, 4)
    expect(plusZ.y - centre.y).toBeCloseTo(TILE.y, 4)
    // Two tiles of the same axis cancel horizontally and double vertically.
    expect(plusBoth.x - centre.x).toBeCloseTo(0, 4)
    expect(plusBoth.y - centre.y).toBeCloseTo(2 * TILE.y, 4)
  })

  it('is distance-invariant, as an orthographic projection must be', () => {
    const target = { x: 5, y: 0, z: 5 }
    const near = orthoCameraFromTile(target, { tile: TILE, width, height, distance: 4 })
    const far = orthoCameraFromTile(target, { tile: TILE, width, height, distance: 40 })
    const a = project(near, { x: target.x + 3, y: 0, z: target.z }, width, height)
    const b = project(far, { x: target.x + 3, y: 0, z: target.z }, width, height)
    expect(a.x).toBeCloseTo(b.x, 2)
    expect(a.y).toBeCloseTo(b.y, 2)
  })

  it('scales with the canvas height, so a taller surface shows more world', () => {
    const target = { x: 0, y: 0, z: 0 }
    const short = orthoCameraFromTile(target, { tile: TILE, width, height: 400 })
    const tall = orthoCameraFromTile(target, { tile: TILE, width, height: 800 })
    const a = project(short, { x: 1, y: 0, z: 0 }, 800, 400)
    const b = project(tall, { x: 1, y: 0, z: 0 }, 800, 800)
    // A world unit covers the same PIXELS in both: same zoom-to-height ratio.
    expect(a.x - 400).toBeCloseTo(TILE.x, 4)
    expect(b.x - 400).toBeCloseTo(TILE.x, 4)
  })

  it('rejects a degenerate canvas', () => {
    expect(() => orthoCameraFromTile({ x: 0, y: 0, z: 0 }, { tile: TILE, width: 0, height: 10 })).toThrow()
  })

  it('rejects a diamond taller than wide, which no camera can match', () => {
    expect(() =>
      orthoCameraFromTile({ x: 0, y: 0, z: 0 }, { tile: { x: 40, y: 80 }, width, height }),
    ).toThrow(/must not exceed/)
  })
})

describe('transformForTile', () => {
  it('puts the model origin on the tile centre with its feet on the ground', () => {
    const p = transformForTile(7, 9, 0, 9)
    expect(p).toMatchObject({ x: 7, y: 0, z: 9 })
    expect(p.scale).toBeCloseTo(1 / 9, 12)
  })

  it('turns +Z towards the walker\'s world direction', () => {
    // rotateY(a) sends +Z to (sin a, 0, cos a); the walker's direction is
    // (cos facing, 0, sin facing), so facing 0 must be +X and facing PI/2 +Z.
    const facingX = transformForTile(0, 0, 0, 1)
    expect(Math.sin(facingX.rotationY)).toBeCloseTo(1, 12)
    expect(Math.cos(facingX.rotationY)).toBeCloseTo(0, 12)
    const facingZ = transformForTile(0, 0, Math.PI / 2, 1)
    expect(Math.sin(facingZ.rotationY)).toBeCloseTo(0, 12)
    expect(Math.cos(facingZ.rotationY)).toBeCloseTo(1, 12)
  })

  it('applies the caller\'s own scale on top of the unit conversion', () => {
    expect(transformForTile(0, 0, 0, 9, 2).scale).toBeCloseTo(2 / 9, 12)
  })

  it('refuses a zero unit count', () => {
    expect(() => transformForTile(0, 0, 0, 0)).toThrow()
  })
})
