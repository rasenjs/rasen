/**
 * World — deterministic procedural voxel terrain + chunked merged meshes.
 *
 * Follows the classic Craft design: heightmap terrain via fractal simplex
 * noise, sparse user edits layered on top, and per-chunk merged meshes that
 * are regenerated only when a block inside them changes.
 *
 * Chunk meshes are exposed as a reactive list (`chunks`) so the JSX scene can
 * render them with `<each>`; each chunk's geometry is itself a `Ref` so an
 * in-place rebuild (block edit) re-renders just that chunk.
 */

import { ref } from '@rasenjs/reactive-signals'
import type { Ref } from '@rasenjs/core'
import { SimplexNoise, fbm2 } from '@rasenjs/math'
import { buildVoxelMesh, type MeshGeometry } from '@rasenjs/gfx'
import { ATLAS_COLS, ATLAS_ROWS, BLOCK_TILES, Blocks } from './blocks'

export const CHUNK_SIZE = 16
export const WORLD_HEIGHT = 48
export const SEA_LEVEL = 11
const TREE_CELL = 6

export interface VoxelChunk {
  p: number
  q: number
  geo: Ref<MeshGeometry>
}

function chunkKey(p: number, q: number): string {
  return `${p},${q}`
}

export class World {
  readonly noise = new SimplexNoise(1337)

  /** User edits (setBlock) layered over the generated terrain. */
  private mods = new Map<number, number>()
  private chunkCache = new Map<string, VoxelChunk>()
  /** Reactive chunk list consumed by `<each>` in the scene. */
  readonly chunks = ref<VoxelChunk[]>([])

  // ---- block queries -------------------------------------------------------

  private key(x: number, y: number, z: number): number {
    return (x * 8192 + z) * 256 + y
  }

  /** Solid (collides / renders)? */
  isSolid(id: number): boolean {
    return id > Blocks.AIR
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return Blocks.STONE
    if (y >= WORLD_HEIGHT) return Blocks.AIR
    const m = this.mods.get(this.key(x, y, z))
    if (m !== undefined) return m
    return this.generated(x, y, z)
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return
    this.mods.set(this.key(x, y, z), id)
    // Regenerate the chunk containing this block.
    const p = Math.floor(x / CHUNK_SIZE)
    const q = Math.floor(z / CHUNK_SIZE)
    this.rebuildChunk(p, q)
    // A block on a chunk border also exposes faces in the neighbouring chunk
    // (a face that used to be hidden is now visible) — rebuild those too, or
    // the newly exposed side renders as sky.
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    if (lx === 0) this.rebuildChunk(p - 1, q)
    if (lx === CHUNK_SIZE - 1) this.rebuildChunk(p + 1, q)
    if (lz === 0) this.rebuildChunk(p, q - 1)
    if (lz === CHUNK_SIZE - 1) this.rebuildChunk(p, q + 1)
  }

  // ---- deterministic terrain ----------------------------------------------

  heightAt(x: number, z: number): number {
    const f = fbm2(this.noise, x * 0.01, z * 0.01, 4, 0.5, 2)
    return Math.floor(f * 9 + 16)
  }

  private surfaceAt(h: number): number {
    return h <= SEA_LEVEL ? Blocks.SAND : Blocks.GRASS
  }

  /** Tree trunk centre if cell (x, z) belongs to one, else null. */
  private treeAt(x: number, z: number): [number, number] | null {
    const cx = Math.floor(x / TREE_CELL)
    const cz = Math.floor(z / TREE_CELL)
    const n = (this.noise.noise2(cx * 0.618, cz * 0.618) + 1) / 2
    if (n < 0.62) return null
    return [cx * TREE_CELL + 3, cz * TREE_CELL + 3]
  }

  private generated(x: number, y: number, z: number): number {
    const h = this.heightAt(x, z)

    // ground layers
    if (y <= h) {
      if (y === h) return this.surfaceAt(h)
      if (y >= h - 3) return Blocks.DIRT
      return Blocks.STONE
    }

    // trees (above ground only, not on sand)
    if (h > SEA_LEVEL) {
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          const t = this.treeAt(x + dx, z + dz)
          if (!t) continue
          const [tx, tz] = t
          const th = this.heightAt(tx, tz)
          if (x === tx && z === tz && y >= th + 1 && y <= th + 4) {
            return Blocks.WOOD
          }
          // leaves ball around the trunk top
          const ly = th + 4
          const d2 = (x - tx) * (x - tx) + (z - tz) * (z - tz) + (y - ly) * (y - ly)
          if (y >= th + 2 && y <= th + 6 && d2 < 10) {
            return Blocks.LEAVES
          }
        }
      }
    }

    return Blocks.AIR
  }

  // ---- chunk meshes --------------------------------------------------------

  private buildChunkGeometry(p: number, q: number): MeshGeometry {
    const ox = p * CHUNK_SIZE
    const oz = q * CHUNK_SIZE
    return buildVoxelMesh(
      { x: ox, y: 0, z: oz },
      { x: CHUNK_SIZE, y: WORLD_HEIGHT, z: CHUNK_SIZE },
      (x, y, z) => this.getBlock(x, y, z),
      { tiles: BLOCK_TILES, atlasCols: ATLAS_COLS, atlasRows: ATLAS_ROWS },
    )
  }

  private rebuildChunk(p: number, q: number): void {
    const c = this.chunkCache.get(chunkKey(p, q))
    if (c) c.geo.value = this.buildChunkGeometry(p, q)
  }

  /** Ensure the `radius × radius` chunks around block (cx, cz) exist. */
  ensureChunks(cx: number, cz: number, radius: number): void {
    const cp = Math.floor(cx / CHUNK_SIZE)
    const cq = Math.floor(cz / CHUNK_SIZE)
    let changed = false
    for (let dp = -radius; dp <= radius; dp++) {
      for (let dq = -radius; dq <= radius; dq++) {
        const p = cp + dp
        const q = cq + dq
        const k = chunkKey(p, q)
        if (this.chunkCache.has(k)) continue
        const geo = ref<MeshGeometry>(this.buildChunkGeometry(p, q))
        this.chunkCache.set(k, { p, q, geo })
        changed = true
      }
    }
    if (changed) {
      this.chunks.value = [...this.chunkCache.values()]
    }
  }

  /** Drop chunks farther than `radius + 2` from the player. */
  private pruneChunks(cp: number, cq: number, radius: number): void {
    let changed = false
    const limit = radius + 2
    for (const [k, c] of this.chunkCache) {
      if (Math.abs(c.p - cp) > limit || Math.abs(c.q - cq) > limit) {
        this.chunkCache.delete(k)
        changed = true
      }
    }
    if (changed) {
      this.chunks.value = [...this.chunkCache.values()]
    }
  }

  /** Frame update: keep chunks around the player loaded. */
  update(px: number, pz: number, radius = 3): void {
    this.ensureChunks(Math.floor(px), Math.floor(pz), radius)
    this.pruneChunks(
      Math.floor(px / CHUNK_SIZE),
      Math.floor(pz / CHUNK_SIZE),
      radius,
    )
  }
}
