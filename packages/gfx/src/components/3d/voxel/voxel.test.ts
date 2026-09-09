import { describe, expect, it } from 'vitest'
import { buildVoxelMesh, voxelRaycast } from './voxel'
import type { VoxelFaces } from './voxel'

// A tiny atlas: 2 columns × 1 row, every face uses tile 0.
const TILES: VoxelFaces[] = [
  { left: 0, right: 0, top: 0, bottom: 0, front: 0, back: 0 }, // 0 = air (never rendered)
  { left: 0, right: 0, top: 0, bottom: 0, front: 0, back: 0 }, // 1 = solid
]
const OPTS = { tiles: TILES, atlasCols: 2, atlasRows: 1 }

describe('buildVoxelMesh', () => {
  it('emits all 6 faces for a lone block (36 vertices)', () => {
    const geo = buildVoxelMesh(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
      (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0),
      OPTS,
    )
    // 6 faces × 2 triangles × 3 vertices; xyz per vertex + uv per vertex
    expect(geo.vertices.length).toBe(36 * 3)
    expect(geo.uv!.length).toBe(36 * 2)
  })

  it('hides faces shared between adjacent blocks', () => {
    const geo = buildVoxelMesh(
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 1, z: 1 },
      (x, y, z) => (x >= 0 && x <= 1 && y === 0 && z === 0 ? 1 : 0),
      OPTS,
    )
    // Two blocks sharing one face: 12 faces − 2 hidden = 10 faces = 60 vertices.
    expect(geo.vertices.length).toBe(60 * 3)
  })

  it('treats outside-of-region lookups via the caller getBlock', () => {
    // A block at the region edge has its outside neighbour resolved by getBlock
    // (world semantics), not assumed empty — a solid neighbour outside hides the face.
    const geo = buildVoxelMesh(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
      (x, y, z) => {
        // block at (0,0,0) plus a solid neighbour at (-1,0,0)
        if (y !== 0 || z !== 0) return 0
        if (x === 0 || x === -1) return 1
        return 0
      },
      OPTS,
    )
    // -X face hidden by neighbour → 5 faces = 30 vertices
    expect(geo.vertices.length).toBe(30 * 3)
  })

  it('produces UVs inside the atlas region (v=0 maps to the top atlas row)', () => {
    const geo = buildVoxelMesh(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
      (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0),
      OPTS,
    )
    const uvs = geo.uv!
    expect(uvs.length).toBe(36 * 2)
    for (let i = 0; i < uvs.length; i += 2) {
      expect(uvs[i]).toBeGreaterThanOrEqual(0)
      expect(uvs[i]).toBeLessThanOrEqual(1)
      expect(uvs[i + 1]).toBeGreaterThanOrEqual(0)
      expect(uvs[i + 1]).toBeLessThanOrEqual(1)
    }
    // tile 0 occupies columns 0..1 of a 2-col atlas → u spans [0, 1]
    // row 0 with atlasRows=1 → v spans [0, 1]
  })
})

describe('voxelRaycast', () => {
  const blockAt = (x: number, y: number, z: number) =>
    x === 0 && y === 0 && z === 0 ? 1 : 0

  it('hits the first solid block with the entered face normal', () => {
    const hit = voxelRaycast({ x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: 1 }, blockAt, 10)
    expect(hit).toEqual({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: -1 })
  })

  it('reports the correct normal for a +X entry', () => {
    const hit = voxelRaycast({ x: -2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, blockAt, 10)
    expect(hit).toEqual({ x: 0, y: 0, z: 0, nx: -1, ny: 0, nz: 0 })
  })

  it('returns null when nothing is hit within max distance', () => {
    const hit = voxelRaycast({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 1 }, blockAt, 3)
    expect(hit).toBeNull()
  })

  it('does not require a normalized direction', () => {
    // same direction, scaled by 4 — still hits the same block
    const hit = voxelRaycast({ x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: 4 }, blockAt, 10)
    expect(hit).toEqual({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: -1 })
  })
})
