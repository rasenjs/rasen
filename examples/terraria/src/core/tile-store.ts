/**
 * World storage — a struct-of-arrays store over `TypedArray` planes.
 *
 * The design is deliberately the same shape as Open-Terraria's `TileStore`
 * (`src/world/TileStore.ts`), because that shape is what the renderer and the
 * bake kernel want: one contiguous plane per channel, indexed `y * w + x`, so a
 * chunk bake is a rectangle walk over typed memory with no object churn.
 *
 * The one thing this file does *differently* is the invalidation edge. Upstream
 * keeps a listener list that flips a chunk-cache flag and a lighting flag by
 * hand, and every subsystem that writes a tile has to remember to go through the
 * right primitive. Here, writes accumulate into a **chunk dirty set**, and that
 * set is the single boundary the reactive layer subscribes to. The simulation
 * stays imperative; nothing here is reactive. See `src/main.tsx` for where the
 * set is drained.
 */

import { CHUNK, CHUNKS_X, CHUNK_COUNT, WORLD_H, WORLD_W } from './constants'
import { Tile } from './tile-defs'

/**
 * Background walls.
 *
 * Deliberately a tiny enum rather than a full registry: a wall only needs its own
 * colour and a per-cell variant, because nothing collides with it, lights through
 * it differently, or drops it as an item in this slice.
 */
export const Wall = {
  None: 0,
  Dirt: 1,
  Stone: 2,
  Cave: 3,
} as const

export type WallId = (typeof Wall)[keyof typeof Wall]

export class TileStore {
  readonly w = WORLD_W
  readonly h = WORLD_H
  readonly tiles: Uint16Array
  /**
   * Background wall per cell.
   *
   * A wall is terrain you can see but not stand on: it is what makes an excavated
   * cave read as *inside the ground* rather than as a hole onto the sky. Every tile
   * in a column below the surface gets one, and digging a tile away reveals it
   * instead of the sky, which is the single biggest thing separating a Terraria
   * screenshot from a generic tilemap.
   */
  readonly walls: Uint8Array
  /**
   * Per-tile RGB light, interleaved. Written wholesale by the lighting pass;
   * the renderer reads it as the lightmap's pixels. Not a channel the gameplay
   * code ever touches.
   */
  readonly light: Float32Array

  /**
   * Bumped by every write. The tile renderer depends on this, so "did the world
   * change" is one integer comparison rather than a deep walk.
   */
  revision = 0

  private readonly dirtyChunks = new Set<number>()
  private lightIsDirty = false
  private listeners: Array<(chunk: number) => void> = []

  constructor() {
    this.tiles = new Uint16Array(this.w * this.h)
    this.walls = new Uint8Array(this.w * this.h)
    this.light = new Float32Array(this.w * this.h * 3)
  }

  index(x: number, y: number): number {
    return y * this.w + x
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
  }

  get(x: number, y: number): number {
    if (!this.inBounds(x, y)) return Tile.Stone // out of world reads as bedrock
    return this.tiles[y * this.w + x]
  }

  chunkIndex(x: number, y: number): number {
    const cx = (x / CHUNK) | 0
    const cy = (y / CHUNK) | 0
    return cy * CHUNKS_X + cx
  }

  static chunkBounds(index: number): { x: number; y: number; w: number; h: number } {
    const cx = index % CHUNKS_X
    const cy = (index / CHUNKS_X) | 0
    return { x: cx * CHUNK, y: cy * CHUNK, w: CHUNK, h: CHUNK }
  }

  /**
   * The only legal way for gameplay code to mutate the world.
   *
   * Returns true when something actually changed, so callers can avoid firing
   * effects (sound, particles) on no-op edits.
   */
  set(x: number, y: number, id: number): boolean {
    if (!this.inBounds(x, y)) return false
    const i = y * this.w + x
    if (this.tiles[i] === id) return false

    this.tiles[i] = id
    this.revision++
    this.lightIsDirty = true

    const chunk = this.chunkIndex(x, y)
    this.dirtyChunks.add(chunk)
    // A tile on a chunk seam also changes the neighbour's baked edge, so the
    // seam chunks are invalidated too. This is the kind of rule that, upstream,
    // has to be repeated at every call site.
    const lx = x % CHUNK
    const ly = y % CHUNK
    if (lx === 0) this.dirtyChunks.add(chunk - 1)
    if (lx === CHUNK - 1) this.dirtyChunks.add(chunk + 1)
    if (ly === 0) this.dirtyChunks.add(chunk - CHUNKS_X)
    if (ly === CHUNK - 1) this.dirtyChunks.add(chunk + CHUNKS_X)

    for (const listener of this.listeners) listener(chunk)
    return true
  }

  /**
   * Bulk write used by worldgen. Per-cell notification during generation would
   * fire tens of thousands of times for a world that is about to be marked
   * entirely dirty anyway, so generation writes straight into the plane and calls
   * `markAllDirty()` once.
   */
  setRaw(x: number, y: number, id: number): void {
    if (!this.inBounds(x, y)) return
    this.tiles[y * this.w + x] = id
  }

  getWall(x: number, y: number): number {
    if (!this.inBounds(x, y)) return Wall.None
    return this.walls[y * this.w + x]
  }

  setWallRaw(x: number, y: number, id: number): void {
    if (!this.inBounds(x, y)) return
    this.walls[y * this.w + x] = id
  }

  /** Player-facing wall edit: same invalidation contract as `set`. */
  setWall(x: number, y: number, id: number): boolean {
    if (!this.inBounds(x, y)) return false
    const i = y * this.w + x
    if (this.walls[i] === id) return false
    this.walls[i] = id
    this.revision++
    this.lightIsDirty = true
    this.dirtyChunks.add(this.chunkIndex(x, y))
    return true
  }

  markAllDirty(): void {
    for (let i = 0; i < CHUNK_COUNT; i++) this.dirtyChunks.add(i)
    this.lightIsDirty = true
  }

  /** Drains the dirty set. Returns null when there is nothing to rebake. */
  takeDirtyChunks(): number[] | null {
    if (this.dirtyChunks.size === 0) return null
    const out: number[] = []
    for (const chunk of this.dirtyChunks) {
      if (chunk >= 0 && chunk < CHUNK_COUNT) out.push(chunk)
    }
    this.dirtyChunks.clear()
    return out
  }

  get needsLight(): boolean {
    return this.lightIsDirty
  }

  clearLightDirty(): void {
    this.lightIsDirty = false
  }

  /**
   * Observe writes. Used by audio and the particle system to react to edits
   * without polling; the reactive layer does *not* use this — it polls
   * `takeDirtyChunks()` once per tick, which is cheaper than a callback per cell.
   */
  onChange(listener: (chunk: number) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const i = this.listeners.indexOf(listener)
      if (i >= 0) this.listeners.splice(i, 1)
    }
  }

  /** Total non-air tiles. Cheap sanity counter, and handy in the debug overlay. */
  countSolid(): number {
    let n = 0
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] !== Tile.Air) n++
    return n
  }

  /** Accumulates into the light plane. Called by the lighting pass only. */
  setLight(x: number, y: number, r: number, g: number, b: number): void {
    const i = (y * this.w + x) * 3
    this.light[i] = r
    this.light[i + 1] = g
    this.light[i + 2] = b
  }

  getLight(x: number, y: number): readonly [number, number, number] {
    if (!this.inBounds(x, y)) return [0, 0, 0]
    const i = (y * this.w + x) * 3
    return [this.light[i], this.light[i + 1], this.light[i + 2]]
  }
}

/** Inverse of `TileStore.chunkIndex` — handy for the debug overlay. */
export function chunkOrigin(index: number): { x: number; y: number } {
  return {
    x: (index % CHUNKS_X) * CHUNK,
    y: ((index / CHUNKS_X) | 0) * CHUNK,
  }
}
