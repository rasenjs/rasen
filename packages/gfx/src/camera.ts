/**
 * Camera configuration — intrinsic to the canvas, not a child component.
 *
 * A single flat config serves both 2D and 3D. 2D is the degenerate form of
 * 3D: `z=0`, no target, orthographic. Moving from 2D to 3D only ADDS fields,
 * never changes the shape. x/y mean the same thing in both modes: "the world
 * point that lands at the screen center".
 *
 * ## 2D mode (default)
 *
 * `x`/`y` = pan (the world point at the screen center), `zoom` = ortho scale.
 * Omitting the camera prop entirely defaults to `{ x: 0, y: 0, zoom: 1 }`.
 *
 * ```tsx
 * <canvas camera={{ x: 100, y: -50, zoom: 1.5 }}>
 *   <spine skeleton={data} />
 * </canvas>
 * ```
 *
 * ## 3D look-at mode
 *
 * `target` and/or `fov` switch to lookAt view. With `fov` → perspective;
 * without → orthographic (bounds inferred from eye-to-target distance).
 *
 * ```tsx
 * <canvas camera={{
 *   x: 0, y: 300, z: 500,
 *   target: { x: 0, y: 0, z: 0 },
 *   fov: Math.PI / 3
 * }}>
 *   <mesh geometry={...} />
 * </canvas>
 * ```
 *
 * ## Z-axis
 *
 * All content lives in world space. Z=0 is the default plane; positive Z goes
 * into the screen (right-hand). Spine renders at Z=0; 3D meshes use their own.
 */

import { Mat4x4f, Vec3f, vec3f } from '@rasenjs/math'

/** Position type (accepts Vec3f or plain object). */
type Vec3Input = Vec3f | { x: number; y: number; z: number }

function toVec3(v: Vec3Input): Vec3f {
  return v instanceof Vec3f ? v : vec3f(v.x, v.y, v.z)
}

// ---------------------------------------------------------------------------
// Flat camera config (shared by 2D and 3D)
// ---------------------------------------------------------------------------

export interface CameraConfig {
  /** Camera world X. 2D: pan (world point at screen center). 3D: eye X. */
  x?: number
  /** Camera world Y. 2D: pan. 3D: eye Y. */
  y?: number
  /** Camera world Z. 2D: leave 0. 3D: eye Z (into the screen). Default 0. */
  z?: number
  /** Orthographic zoom. Shared by 2D and 3D-ortho (three.js convention). Default 1. */
  zoom?: number
  /** Look-at target in world space. Presence switches to lookAt view. */
  target?: Vec3Input
  /** Vertical FOV in radians. Presence switches to perspective projection. */
  fov?: number
  /** Up vector for lookAt. Default (0, 1, 0). */
  up?: Vec3Input
  /** Near clip plane (3D). Default 0.1. */
  near?: number
  /** Far clip plane (3D). Default 1000. */
  far?: number
}

/** Type guard: does this config need a lookAt view (3D)? */
export function isLookAtCamera(c: CameraConfig | undefined): boolean {
  return c != null && ('target' in c || 'fov' in c)
}

// ---------------------------------------------------------------------------
// Matrix computation
// ---------------------------------------------------------------------------

/**
 * Compute the projection × view matrix from a camera config.
 *
 * 2D: ortho over the visible world rect [x ± W/2zoom] × [y ± H/2zoom] —
 * correct NDC output (pixels are NOT clip space), pan = world point at the
 * screen center, matching the Canvas2D composition
 * translate(W/2,H/2) ∘ scale(Z,-Z) ∘ translate(-x,-y).
 *
 * 3D: lookAt view; perspective (fov) or orthographic projection.
 */
export function computeCameraMatrix(
  config: CameraConfig | undefined,
  canvasWidth: number,
  canvasHeight: number
): { projection: Mat4x4f; view: Mat4x4f } {
  if (!config || !isLookAtCamera(config)) {
    const x = config?.x ?? 0
    const y = config?.y ?? 0
    const zoom = config?.zoom ?? 1

    const halfW = canvasWidth / (2 * zoom)
    const halfH = canvasHeight / (2 * zoom)
    const projection = Mat4x4f.ortho(
      x - halfW, x + halfW,
      y - halfH, y + halfH,
      -1000, 1000
    )
    const view = Mat4x4f.identity()
    return { projection, view }
  }

  // 3D look-at mode
  const eye = vec3f(config.x ?? 0, config.y ?? 0, config.z ?? 0)
  const target = toVec3(config.target ?? { x: 0, y: 0, z: 0 })
  const up = config.up ? toVec3(config.up) : vec3f(0, 1, 0)
  const near = config.near ?? 0.1
  const far = config.far ?? 1000
  const zoom = config.zoom ?? 1
  const aspect = canvasWidth / canvasHeight

  const view = Mat4x4f.lookAt(eye, target, up)

  if (config.fov != null) {
    // Perspective
    const projection = Mat4x4f.perspective(config.fov, aspect, near, far)
    return { projection, view }
  } else {
    // Orthographic: bounds from eye-to-target distance, scaled by zoom
    const dist = eye.subtract(target).length()
    const halfH = dist / (2 * zoom)
    const halfW = halfH * aspect
    const projection = Mat4x4f.ortho(-halfW, halfW, -halfH, halfH, near, far)
    return { projection, view }
  }
}
