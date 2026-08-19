/**
 * World interface — the shared context entities live in.
 *
 * Entities hold their own state and behaviour but read input / the level /
 * collision helpers through this interface, which `Game` implements. This
 * keeps entities decoupled from the orchestrator (no circular imports).
 */

import type { Ref } from '@rasenjs/core'
import type { Input } from './input'
import type { GameAssets } from './assets'

/** A positioned box (anything that can overlap with something else). */
export interface Box {
  wx: number
  wy: number
  w: number
  h: number
}

/** A physics body (any entity that can collide with tiles). */
export interface Body extends Box {
  vx: number
  vy?: number
  grounded?: boolean
}

export interface World {
  input: Input
  assets: GameAssets
  /** global animation clock (seconds) */
  clock: number
  camX: Ref<number>

  solidAt(tx: number, ty: number): boolean
  /** Move along X and resolve against solid tiles. Returns true on wall hit. */
  collideX(e: Body): boolean
  /** Move along Y; returns the tile hit above (head bump), or null. */
  collideY(e: Body): { tx: number; ty: number } | null
  /** Is there ground directly below ahead of this body? */
  groundAhead(e: Body): boolean

  /** Player bumped the tile at (tx, ty) from below. */
  bumpAt(tx: number, ty: number): void
  addCoin(score: number): void
  spawnCoinParticle(x: number, y: number): void
  killPlayer(): void
}

/** Axis-aligned bounding box overlap. */
export function overlap(a: Box, b: Box): boolean {
  return (
    a.wx < b.wx + b.w &&
    a.wx + a.w > b.wx &&
    a.wy < b.wy + b.h &&
    a.wy + a.h > b.wy
  )
}

/** 1x1 transparent canvas used as the initial frame of inactive pool slots. */
export const blankFrame = (() => {
  const c = document.createElement('canvas')
  c.width = 1
  c.height = 1
  return c
})()
