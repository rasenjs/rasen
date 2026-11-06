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
 * about Y is `π/2 - facing` (gfx's `rotateY(a)` maps +Z to `(sin a, 0, cos a)`;
 * the matrix is column-major, `source[col * 4 + row]`, so column 2 is +Z's
 * image — the same value `transformForTile` returns).
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

import {
  orthoCameraFromTile,
  transformForTile,
  type IsoModelPlacement,
} from '@rasenjs/gfx'

/**
 * Model units per ground tile — the model→tile scale.
 *
 * Measured, not chosen: the calibration section above derives it from the retail
 * amazon's own height (7.17 model units) against the classic sprite's on-screen
 * height. Keep this in sync with that section when new measurements arrive.
 */
export const MODEL_UNITS_PER_TILE = 9

/**
 * Camera distance from the target, in tiles.
 *
 * An orthographic projection is distance-invariant (see `isoCamera`), so this only
 * moves the eye along the fixed direction and sets the clip range. Large enough
 * that the whole scene stays far from the near plane.
 */
export const ACTOR_CAMERA_DIST = 7

/** The classic tile diamond, in px: 160 x 80. */
const TILE = { x: 80, y: 40 }

/** A point in world space: X/Z ground (tiles), Y up (tiles). */
export type WorldPoint = IsoModelPlacement & { point?: never }

/** The model placement the actor layer's groups take. */
export type ModelPlacement = IsoModelPlacement

/**
 * The camera whose ground plane projects exactly like `../iso.ts`'s `toScreen`,
 * with `target` at the canvas centre.
 *
 * The geometry lives in `@rasenjs/gfx` (`orthoCameraFromTile`); what stays here is the
 * diamond and the distance this game uses.
 */
export function actorCamera(
  target: { x: number; y: number; z: number },
  dist: number,
  canvasWidth: number,
  canvasHeight: number,
): ReturnType<typeof orthoCameraFromTile> {
  return orthoCameraFromTile(target, {
    tile: TILE,
    width: canvasWidth,
    height: canvasHeight,
    distance: dist,
  })
}

/**
 * Where and how to place one model so its feet sit on the tile's diamond and it
 * faces the world angle the game uses.
 *
 * The formula and the column-major reasoning behind `PI/2 - facing` live in
 * `@rasenjs/gfx` (`transformForTile`); this wraps it with the game's own unit
 * count.
 */
export function modelToTransform(
  tileX: number,
  tileY: number,
  facing: number,
  unitsPerTile: number,
  scaleMultiplier = 1,
): ModelPlacement {
  return transformForTile(tileX, tileY, facing, unitsPerTile, scaleMultiplier)
}
