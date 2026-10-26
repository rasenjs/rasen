/**
 * Turning a screen-space sprite into a quad the 3D camera draws in the same
 * pixels, at a depth of our choosing.
 *
 * The world is drawn by the 2D layer (`iso.ts`'s `toScreen`), and the characters
 * by an orthographic gfx camera that reproduces that projection exactly. A sprite
 * that has to take part in the depth buffer — a wall that must occlude a character
 * standing behind it — therefore needs both: the screen rectangle it always had,
 * and a world position whose projection lands on that rectangle.
 *
 * For an orthographic camera that is a linear solve, not a search. Screen space is
 * an affine function of world space, so pinning the rectangle's corners and a
 * depth gives three equations per corner for its three world coordinates.
 * Working in VIEW space is the short form of the same thing: a point at view
 * `(vx, vy, -depth)` projects to `centre + (vx, -vy) · pixelsPerUnit`, so the
 * desired rectangle gives the view coordinates directly, and the inverse view
 * matrix gives the world ones.
 */

import { computeCameraMatrix, type CameraConfig } from '@rasenjs/gfx'
import { Mat4x4f } from '@rasenjs/math'

/** A rectangle in canvas pixels, top-left origin. */
export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

/** Four world-space corners, in the order top-left, top-right, bottom-right, bottom-left. */
export interface WorldQuad {
  /** xyzw per corner, 16 floats. */
  corners: Float32Array
  /** The depth used, in view space. */
  depth: number
}

/**
 * The world-space quad whose projection is exactly `rect`, at `depth`.
 *
 * `depth` is view-space distance from the camera: smaller is nearer. Two sprites
 * that must layer against each other are ordered by it, and against the models by
 * the same measure, which is the point of doing this at all.
 *
 * @param rect the rectangle in canvas pixels
 * @param depth view-space distance from the camera (must be positive)
 * @param camera the camera the layer draws with — the SAME config, or the quad
 *   will not land where the 2D layer put the sprite
 * @param width canvas width in px
 * @param height canvas height in px
 * @returns the four corners in world space
 *
 * @example
 * ```ts
 * const quad = screenRectToWorld({ x: 120, y: 80, width: 160, height: 96 }, 7, config, w, h)
 * ```
 */
export function screenRectToWorld(
  rect: ScreenRect,
  depth: number,
  camera: CameraConfig,
  width: number,
  height: number,
): WorldQuad {
  if (!(depth > 0)) throw new Error('screenRectToWorld: depth must be positive')
  const { view } = computeCameraMatrix(camera, width, height)
  // Row-vector convention throughout this codebase: a point is `p * M`, so the
  // world is the view point times the INVERSE view matrix.
  const inverseView = view.invert().source
  const pixelsPerUnit = pixelsPerUnitOf(camera, height)

  const cx = width / 2
  const cy = height / 2
  const corners = new Float32Array(16)
  // Clockwise from the rectangle's top-left in canvas space. Canvas Y grows
  // down and view Y grows up, hence the negation.
  const screenCorners: Array<[number, number]> = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ]
  for (let i = 0; i < 4; i += 1) {
    const [sx, sy] = screenCorners[i]
    const vx = (sx - cx) / pixelsPerUnit
    const vy = -(sy - cy) / pixelsPerUnit
    const vz = -depth
    // World = view * inverseView (row-vector), translation in the last row.
    corners[i * 4] = vx * inverseView[0] + vy * inverseView[4] + vz * inverseView[8] + inverseView[12]
    corners[i * 4 + 1] = vx * inverseView[1] + vy * inverseView[5] + vz * inverseView[9] + inverseView[13]
    corners[i * 4 + 2] = vx * inverseView[2] + vy * inverseView[6] + vz * inverseView[10] + inverseView[14]
    corners[i * 4 + 3] = 1
  }
  return { corners, depth }
}

/**
 * Canvas pixels per world unit for this camera.
 *
 * An orthographic camera shows `distance / zoom` world units of height across
 * `height` pixels, so one world unit spans `height * zoom / distance` of them. The
 * camera does not store its distance, but it does store its eye and its look-at
 * target, and their separation IS that distance.
 */
export function pixelsPerUnitOf(camera: CameraConfig, height: number): number {
  const zoom = camera.zoom ?? 1
  const target = camera.target as { x: number; y: number; z: number } | undefined
  if (target === undefined) throw new Error('pixelsPerUnitOf: the camera has no look-at target')
  const distance = Math.hypot(
    (camera.x ?? 0) - target.x,
    (camera.y ?? 0) - target.y,
    (camera.z ?? 0) - target.z,
  )
  if (!(distance > 0)) throw new Error('pixelsPerUnitOf: the camera sits on its target')
  return (height * zoom) / distance
}

/** Project a world point to canvas pixels with the given camera. */
export function projectToScreen(
  point: { x: number; y: number; z: number },
  camera: CameraConfig,
  width: number,
  height: number,
): { x: number; y: number } {
  const { projection, view } = computeCameraMatrix(camera, width, height)
  const v = [
    view.source[0] * point.x + view.source[4] * point.y + view.source[8] * point.z + view.source[12],
    view.source[1] * point.x + view.source[5] * point.y + view.source[9] * point.z + view.source[13],
    view.source[2] * point.x + view.source[6] * point.y + view.source[10] * point.z + view.source[14],
  ]
  const p = projection.source
  const cx = p[0] * v[0] + p[4] * v[1] + p[8] * v[2] + p[12]
  const cy = p[1] * v[0] + p[5] * v[1] + p[9] * v[2] + p[13]
  const cw = p[3] * v[0] + p[7] * v[1] + p[11] * v[2] + p[15]
  return { x: ((cx / cw) * 0.5 + 0.5) * width, y: (0.5 - (cy / cw) * 0.5) * height }
}

/** Re-export so a caller does not import two matrix types. */
export type { Mat4x4f }
