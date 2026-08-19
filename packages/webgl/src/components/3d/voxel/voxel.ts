/**
 * Voxel helpers — build merged chunk meshes from block data and ray-cast
 * against them (the two pieces every voxel game needs, lifted from the Craft
 * / Minecraft playbook).
 *
 * Coordinate convention: a block at integer `(x, y, z)` is a unit cube
 * centered on that point, spanning `[x-0.5, x+0.5]` — same model as the
 * `box` component.
 *
 * Rendering strategy (same as Craft): only faces exposed to empty space are
 * emitted, and all faces are merged into one `MeshGeometry` per chunk so a
 * whole chunk is a single draw call. Each face samples one tile of a texture
 * atlas, which keeps a whole block palette in one small texture.
 */

import type { Vec3f } from '@rasenjs/math'
import type { MeshGeometry } from '../primitives/mesh'

/** Tile index per face of a block type (like Craft's `blocks[][6]`). */
export interface VoxelFaces {
  left: number
  right: number
  top: number
  bottom: number
  front: number
  back: number
}

export interface VoxelMeshOptions {
  /**
   * Face→tile mapping per block id. `tiles[id]` gives the six tile indices
   * for block type `id` (0 is air and never rendered).
   */
  tiles: VoxelFaces[]
  /** Texture atlas layout (tiles are laid out row-major, row 0 on top). */
  atlasCols: number
  atlasRows: number
}

/** Axis-aligned box in world units. */
export interface VoxelBox {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

export interface VoxelRaycastHit {
  /** Block coordinate of the hit (integer, block center convention). */
  x: number
  y: number
  z: number
  /** Normal of the face that was entered (unit axis vector). */
  nx: number
  ny: number
  nz: number
}

interface FaceDef {
  /** Neighbor direction used to test exposure. */
  dir: [number, number, number]
  tileKey: keyof VoxelFaces
  /** 4 corners of the unit face, CCW seen from outside. */
  corners: Array<[number, number, number]>
  /** Per-corner atlas corner pick: [uLow(0)|uHigh(1), vLow(0)|vHigh(1)]. */
  uv: Array<[0 | 1, 0 | 1]>
}

// Six faces of a unit cube centered on origin. UV picks keep the texture
// upright on every face (screen-right = +u, screen-up = +v).
const FACES: FaceDef[] = [
  {
    dir: [1, 0, 0],
    tileKey: 'right',
    corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]],
    uv: [[0, 0], [0, 1], [1, 1], [1, 0]],
  },
  {
    dir: [-1, 0, 0],
    tileKey: 'left',
    corners: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]],
    uv: [[1, 0], [1, 1], [0, 1], [0, 0]],
  },
  {
    dir: [0, 1, 0],
    tileKey: 'top',
    corners: [[-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
    uv: [[0, 1], [1, 1], [1, 0], [0, 0]],
  },
  {
    dir: [0, -1, 0],
    tileKey: 'bottom',
    corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  {
    dir: [0, 0, 1],
    tileKey: 'front',
    corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  {
    dir: [0, 0, -1],
    tileKey: 'back',
    corners: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
    uv: [[1, 0], [0, 0], [0, 1], [1, 1]],
  },
]

function tileUV(
  tile: number,
  atlasCols: number,
  atlasRows: number,
): { u0: number; u1: number; v0: number; v1: number } {
  const col = ((tile % atlasCols) + atlasCols) % atlasCols
  const row = ((Math.floor(tile / atlasCols) % atlasRows) + atlasRows) % atlasRows
  const u0 = col / atlasCols
  const u1 = (col + 1) / atlasCols
  // Texture space: texImage2D maps v=0 to the *top* row of the source canvas,
  // so atlas row 0 (drawn at the top) lives at v=0 and row increases downward.
  const v0 = row / atlasRows
  const v1 = (row + 1) / atlasRows
  return { u0, u1, v0, v1 }
}

/**
 * Build a merged `MeshGeometry` for a block region, emitting only exposed
 * faces. `getBlock` is called with world block coordinates for every sampled
 * cell (including one-cell-outside neighbours), so callers control the
 * outside-region semantics — a world's `getBlock` naturally resolves them.
 *
 * @param origin   World-space origin (position of block `(0,0,0)` of the region).
 * @param size     Region size in blocks.
 * @param getBlock `(x, y, z) => blockId` in world block coordinates. May be
 *                 called slightly outside `origin..origin+size` for neighbour
 *                 tests — return 0 (air) for cells that should count as empty.
 * @param options  Tile palette + atlas layout.
 */
export function buildVoxelMesh(
  origin: { x: number; y: number; z: number },
  size: { x: number; y: number; z: number },
  getBlock: (x: number, y: number, z: number) => number,
  options: VoxelMeshOptions,
): MeshGeometry {
  const { tiles, atlasCols, atlasRows } = options
  const vertices: number[] = []
  const uv: number[] = []

  const w = size.x
  const h = size.y
  const d = size.z

  const blockAt = (x: number, y: number, z: number): number => {
    return getBlock(origin.x + x, origin.y + y, origin.z + z)
  }

  for (let by = 0; by < h; by++) {
    for (let bz = 0; bz < d; bz++) {
      for (let bx = 0; bx < w; bx++) {
        const id = blockAt(bx, by, bz)
        if (id <= 0) continue
        const faceTiles = tiles[id]
        if (!faceTiles) continue

        for (const face of FACES) {
          const nx = bx + face.dir[0]
          const ny = by + face.dir[1]
          const nz = bz + face.dir[2]
          if (blockAt(nx, ny, nz) > 0) continue // hidden face — skip

          const tile = faceTiles[face.tileKey]
          const { u0, u1, v0, v1 } = tileUV(tile, atlasCols, atlasRows)
          const c = face.corners
          const cornerUV: Array<[number, number]> = face.uv.map(([u, v]) => [
            u ? u1 : u0,
            v ? v1 : v0,
          ])

          // Two triangles: (0,1,2) and (0,2,3)
          const idx = [0, 1, 2, 0, 2, 3]
          for (const i of idx) {
            vertices.push(
              origin.x + bx + c[i][0],
              origin.y + by + c[i][1],
              origin.z + bz + c[i][2],
            )
            uv.push(cornerUV[i][0], cornerUV[i][1])
          }
        }
      }
    }
  }

  return {
    vertices: new Float32Array(vertices),
    uv: new Float32Array(uv),
  }
}

/**
 * Ray-cast against a voxel world using Amanatides & Woo DDA. Returns the first
 * solid block hit plus the normal of the entered face (useful for placing a
 * block adjacent to the hit).
 *
 * @param origin  Ray origin in world units.
 * @param dir     Ray direction (does not need to be normalized).
 * @param getBlock `(x, y, z) => blockId` in world block coordinates.
 * @param maxDistance  Maximum search distance (default 64).
 */
export function voxelRaycast(
  origin: Vec3f | { x: number; y: number; z: number },
  dir: Vec3f | { x: number; y: number; z: number },
  getBlock: (x: number, y: number, z: number) => number,
  maxDistance = 64,
): VoxelRaycastHit | null {
  const ox = origin.x + 0.5
  const oy = origin.y + 0.5
  const oz = origin.z + 0.5
  const dx = dir.x
  const dy = dir.y
  const dz = dir.z

  let x = Math.floor(ox)
  let y = Math.floor(oy)
  let z = Math.floor(oz)

  const stepX = dx > 0 ? 1 : -1
  const stepY = dy > 0 ? 1 : -1
  const stepZ = dz > 0 ? 1 : -1

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity

  let tMaxX = dx !== 0 ? ((dx > 0 ? x + 1 - ox : ox - x) * tDeltaX) : Infinity
  let tMaxY = dy !== 0 ? ((dy > 0 ? y + 1 - oy : oy - y) * tDeltaY) : Infinity
  let tMaxZ = dz !== 0 ? ((dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ) : Infinity

  let nx = 0
  let ny = 0
  let nz = 0
  let t = 0

  while (t <= maxDistance) {
    if (getBlock(x, y, z) > 0) {
      return { x, y, z, nx, ny, nz }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX
      t = tMaxX
      tMaxX += tDeltaX
      nx = -stepX; ny = 0; nz = 0
    } else if (tMaxY < tMaxZ) {
      y += stepY
      t = tMaxY
      tMaxY += tDeltaY
      nx = 0; ny = -stepY; nz = 0
    } else {
      z += stepZ
      t = tMaxZ
      tMaxZ += tDeltaZ
      nx = 0; ny = 0; nz = -stepZ
    }
  }

  return null
}
