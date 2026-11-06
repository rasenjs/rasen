/**
 * Chunk baking — terrain is rasterised once into offscreen canvases and then
 * blitted, never re-walked per frame.
 *
 * This is the part of the architecture that has no alternative. `@rasenjs/canvas-2d`
 * redraws the whole canvas whenever anything is dirty (v1 has no per-node dirty
 * regions), and even with dirty regions a tile grid is 49k draw calls per frame if
 * you draw tiles individually. Baking converts "how many tiles are visible" into
 * "how many chunk-sized blits are visible", which is a constant.
 *
 * The invalidation contract is the whole point of the exercise:
 *
 *   TileStore.set()  →  dirty chunk set  →  bakeChunk()  →  bump `worldRevision`
 *
 * Upstream, the same three steps are spread across a chunk cache, a lighting engine
 * and several call sites that each have to remember to invalidate the right thing.
 * Here the middle step is one `Set` the renderer drains, and the last step is a
 * single counter the scene graph subscribes to.
 *
 * ## Overlap
 *
 * Each chunk surface is `OVERLAP` tiles larger than the chunk on every side, and it
 * is positioned that far outside the chunk's own rectangle. The blits therefore
 * overlap their neighbours, which is what lets a tile at a chunk edge draw its
 * **crown** — trees, grass tufts and anything else that sticks out above its cell —
 * without being clipped at the seam. This is the same trick Open-Terraria's
 * `ChunkBake` uses, and it is why the seam chunks have to be invalidated too (see
 * `TileStore.set`).
 *
 * ## Note on the absent worker
 *
 * Open-Terraria runs this exact kernel on the main thread *and* in `BakeWorker` by
 * injecting an environment, and the same split would apply here
 * (`OffscreenCanvas` + `transferControlToOffscreen`). It is left out because it
 * doubles the surface area of the example without changing anything you can see —
 * but note that `blitTiles` touches only the store's typed planes and the atlas,
 * never the DOM, so it is already worker-safe as written.
 */

import { CHUNK, TILE } from '../core/constants'
import { hash2 } from '../core/rng'
import { TileStore } from '../core/tile-store'
import { Tile } from '../core/tile-defs'
import { Wall } from '../core/tile-store'
import {
  atlasFrame,
  maskFor,
  NOISE_VARIANTS,
  wallFrame,
  WALL_VARIANTS,
  type TileAtlas,
} from './atlas'

/**
 * Extra tiles baked on each side of a chunk.
 *
 * Two is enough for the tallest decoration in the slice (a tree canopy overhangs
 * by one) plus a tile of slack.
 */
const OVERLAP = 2

export interface BakedChunk {
  readonly index: number
  readonly canvas: HTMLCanvasElement
  /** Top-left of the baked surface, in world px. Includes the overlap. */
  readonly originX: number
  readonly originY: number
  /** Increments on every rebake. Informational; the renderer uses `revision`. */
  revision: number
}

export interface BakerOptions {
  readonly store: TileStore
  readonly atlas: TileAtlas
  readonly seed: number
}

export class ChunkBaker {
  private readonly store: TileStore
  private readonly atlas: TileAtlas
  private readonly seed: number
  private readonly chunks = new Map<number, BakedChunk>()
  /** Bumped whenever a surface is rebuilt; the tile layer depends on this. */
  revision = 0
  /** Total bakes since startup — the number the debug overlay shows. */
  bakes = 0

  constructor(options: BakerOptions) {
    this.store = options.store
    this.atlas = options.atlas
    this.seed = options.seed
  }

  /**
   * The baked surface for a chunk, baking it on first request.
   *
   * Freshness is not checked here on purpose: the only thing that makes a bake
   * stale is a world edit, and those arrive through `TileStore.takeDirtyChunks()`
   * and `bakeAll()`. Re-checking a revision here would be a second, competing
   * notion of "stale" — exactly the duplicated invalidation rule this design exists
   * to avoid.
   */
  get(index: number): BakedChunk {
    return this.chunks.get(index) ?? this.bake(index)
  }

  has(index: number): boolean {
    return this.chunks.has(index)
  }

  /** Bakes every chunk in the list. Returns how many were rebuilt. */
  bakeAll(indices: readonly number[]): number {
    for (const index of indices) this.bake(index)
    if (indices.length > 0) this.revision++
    return indices.length
  }

  /** Drops a baked surface. The chunk will be rebuilt on next request. */
  release(index: number): void {
    this.chunks.delete(index)
  }

  private bake(index: number): BakedChunk {
    const bounds = TileStore.chunkBounds(index)
    const scale = this.atlas.scale
    /** Surface size in tiles, including the overlap on both sides. */
    const spanTiles = CHUNK + OVERLAP * 2
    const px = spanTiles * TILE * scale

    let chunk = this.chunks.get(index)
    if (!chunk) {
      const canvas = document.createElement('canvas')
      canvas.width = px
      canvas.height = px
      chunk = {
        index,
        canvas,
        originX: (bounds.x - OVERLAP) * TILE,
        originY: (bounds.y - OVERLAP) * TILE,
        revision: -1,
      }
      this.chunks.set(index, chunk)
    } else if (chunk.canvas.width !== px) {
      // The atlas scale changed (a DPR change on a moved window). Rebuild the
      // surface rather than blitting a mismatched one.
      chunk.canvas.width = px
      chunk.canvas.height = px
    }

    const ctx = chunk.canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable for chunk bake')

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, px, px)

    this.blitWalls(ctx, bounds.x - OVERLAP, bounds.y - OVERLAP, spanTiles)
    this.blitTiles(ctx, bounds.x - OVERLAP, bounds.y - OVERLAP, spanTiles)

    chunk.revision = this.store.revision
    this.bakes++
    return chunk
  }

  /**
   * Background walls, drawn before any tile.
   *
   * This is the whole reason a mined-out cave shows stone masonry instead of the
   * sky. Walls have no autotile mask — they are a flat field behind everything — so
   * this is one `drawImage` per walled cell with a per-cell noise variant, which is
   * what stops a large field from tiling visibly.
   */
  private blitWalls(ctx: CanvasRenderingContext2D, tx0: number, ty0: number, span: number): void {
    const { store, atlas, seed } = this
    const { cell, canvas, columns } = atlas
    const step = TILE * atlas.scale

    for (let ty = ty0; ty < ty0 + span; ty++) {
      for (let tx = tx0; tx < tx0 + span; tx++) {
        const wall = store.getWall(tx, ty)
        if (wall === Wall.None) continue

        const noise = hash2(tx, ty, seed + 4409) % WALL_VARIANTS
        const frame = wallFrame(wall, noise)
        const sx = (frame % columns) * cell
        const sy = ((frame / columns) | 0) * cell

        ctx.drawImage(
          canvas,
          sx,
          sy,
          cell,
          cell,
          (tx - tx0) * step,
          (ty - ty0) * step,
          step,
          step
        )
      }
    }
  }

  /**
   * The tile kernel. One `drawImage` per non-air tile, with the frame chosen from
   * the pre-computed autotile mask.
   *
   * Order is bottom-up by row so a tall decoration drawn into the overlap is not
   * painted over by the next row's terrain. Within a row, left to right.
   */
  private blitTiles(ctx: CanvasRenderingContext2D, tx0: number, ty0: number, span: number): void {
    const { store, atlas, seed } = this
    const { cell, canvas, columns } = atlas
    const step = TILE * atlas.scale

    for (let ty = ty0; ty < ty0 + span; ty++) {
      for (let tx = tx0; tx < tx0 + span; tx++) {
        const tile = store.get(tx, ty)
        if (tile === Tile.Air) continue

        const mask = maskFor(
          store.get(tx, ty - 1),
          store.get(tx + 1, ty),
          store.get(tx, ty + 1),
          store.get(tx - 1, ty),
          tile
        )
        // The noise variant is a coordinate hash, independent of the mask, so
        // mining a neighbour does not re-scramble this tile's speckles.
        const noise = NOISE_VARIANTS > 1 ? hash2(tx, ty, seed) % NOISE_VARIANTS : 0
        const frame = atlasFrame(tile, mask, noise)
        const sx = (frame % columns) * cell
        const sy = ((frame / columns) | 0) * cell

        const dx = (tx - tx0) * step
        const dy = (ty - ty0) * step

        ctx.drawImage(canvas, sx, sy, cell, cell, dx, dy, step, step)
      }
    }
  }

  get chunkCount(): number {
    return this.chunks.size
  }

  /** Approximate heap held by baked surfaces, in bytes. Reported by the debug HUD. */
  get bytes(): number {
    const span = CHUNK + OVERLAP * 2
    const px = span * TILE * this.atlas.scale
    return this.chunks.size * px * px * 4
  }

  /** The destination size of a baked surface, in CSS px, for the tile layer. */
  get surfaceCssSize(): number {
    return (CHUNK + OVERLAP * 2) * TILE
  }
}

/** Re-exported so callers do not need to know the overlap to size a blit. */
export { OVERLAP as CHUNK_OVERLAP }
