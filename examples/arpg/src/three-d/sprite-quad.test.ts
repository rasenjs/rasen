/**
 * The screen rectangle → world quad conversion, checked the only way that
 * matters: project the answer back and see the pixels it lands on.
 *
 * This is the piece that lets a sprite take part in the depth buffer WITHOUT
 * moving a single pixel, so a mismatch here is a wall that steps sideways.
 */

import { describe, expect, it } from 'vitest'
import { orthoCameraFromTile } from '@rasenjs/gfx'
import {
  pixelsPerUnitOf,
  projectToScreen,
  screenRectToWorld,
  type ScreenRect,
} from './sprite-quad'

const TILE = { x: 80, y: 40 }
const WIDTH = 1062
const HEIGHT = 549
/** The town's camera: one tile is 160x80 px, 9 model units to the tile. */
const camera = orthoCameraFromTile(
  { x: 40, y: 0, z: 20 },
  { tile: TILE, width: WIDTH, height: HEIGHT, distance: 7 },
)

/** A corner of the quad, as a world point. */
function cornerAt(quad: { corners: Float32Array }, index: number) {
  return {
    x: quad.corners[index * 4],
    y: quad.corners[index * 4 + 1],
    z: quad.corners[index * 4 + 2],
  }
}

describe('pixelsPerUnitOf', () => {
  it('reads the scale the zoom was built against', () => {
    // `orthoCameraFromTile` sets zoom so that one world unit is `tile.x * √2` px.
    expect(pixelsPerUnitOf(camera, HEIGHT)).toBeCloseTo(TILE.x * Math.SQRT2, 2)
  })

  it('refuses a camera with no target', () => {
    expect(() => pixelsPerUnitOf({ zoom: 1 }, HEIGHT)).toThrow()
  })
})

describe('screenRectToWorld', () => {
  const rect: ScreenRect = { x: 331, y: 180, width: 160, height: 96 }

  it('lands the four corners exactly on the rectangle', () => {
    const quad = screenRectToWorld(rect, 7, camera, WIDTH, HEIGHT)
    const expected: Array<[number, number]> = [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x + rect.width, rect.y + rect.height],
      [rect.x, rect.y + rect.height],
    ]
    for (let i = 0; i < 4; i += 1) {
      const at = projectToScreen(cornerAt(quad, i), camera, WIDTH, HEIGHT)
      // Float32 matrices, so a fraction of a pixel is the arithmetic's floor.
      expect(at.x).toBeCloseTo(expected[i][0], 1)
      expect(at.y).toBeCloseTo(expected[i][1], 1)
    }
  })

  it('builds a quad parallel to the image plane, so it reads as a billboard', () => {
    // Every corner at the same VIEW-space depth. If they differed the quad would
    // be tilted: it would still project to the rectangle, but it would slice
    // through the models instead of facing them.
    const depth = 7
    const quad = screenRectToWorld(rect, depth, camera, WIDTH, HEIGHT)
    const eye = { x: camera.x!, y: camera.y!, z: camera.z! }
    const toTarget = {
      x: camera.target!.x - eye.x,
      y: camera.target!.y - eye.y,
      z: camera.target!.z - eye.z,
    }
    const length = Math.hypot(toTarget.x, toTarget.y, toTarget.z)
    const forward = { x: toTarget.x / length, y: toTarget.y / length, z: toTarget.z / length }
    for (let i = 0; i < 4; i += 1) {
      const p = cornerAt(quad, i)
      // Distance along the view direction from the eye.
      const along = (p.x - eye.x) * forward.x + (p.y - eye.y) * forward.y + (p.z - eye.z) * forward.z
      expect(along).toBeCloseTo(depth, 4)
    }
    expect(quad.depth).toBe(depth)
  })

  it('keeps the same screen rectangle whatever depth it is given', () => {
    // The whole point: depth chooses layering, not position. A sprite must not
    // drift when a nearer one is drawn in front of it.
    for (const depth of [2, 7, 30]) {
      const quad = screenRectToWorld(rect, depth, camera, WIDTH, HEIGHT)
      const at = projectToScreen(cornerAt(quad, 0), camera, WIDTH, HEIGHT)
      expect(at.x).toBeCloseTo(rect.x, 1)
      expect(at.y).toBeCloseTo(rect.y, 1)
    }
  })

  it('moves a world point nearer the camera when the depth is smaller', () => {
    // Depth is a real distance, so a smaller one must be closer to the eye.
    const near = screenRectToWorld(rect, 2, camera, WIDTH, HEIGHT)
    const far = screenRectToWorld(rect, 20, camera, WIDTH, HEIGHT)
    const eye = { x: camera.x!, y: camera.y!, z: camera.z! }
    const d = (p: { x: number; y: number; z: number }) =>
      Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z)
    expect(d(cornerAt(near, 0))).toBeLessThan(d(cornerAt(far, 0)))
  })

  it('refuses a depth that is not in front of the camera', () => {
    expect(() => screenRectToWorld(rect, 0, camera, WIDTH, HEIGHT)).toThrow()
    expect(() => screenRectToWorld(rect, -3, camera, WIDTH, HEIGHT)).toThrow()
  })
})
