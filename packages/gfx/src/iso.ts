/**
 * An orthographic 3D camera and a model placement that line up EXACTLY with a
 * 2:1 isometric tile projection.
 *
 * A 2.5D game draws its world with integer screen arithmetic (`screenX =
 * (x - y) * halfWidth`, `screenY = (x + y) * halfHeight`) and its characters as
 * real 3D models in a second layer. Making the two agree is not a matter of
 * taste: the camera's yaw, its elevation and its zoom are all determined by the
 * tile diamond, and getting one of them wrong shows up as every model standing a
 * few pixels off its own tile.
 *
 * The relations, for a tile diamond `2*halfWidth` by `2*halfHeight` px per world
 * unit:
 *
 * - **Yaw is 45 degrees.** A world +X step and a world +Z step have to move the
 *   same distance horizontally in opposite directions, which only a 45 degree yaw
 *   does.
 * - **Elevation is `asin(halfHeight / halfWidth)`.** The vertical component a
 *   ground axis contributes is `sin(elevation)` times its horizontal one, so a
 *   2:1 diamond (160x80) needs 30 degrees and nothing else.
 * - **Zoom makes one world unit `halfWidth * sqrt(2)` px.** The camera's right
 *   axis is `(1, 0, -1)/sqrt(2)`, which is `sqrt(2)` long on screen per unit of
 *   world travel along an axis, so the pixels-per-world-unit scale is
 *   `halfWidth * sqrt(2)`.
 *
 * With those three, the camera's ground plane projects precisely like the integer
 * arithmetic, and a model whose feet are at its own origin lands on the centre of
 * the tile it is placed on.
 */

import type { CameraConfig } from './camera'

/** Half-extents of one tile diamond, in pixels. */
export interface IsoTileSize {
  /** Half the diamond's width in px: 80 for the classic 160x80 diamond. */
  x: number
  /** Half the diamond's height in px: 40 for the classic 160x80 diamond. */
  y: number
}

/** The three camera numbers a tile diamond determines. */
interface IsoProjection {
  /** Yaw about world Y, in radians. Always 45 degrees — see this module's header. */
  yaw: number
  /** Elevation above the ground plane, in radians: `asin(y / x)`. */
  elevation: number
  /** Screen pixels per world unit along a ground axis (`x * sqrt(2)`). */
  scale: number
}

/**
 * The camera numbers a tile diamond implies.
 *
 * @param tile the diamond's half-extents in px
 * @throws when the tile has no width (nothing to solve for)
 */
function projectionFromTile(tile: IsoTileSize): IsoProjection {
  if (!(tile.x > 0)) throw new Error('projectionFromTile: tile.x must be positive')
  const ratio = Math.abs(tile.y) / tile.x
  // A diamond taller than wide would need sin(elevation) > 1, which no camera
  // satisfies; clamping would silently land every model off its own tile.
  if (ratio > 1) throw new Error('projectionFromTile: tile.y must not exceed tile.x')
  // A 2:1 diamond gives sin(elevation) = 1/2, i.e. the familiar 30 degrees.
  return {
    yaw: Math.PI / 4,
    elevation: Math.asin(ratio),
    scale: tile.x * Math.SQRT2,
  }
}

/**
 * The orthographic camera whose ground plane projects exactly like the 2D
 * layer's integer arithmetic, with `target` landing at the canvas centre.
 *
 * @param target the world point to put at the canvas centre — the camera's pan
 * @param options the tile diamond and the canvas being drawn into
 */
export function orthoCameraFromTile(
  target: { x: number; y: number; z: number },
  options: {
    /** The tile diamond the 2D layer draws with. */
    tile: IsoTileSize
    /** Canvas width in px. Only the aspect ratio matters. */
    width: number
    /** Canvas height in px. This is what the zoom is solved against. */
    height: number
    /**
     * Eye distance from the target, in world units.
     *
     * An orthographic projection is distance-invariant, so this only moves the
     * eye along the fixed direction and sets the clip range; it never changes
     * the scale.
     */
    distance?: number
  },
): CameraConfig {
  const { tile, width, height } = options
  const distance = options.distance ?? 8
  if (!(width > 0) || !(height > 0)) {
    throw new Error('orthoCameraFromTile: width and height must both be positive')
  }
  if (!(distance > 0)) throw new Error('orthoCameraFromTile: distance must be positive')
  const { yaw, elevation, scale } = projectionFromTile(tile)
  // The eye sits back along the view direction: yaw 45 degrees, above the ground.
  const cosElevation = Math.cos(elevation)
  return {
    x: target.x + distance * Math.sin(yaw) * cosElevation,
    y: target.y + distance * Math.sin(elevation),
    z: target.z + distance * Math.cos(yaw) * cosElevation,
    target: { x: target.x, y: target.y, z: target.z },
    up: { x: 0, y: 1, z: 0 },
    // Half the visible height is `distance / (2 * zoom)` world units, so a world
    // unit covers `height * zoom / distance` px, which must equal `scale`.
    zoom: (scale * distance) / height,
    // The visible depth is [-far, -near] in view space; keep both generous so
    // nothing around the target clips whatever `distance` the caller picks.
    near: distance / 1000,
    far: distance * 100,
  }
}

/** A model's placement: rotate about its own feet, then scale, then translate. */
export interface IsoModelPlacement {
  /** World X of the model origin. */
  x: number
  /** World Y of the model origin: 0, so the model's feet are on the ground. */
  y: number
  /** World Z of the model origin. */
  z: number
  /** Rotation about world Y, in radians. */
  rotationY: number
  /** Uniform scale from the model's own units into world units. */
  scale: number
}

/**
 * Place a model so its feet land on a tile centre and its forward axis points
 * along the given world direction.
 *
 * Model space is Y-up with the model's forward along **+Z** and its origin at the
 * feet. `facing` is a world angle in the ground plane: direction vector
 * `(cos, 0, sin)`, so `0` points along +X and `π/2` along +Z.
 *
 * `rotationY` is `PI/2 - facing`, not `facing - PI/2`: gfx stores its matrix
 * column-major, so `rotateY(a)` sends +Z to `(sin a, 0, cos a)`, and aiming that
 * at `(cos facing, 0, sin facing)` needs `sin a = cos facing`. The mirrored form
 * turns every model to face exactly away from where it walks — a defect that
 * looks like a position bug but is not.
 *
 * @param tileX world X of the tile centre
 * @param tileZ world Z of the tile centre
 * @param facing world angle in radians
 * @param unitsPerTile how many of the model's own units make one world unit
 * @param scaleMultiplier extra uniform scale (props carry one)
 */
export function transformForTile(
  tileX: number,
  tileZ: number,
  facing: number,
  unitsPerTile: number,
  scaleMultiplier = 1,
): IsoModelPlacement {
  if (!(unitsPerTile > 0)) throw new Error('transformForTile: unitsPerTile must be positive')
  return {
    x: tileX,
    y: 0,
    z: tileZ,
    rotationY: Math.PI / 2 - facing,
    scale: scaleMultiplier / unitsPerTile,
  }
}
