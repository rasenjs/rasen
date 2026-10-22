import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GR2_MAGIC, loadGr2 } from '../gr2'

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)))

describe('gr2 container', () => {
  it('rejects a file that is not a Granny container', () => {
    expect(() => loadGr2(new Uint8Array(512))).toThrow(/magic|Granny/)
  })

  it('rejects a truncated file', () => {
    const bytes = fixture('gr2-blend-sphere.model')
    expect(() => loadGr2(bytes.subarray(0, 200))).toThrow(/shorter/)
  })

  it('rejects a header whose total_size disagrees with the file', () => {
    const bytes = fixture('gr2-blend-sphere.model')
    const tampered = bytes.slice()
    new DataView(tampered.buffer).setUint32(0x24, bytes.length + 1, true)
    expect(() => loadGr2(tampered)).toThrow(/header says/)
  })

  it('identifies the 64-bit LE format-7 magic', () => {
    expect(GR2_MAGIC).toBe('5e499be5141f636fa9eb131ec4edbe90')
  })
})

describe('gr2 on a real model', () => {
  // A Blender test sphere exported by the game's own pipeline: one rigid
  // mesh, one bone, vertexScale 1.
  const file = loadGr2(fixture('gr2-blend-sphere.model'))

  it('reads the file-info the export recorded', () => {
    expect(file.fromFileName).toBe('X:/assets/bvt/models/spheres.ma')
    expect(file.header.version).toBe(7)
    expect(file.header.sectionCount).toBe(8)
    expect(file.fixupsApplied.reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
  })

  it('materializes the mesh', () => {
    expect(file.meshes).toHaveLength(1)
    const mesh = file.meshes[0]
    expect(mesh.name).toBe('pSphereShape4')
    expect(mesh.vertexCount).toBe(439)
    expect(mesh.indices.length).toBe(2280)
    expect(mesh.vertexScale).toBeCloseTo(1, 5)
  })

  it('keeps every index inside the vertex array', () => {
    const mesh = file.meshes[0]
    let max = 0
    for (const index of mesh.indices) if (index > max) max = index
    expect(max).toBeLessThan(mesh.vertexCount)
  })

  it('decodes finite positions that reproduce the file\'s own bounding box', () => {
    const mesh = file.meshes[0]
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let c = 0; c < 3; c += 1) {
        expect(Number.isFinite(mesh.positions[i + c])).toBe(true)
        if (mesh.positions[i + c] < lo[c]) lo[c] = mesh.positions[i + c]
        if (mesh.positions[i + c] > hi[c]) hi[c] = mesh.positions[i + c]
      }
    }
    // The dequantization (i16 / 32767 * VertexScale) is right when the decoded
    // extremes land on the bbMin/bbMax the file itself stores. The exporter
    // stores bbMax clamped to zero, hence the Math.max on the maximum.
    for (let c = 0; c < 3; c += 1) {
      expect(lo[c]).toBeCloseTo(mesh.bbMin![c], 2)
      expect(Math.max(hi[c], 0)).toBeCloseTo(mesh.bbMax![c], 2)
    }
  })

  it('decodes a sphere: the three extents agree', () => {
    const mesh = file.meshes[0]
    const extent = [0, 1, 2].map((c) => mesh.bbMax![c] - mesh.bbMin![c])
    for (const e of extent) expect(e).toBeCloseTo(extent[0], 2)
  })

  it('decodes UVs and normals', () => {
    const mesh = file.meshes[0]
    expect(mesh.uvs).not.toBeNull()
    expect(mesh.normals).not.toBeNull()
    for (let i = 0; i < 6; i += 1) expect(Number.isFinite(mesh.uvs![i])).toBe(true)
    // Normals are unit-ish after the int8/127 decode.
    const length = Math.hypot(mesh.normals![0], mesh.normals![1], mesh.normals![2])
    expect(length).toBeGreaterThan(0.9)
    expect(length).toBeLessThan(1.1)
  })

  it('reads material and texture names the export recorded', () => {
    expect(file.textures.length).toBeGreaterThan(0)
    expect(file.textures[0].fromFileName).toMatch(/^data\/hd\//)
    expect(file.materials.length).toBeGreaterThan(0)
    expect(file.meshes[0].materialBindings[0]).toBeGreaterThanOrEqual(0)
    expect(file.meshes[0].materialBindings[0]).toBeLessThan(file.materials.length)
  })

  it('reads the skeleton', () => {
    expect(file.skeletons).toHaveLength(1)
    expect(file.skeletons[0].bones).toHaveLength(1)
    expect(file.models).toHaveLength(1)
    expect(file.trackGroupCount).toBe(0)
    expect(file.animationCount).toBe(0)
  })
})
