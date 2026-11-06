/**
 * Tile collision and body integration.
 *
 * Axis-separated sweep: move on X, resolve X, move on Y, resolve Y. Doing both
 * axes at once needs a corner-case rule for every diagonal configuration;
 * separating them means the only question is "does the swept box overlap a solid
 * tile", which is the same test in both directions.
 *
 * Bodies are plain mutable structs rather than a class hierarchy — they are
 * written every tick and never escape the simulation.
 */

import { GRAVITY, MAX_FALL, TILE } from './constants'
import { TileStore } from './tile-store'
import { Tile, TILE_DEFS } from './tile-defs'

export interface Body {
  /** Centre position, world px. */
  x: number
  y: number
  vx: number
  vy: number
  /** Half extents, world px. */
  hw: number
  hh: number
  onGround: boolean
  /** 1 = falling with gravity, -1 = flipped. Kept for future gravity potions. */
  gravityDir: number
}

export interface MoveResult {
  hitWall: boolean
  hitCeiling: boolean
  landed: boolean
  /** The liquid the body's centre is sitting in, if any. */
  liquid: 'water' | 'lava' | null
}

export function makeBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, vx: 0, vy: 0, hw: w / 2, hh: h / 2, onGround: false, gravityDir: 1 }
}

/**
 * True when any solid tile overlaps the box.
 *
 * Iterating tiles rather than per-pixel means a body can never tunnel through a
 * wall while moving slower than one tile per step — which, with a 60 Hz step and
 * the speeds in `constants.ts`, it never does.
 */
export function overlapsSolid(store: TileStore, x: number, y: number, hw: number, hh: number): boolean {
  const left = Math.floor((x - hw) / TILE)
  const right = Math.floor((x + hw - 0.001) / TILE)
  const top = Math.floor((y - hh) / TILE)
  const bottom = Math.floor((y + hh - 0.001) / TILE)

  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (TILE_DEFS[store.get(tx, ty)].solid) return true
    }
  }
  return false
}

/** The liquid at the body's centre, if the tile there is one. */
export function liquidAt(store: TileStore, x: number, y: number): 'water' | 'lava' | null {
  return TILE_DEFS[store.get(Math.floor(x / TILE), Math.floor(y / TILE))].liquid ?? null
}

/**
 * Integrates one body for `dt`, resolving collisions against the store.
 *
 * `gravityScale` lets the caller suspend gravity (a jump arc, a debug noclip)
 * without mutating `GRAVITY`.
 */
export function moveBody(
  store: TileStore,
  body: Body,
  dt: number,
  gravityScale = 1
): MoveResult {
  const result: MoveResult = { hitWall: false, hitCeiling: false, landed: false, liquid: null }
  const liquid = liquidAt(store, body.x, body.y)
  result.liquid = liquid

  // Liquids do not block movement, they only resist it.
  const drag = liquid === 'water' ? 0.55 : liquid === 'lava' ? 0.25 : 1

  body.vy += GRAVITY * body.gravityDir * gravityScale * drag * dt
  if (body.vy > MAX_FALL) body.vy = MAX_FALL
  if (body.vy < -MAX_FALL) body.vy = -MAX_FALL

  body.vx *= liquid ? 0.86 : 0.999

  // -- X axis ---------------------------------------------------------------
  const stepX = body.vx * dt
  if (stepX !== 0) {
    const nx = body.x + stepX
    if (!overlapsSolid(store, nx, body.y, body.hw, body.hh)) {
      body.x = nx
    } else {
      // Step up to the wall in sub-tile increments instead of snapping to the
      // tile edge — snapping is what makes characters "pop" against slopes.
      const sign = stepX > 0 ? 1 : -1
      let moved = 0
      const limit = Math.abs(stepX)
      while (moved < limit) {
        const probe = Math.min(1, limit - moved)
        if (overlapsSolid(store, body.x + sign * probe, body.y, body.hw, body.hh)) break
        body.x += sign * probe
        moved += probe
      }
      body.vx = 0
      result.hitWall = true
    }
  }

  // -- Y axis ---------------------------------------------------------------
  const stepY = body.vy * dt
  if (stepY !== 0) {
    const ny = body.y + stepY
    if (!overlapsSolid(store, body.x, ny, body.hw, body.hh)) {
      body.y = ny
      if (body.onGround && stepY > 0) body.onGround = false
    } else {
      const sign = stepY > 0 ? 1 : -1
      let moved = 0
      const limit = Math.abs(stepY)
      while (moved < limit) {
        const probe = Math.min(1, limit - moved)
        if (overlapsSolid(store, body.x, body.y + sign * probe, body.hw, body.hh)) break
        body.y += sign * probe
        moved += probe
      }
      if (stepY > 0) {
        body.onGround = true
        result.landed = true
      } else {
        result.hitCeiling = true
      }
      body.vy = 0
    }
  }

  // A body resting exactly on a seam can end a step with `onGround` stale, so
  // re-probe one pixel down. Without this, walking off a ledge into another ledge
  // briefly lets you jump again.
  if (!body.onGround && body.vy >= 0) {
    body.onGround = overlapsSolid(store, body.x, body.y + 1, body.hw, body.hh)
  }

  return result
}

/** Is there a solid tile within `radius` of the point? Used for spawn safety. */
export function anySolidNear(store: TileStore, x: number, y: number, radius: number): boolean {
  return overlapsSolid(store, x, y, radius, radius)
}

/** Clears a small pocket of non-solid tiles, so the player never spawns entombed. */
export function clearPocket(store: TileStore, tx: number, ty: number, r: number): void {
  for (let y = ty - r; y <= ty + r; y++) {
    for (let x = tx - r; x <= tx + r; x++) {
      if (TILE_DEFS[store.get(x, y)].solid) store.set(x, y, Tile.Air)
    }
  }
}
