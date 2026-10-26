/**
 * Where a wall stands between the camera and its own tile.
 *
 * This is the question that decides whether a wall hides a character standing in
 * the same cell, and it is answerable from the data rather than by taste: a DT1
 * wall block's `orientation` carries four face bits.
 *
 * The mapping is fixed by the isometric projection. A world +X step moves the
 * sprite (+halfWidth, +halfHeight) on screen — down and to the RIGHT — and a +Z
 * step moves it (-halfWidth, +halfHeight) — down and to the LEFT. So the tile
 * diamond's four screen edges are the four world faces:
 *
 * | screen edge | world face | DT1 bit |
 * | ----------- | ---------- | ------- |
 * | upper-left  | -X         | 1       |
 * | lower-right | +X         | 2       |
 * | lower-left  | +Z         | 4       |
 * | upper-right | -Z         | 8       |
 *
 * Those four names match an independent scan of 65 blocks, which found the
 * `gx0` edge at the screen's upper left, `gx4` at its lower right, `gy0` at its
 * upper right and `gy4` at its lower left. Two measurements, one answer.
 *
 * The camera looks down the (+X, +Y, +Z) direction, so a face on the -X or -Z side
 * is FARTHER from the camera and a face on the +X or +Z side is NEARER. That sign
 * is what puts a wall on the near side in front of a character in its tile.
 */

/** Which of the tile's four faces a wall block occupies. */
export interface WallFaces {
  /** The -X face, the diamond's upper-left edge. */
  left: boolean
  /** The +X face, the diamond's lower-right edge. */
  right: boolean
  /** The +Z face, the diamond's lower-left edge. */
  bottom: boolean
  /** The -Z face, the diamond's upper-right edge. */
  top: boolean
}

/** The faces a DT1 `orientation` names. */
export function wallFacesOf(orientation: number): WallFaces {
  return {
    left: (orientation & 1) !== 0,
    right: (orientation & 2) !== 0,
    bottom: (orientation & 4) !== 0,
    top: (orientation & 8) !== 0,
  }
}

/** How far, in tiles, a wall stands from its tile's centre along each ground axis. */
export interface WallOffset {
  /** Along world X: negative is farther from the camera. */
  x: number
  /** Along world Z: negative is farther from the camera. */
  z: number
}

/**
 * The ground offset of a wall from its tile's centre.
 *
 * A wall on one face sits half a tile out along that face's normal. A block that
 * occupies SEVERAL faces (orientation 3, 7, 12, 13 …) is an L or a U of wall, and
 * no single point can represent it: the offset becomes the mean of the faces it
 * has, which keeps a symmetric block at the centre and a lopsided one leaning
 * towards the side it covers most.
 *
 * @param orientation a DT1 wall block's orientation (1..14)
 * @returns the offset in tiles, relative to the cell's centre
 */
export function wallOffsetOf(orientation: number): WallOffset {
  const faces = wallFacesOf(orientation)
  let x = 0
  let z = 0
  let count = 0
  if (faces.left) { x -= 0.5; count += 1 }
  if (faces.right) { x += 0.5; count += 1 }
  if (faces.bottom) { z += 0.5; count += 1 }
  if (faces.top) { z -= 0.5; count += 1 }
  if (count === 0) return { x: 0, z: 0 }
  return { x: x / count, z: z / count }
}

/**
 * The depth key of a wall, in tiles.
 *
 * The camera looks from (+X, +Y, +Z), so the ground distance that decides
 * layering is `x + z`: larger is nearer. This is the same key the 2D layer sorts
 * by, which is why the two agree.
 */
export function wallDepthKey(tileX: number, tileZ: number, orientation: number): number {
  const offset = wallOffsetOf(orientation)
  return tileX + offset.x + tileZ + offset.z
}
