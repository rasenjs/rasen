/**
 * Isometric projection.
 *
 * The whole world lives in tile coordinates (`wx`, `wy` in tiles, `h` in px of
 * height). One function maps that to screen pixels and one maps back, so the
 * renderer, the path-finding and the tap-to-move hit test all agree on where a
 * point is — the classic mistake in an isometric game is having three slightly
 * different versions of this transform.
 *
 * Screen convention: +x right, +y down. Screen +y is "south-east" in world
 * terms, which is why `toWorld` subtracts the axes in the order it does.
 */

/**
 * Tile footprint on screen: a 2:1 diamond.
 *
 * Measured from the game's own tilesets rather than chosen. Every `.dt1` block
 * is a whole number of **32-pixel sub-cells** wide (2555 of 2555 blocks), the
 * dominant block is 160 wide — exactly five sub-cells — and a sub-tile's pixel
 * rows tile a 32x16 diamond. So one `.ds1` cell is 160x80, and the art is drawn
 * 1:1: any other cell size scales or overlaps the pictures.
 *
 * The ratio is what all the angle maths below depends on, and it stays 2:1.
 */
export const TILE_WIDTH = 160
export const TILE_HEIGHT = 80

const HALF_W = TILE_WIDTH / 2
const HALF_H = TILE_HEIGHT / 2

export interface IsoPoint {
  x: number
  y: number
}

/** World (tiles) → screen (px), before the camera translation. */
export function toScreen(wx: number, wy: number, height = 0): IsoPoint {
  return {
    x: (wx - wy) * HALF_W,
    y: (wx + wy) * HALF_H - height,
  }
}

/** Screen (px) → world (tiles), ignoring height. */
export function toWorld(sx: number, sy: number): IsoPoint {
  const a = sx / HALF_W
  const b = sy / HALF_H
  return { x: (a + b) / 2, y: (b - a) / 2 }
}

/**
 * A drag delta on screen → the world-space direction the player meant.
 *
 * The projection is linear, so the delta transforms exactly like a point. This
 * is what makes "drag the skill button up-left" cast north-west instead of
 * casting at whatever angle the screen-space vector happened to be — the two
 * spaces differ by more than a rotation.
 */
export function screenDeltaToWorldAngle(dx: number, dy: number): number {
  const world = toWorld(dx, dy)
  return Math.atan2(world.y, world.x)
}

/** World angle → sprite facing index (0 = screen east, 2 = screen south, …). */
/**
 * The world angle a sprite direction stands for.
 *
 * The inverse of {@link worldAngleToIso}: the eight sprite directions are
 * the screen's compass with south first, so they run backwards through the
 * world angles (south is world +X+Y, east is world +X-Y).
 */
export function spriteDirToWorldAngle(dir: number): number {
  return ((((dir + 1) % 8) + 8) % 8) * (Math.PI / 4)
}

export function worldAngleToIso(angle: number): number {
  // The eight sprite directions are the SCREEN's compass, and the retail
  // order starts at SOUTH (down the screen), going counter-clockwise:
  // south, south-west, west, north-west, north, north-east, east,
  // south-east. The isometric projection turns the world axes into
  // diagonals, so the screen's south is the world's +X+Y, its east is
  // +X-Y, and the sprite order runs one step ahead of the world order.
  const worldStep = Math.round(angle / (Math.PI / 4))
  return (((worldStep - 1) % 8) + 8) % 8
}

/** Snap a direction to the nearest of the eight world compass directions. */
export function snapToWorldCompass(x: number, y: number): IsoPoint {
  const length = Math.hypot(x, y)
  if (length < 1e-6) return { x: 0, y: 0 }
  const step = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4)
  return { x: Math.cos(step), y: Math.sin(step) }
}

/**
 * Depth key for the painter's algorithm: things further south (larger
 * `wx + wy`) are nearer the viewer and must be drawn later. Height deliberately
 * does not participate — a tall object behind you is still behind you.
 */
export function depthOf(wx: number, wy: number): number {
  return wx + wy
}

/**
 * Distance between two tile positions, used for range checks.
 *
 * Chebyshev-ish (the larger axis difference) rather than euclidean: on a tile
 * grid that matches how a player reads "one tile away" and keeps melee range
 * square instead of round.
 */
export function tileDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}
