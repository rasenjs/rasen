/**
 * 3D actor-layer projection — an orthographic camera that aligns EXACTLY with
 * the game's 2:1 isometric 2D projection (`../iso.ts`).
 *
 * ## The 2D projection being matched
 *
 * `toScreen(wx, wy, heightPx) = { x: (wx - wy) * 80, y: (wx + wy) * 40 - heightPx }`
 * — tile coordinates on the ground plane, height in px. The world→screen scale
 * is therefore 80 px per tile along the screen-x diagonal and 40 px per tile
 * along screen-y: the classic 2:1 dimetric diamond (160 x 80 px tiles).
 *
 * ## The camera
 *
 * World space: X and Z are the ground plane in TILE units (X = `wx`,
 * Z = `wy`), Y is up. A `@rasenjs/gfx` orthographic look-at camera
 * (`computeCameraMatrix`) reproduces `toScreen` exactly when:
 *
 * - eye direction (target → eye) = (sin45°·cos30°, sin30°, cos45°·cos30°)
 *   = (0.6123724, 0.5, 0.6123724) — yaw 45°, pitch 30° — times any distance
 *   `dist`, with `up = (0, 1, 0)`;
 * - `target` is the world point that must land at the canvas center and
 *   `eye = target + dist · dir`;
 * - no `fov` (orthographic), generous `near`/`far`;
 * - `zoom = 80√2 · dist / canvasHeightPx`, because the ortho half-height is
 *   `dist / (2 · zoom)` and the world→screen scale `m = canvasHeight · zoom /
 *   dist` must equal 80√2 (see below).
 *
 * Why the scale is 80√2: the camera's screen-right axis is
 * `xAxis = up × dir` normalized = (1/√2, 0, -1/√2), so one world X unit moves
 * `m/√2` px right and one world Z unit `m/√2` px left. Matching `toScreen`'s
 * 80 px requires `m/√2 = 80`, i.e. `m = 80√2 ≈ 113.137` px per world unit.
 * The screen-up axis is yAxis = (-1/(2√2), √3/2, -1/(2√2)), which gives the
 * resulting screen deltas per world unit:
 *
 *   X̂ → (+80, +40) px,   Ẑ → (-80, +40) px,   Ŷ → (0, -40√6 ≈ -98.0) px
 *
 * so ground tiles follow `toScreen` EXACTLY and a Y-up unit rises 98 px. The
 * Y rise is `80√2 · √3/2 = 40√6 = 97.9796` px.
 *
 * ## Facing convention
 *
 * `facing` is a world angle in radians, measured in the ground plane exactly
 * like the game's (`../iso.ts`: `worldAngleToIso`, `screenDeltaToWorldAngle`):
 * direction = (cos facing, 0, sin facing) in (X, Z) = (tileX, tileY) terms, so
 * facing 0 walks toward +X (screen right-down, the game's "screen east") and
 * facing π/2 toward +Z (screen left-down, the game's "screen south").
 *
 * Model space is Y-up like world space and the model's forward is **+Z**.
 * That is measured, not guessed: in `head_lod3.model` the face features sit at
 * z ≈ +0.45…+0.66 while the hair/ponytail extends back to z ≈ -1.30. A model
 * at `facing = 0` therefore looks along world +X, and the placement rotation
 * about Y is `facing - π/2` (gfx's `rotateY(a)` maps +Z to (-sin a, 0, cos a)).
 *
 * ## Calibration of MODEL_UNITS_PER_TILE
 *
 * Measured (not chosen):
 *
 * (a) Amazon full-body height in model units: **7.17**. The body-part models
 *     share one character space (vertex-exact bounds over all meshes of the
 *     staged `.model` files under `public/original/models/`): legs
 *     `y ∈ [0.002, 4.340]`, torso `y ∈ [3.838, 5.782]`, head `y ∈ [4.808,
 *     7.172]` — feet at y ≈ 0, head top at y ≈ 7.172, so the figure is 7.17
 *     model units tall. (Arms span x ∈ [-2.30, 2.29] in the A-pose.)
 *
 * (b) On-screen height of the classic 2D amazon sprite (`chars/am/nu/hth`
 *     from the anim export manifest, drawn at scale 1 — the hero's ActorSlot
 *     height is `frameHeight * 1`): the visible art box is **85 px** tall
 *     (51 x 85 union over all idle frames and directions); per-frame union
 *     height ranges **68…84 px, median 72 px**; the composed sheet cell is
 *     87 px tall including its 2 px margin (the drawn cell, not the figure).
 *
 * Chosen: **MODEL_UNITS_PER_TILE = 9.0** model units per tile. The 3D amazon
 * then stands `7.17 / 9.0 tiles × 97.9796 px ≈ 78.2 px` on screen — within
 * 10% of both defensible readings of (b): 8% under the 85 px union box and 9%
 * over the 72 px median frame (and 10% under the margin-inflated 87 px cell).
 *
 * Ground-footprint sanity check: the legs mesh spans `x ∈ [-0.742, 0.736]`,
 * `z ∈ [-0.500, 0.704]` model units (`legs_lit_lod3.model`), i.e. 0.164 x
 * 0.134 tiles at 9.0 — comfortably inside one 1x1 tile diamond (160 x 80 px),
 * and even the full A-pose width (4.59 units = 0.51 tiles) fits.
 */

import type { CameraConfig } from '@rasenjs/gfx'

/**
 * Model units per ground tile — the model→tile scale.
 *
 * Measured inputs and the reasoning are in this file's header. Keep this in
 * sync with the calibration section when new measurements arrive.
 */
export const MODEL_UNITS_PER_TILE = 9

/**
 * Camera distance from the target, in tiles. The ortho projection is
 * distance-invariant (see `actorCamera`), so this only moves the eye along the
 * fixed 45°/30° direction and sets the clip range. Large enough that the whole
 * scene stays far from the near plane.
 */
export const ACTOR_CAMERA_DIST = 7

/** A point in world space: X/Z ground (tiles), Y up (tiles). */
export interface WorldPoint {
  x: number
  y: number
  z: number
}

/**
 * The model placement: translate the model origin to a tile, rotate about
 * world Y by `facing`, scale model units to tiles. Matches gfx's
 * `TransformInput`/`group` fields, applied in the order scale → rotate →
 * translate (gfx's `toMatrix` composes exactly T · Ry · S for these fields).
 */
export interface ModelPlacement {
  /** World X of the model origin (tiles) = tileX. */
  x: number
  /** World Y of the model origin (tiles) = 0: model feet sit on the ground. */
  y: number
  /** World Z of the model origin (tiles) = tileY. */
  z: number
  /** Rotation about world Y, radians. `facing - π/2` — see the header. */
  rotationY: number
  /** Uniform scale, model units → tiles: 1 / unitsPerTile. */
  scale: number
}

/**
 * The orthographic camera whose ground plane projects EXACTLY like
 * `toScreen`, with `target` landing at the canvas center.
 *
 * @param target world point (tiles) to land at the canvas center — the
 *               camera's pan, like the 2D camera's `x`/`y`
 * @param dist eye distance from the target in tiles (any positive value)
 * @param canvasWidth canvas width in px (aspect only)
 * @param canvasHeight canvas height in px (sets `zoom`, see the header)
 * @returns the flat `CameraConfig` for a `<canvas camera={...}>`
 */
export function actorCamera(
  target: WorldPoint,
  dist: number,
  canvasWidth: number,
  canvasHeight: number,
): CameraConfig {
  if (!(canvasWidth > 0) || !(canvasHeight > 0) || !(dist > 0)) {
    throw new Error('actorCamera: canvasWidth, canvasHeight and dist must all be positive')
  }
  // yaw 45°, pitch 30°: (sin45·cos30, sin30, cos45·cos30)
  const dirX = Math.sin(Math.PI / 4) * Math.cos(Math.PI / 6)
  const dirY = Math.sin(Math.PI / 6)
  const dirZ = Math.cos(Math.PI / 4) * Math.cos(Math.PI / 6)
  return {
    x: target.x + dist * dirX,
    y: target.y + dist * dirY,
    z: target.z + dist * dirZ,
    target: { x: target.x, y: target.y, z: target.z },
    up: { x: 0, y: 1, z: 0 },
    // halfH = dist / (2·zoom) ⇒ world→screen scale m = canvasHeight·zoom/dist;
    // m must equal 80√2 for `toScreen`'s 80/40 px diagonals.
    zoom: (80 * Math.SQRT2 * dist) / canvasHeight,
    // Visible view-space z is [-far, -near]; keep both generous so nothing
    // around the target can clip regardless of `dist`.
    near: dist / 1000,
    far: dist * 100,
  }
}

/**
 * Where and how to place one model so its feet sit on the tile's diamond and
 * it faces the world angle the game uses.
 *
 * Model space is Y-up (like world) with the model's forward along **+Z** and
 * its origin at the character's feet (measured: the body-part models share one
 * character space with legs at y ≈ 0). The placement is scale → rotate about Y
 * → translate, i.e. the model turns about its own feet before being moved to
 * the tile.
 *
 * @param tileX world X of the tile center (tiles)
 * @param tileY world Z of the tile center (tiles)
 * @param facing world angle in radians, (cos, sin) in the (X, Z) ground
 *               plane — the same convention as `../iso.ts`'s `worldAngleToIso`
 * @param unitsPerTile model units per tile (use {@link MODEL_UNITS_PER_TILE})
 */
export function modelToTransform(
  tileX: number,
  tileY: number,
  facing: number,
  unitsPerTile: number,
  scaleMultiplier = 1,
): ModelPlacement {
  return {
    x: tileX,
    y: 0,
    z: tileY,
    // gfx's `rotateY(a)` sends the model's +Z to (sin a, 0, cos a): the
    // matrix is stored COLUMN-major (`Mat4x4f.get(row, col)` reads
    // `source[col * 4 + row]`), so the array that reads as a row-major
    // rotation is applied transposed. Aiming +Z at the walker's world
    // direction (cos facing, 0, sin facing) therefore means
    // sin a = cos facing and cos a = sin facing, i.e. a = π/2 - facing.
    //
    // The mirrored formula (facing - π/2) turned every actor to face the
    // opposite way: walking to the upper left, the character faced the
    // lower right — the position was right, the facing was its mirror.
    rotationY: Math.PI / 2 - facing,
    scale: scaleMultiplier / unitsPerTile,
  }
}
