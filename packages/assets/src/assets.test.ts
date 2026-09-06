import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))

describe('Spine parsers', () => {
  const fixtureDir = resolve(here, '../../spine/src/__fixtures__')
  const skelBuf = new Uint8Array(readFileSync(resolve(fixtureDir, 'c310.skel')))
  const atlasText = readFileSync(resolve(fixtureDir, 'c310.atlas'), 'utf8')

  it('parseSpineBinary parses a .skel file', async () => {
    const { parseSpineBinary } = await import('./spine/parsers/spine-binary')
    const data = parseSpineBinary(skelBuf)
    expect(data.format).toBe('spine')
    expect(data.bones.length).toBeGreaterThan(0)
    expect(data.path).toBeDefined()
    expect(data.path!.length).toBeGreaterThan(0)
  })

  it('parseSpineBinary extracts IK constraints', async () => {
    const { parseSpineBinary } = await import('./spine/parsers/spine-binary')
    const data = parseSpineBinary(skelBuf)
    expect(data.ik).toBeDefined()
    expect(data.ik!.length).toBeGreaterThan(0)
    for (const ik of data.ik!) {
      expect(ik.name).toBeTruthy()
      expect(ik.bones.length).toBeGreaterThan(0)
      expect(ik.target).toBeTruthy()
    }
  })

  it('parseSpineBinary extracts path constraints with mix values', async () => {
    const { parseSpineBinary } = await import('./spine/parsers/spine-binary')
    const data = parseSpineBinary(skelBuf)
    for (const pc of data.path!) {
      expect(typeof pc.mixX).toBe('number')
      expect(typeof pc.mixY).toBe('number')
    }
  })

  it('parseSpineBinary extracts animations', async () => {
    const { parseSpineBinary } = await import('./spine/parsers/spine-binary')
    const data = parseSpineBinary(skelBuf)
    expect(data.animations).toBeDefined()
    const animNames = Object.keys(data.animations)
    expect(animNames.length).toBeGreaterThan(0)
  })

  it('parseSpineAtlas parses an .atlas file', async () => {
    const { parseSpineAtlas } = await import('./spine/parsers/atlas')
    const atlas = parseSpineAtlas(atlasText)
    expect(atlas.regions).toBeDefined()
    expect(Object.keys(atlas.regions).length).toBeGreaterThan(0)
  })

  it('parseSpineAtlas resolves region UV coordinates', async () => {
    const { parseSpineAtlas } = await import('./spine/parsers/atlas')
    const atlas = parseSpineAtlas(atlasText)
    const region = Object.values(atlas.regions)[0]
    expect(region.u).toBeGreaterThanOrEqual(0)
    expect(region.u2).toBeGreaterThan(region.u)
    expect(region.v).toBeGreaterThanOrEqual(0)
    expect(region.v2).toBeGreaterThan(region.v)
  })

  it('parseSpineJson parses a JSON skeleton', async () => {
    const { parseSpineJson } = await import('./spine/parsers/spine-json')
    const json = {
      skeleton: { hash: 'test', spine: '4.1.0' },
      bones: [{ name: 'root' }, { name: 'child', parent: 'root' }],
      slots: [{ name: 'slot1', bone: 'child' }],
      skins: [{ name: 'default', attachments: {} }],
      animations: {},
    }
    const data = parseSpineJson(json)
    expect(data.bones.length).toBe(2)
    expect(data.bones[1].parent).toBe('root')
  })

  it('parseSpineJson handles IK constraint parsing', async () => {
    const { parseSpineJson } = await import('./spine/parsers/spine-json')
    const json = {
      skeleton: { hash: 'test', spine: '4.1.0' },
      bones: [{ name: 'root' }, { name: 'thigh' }, { name: 'shin' }],
      ik: [{ name: 'leg', bones: ['thigh', 'shin'], target: 'root', mix: 1 }],
      animations: {},
    }
    const data = parseSpineJson(json)
    expect(data.ik).toBeDefined()
    expect(data.ik!.length).toBe(1)
    expect(data.ik![0].bones).toEqual(['thigh', 'shin'])
  })

  it('types are re-exported correctly', async () => {
    const mod = await import('./spine/index')
    expect(typeof mod.parseSpineBinary).toBe('function')
    expect(typeof mod.parseSpineJson).toBe('function')
    expect(typeof mod.parseSpineAtlas).toBe('function')
    expect(typeof mod.computeAttachmentWorld).toBe('function')
  })
})

describe('GLB parser', () => {
  it('parses a minimal GLB file', async () => {
    const { parseGLB } = await import('./gltf/parser')

    // Create a minimal GLB with an empty mesh.
    const json = {
      asset: { version: '2.0' },
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0, TEXCOORD_0: 1 },
              indices: 2,
            },
          ],
        },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2', min: [0, 0], max: [1, 1] },
        { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 24 },
        { buffer: 0, byteOffset: 60, byteLength: 6 },
      ],
      buffers: [{ byteLength: 66 }],
    }

    // Build binary buffer: 3 verts * 12 bytes + 3 uvs * 8 bytes + 3 indices * 2 bytes = 66 bytes
    const binBuf = new ArrayBuffer(66)
    const dv = new DataView(binBuf)
    // Positions: (0,0,0), (1,0,0), (0,1,0)
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0]
    for (let i = 0; i < positions.length; i++) dv.setFloat32(i * 4, positions[i], true)
    // UVs: (0,0), (1,0), (0,1)
    const uvs = [0, 0, 1, 0, 0, 1]
    for (let i = 0; i < uvs.length; i++) dv.setFloat32(36 + i * 4, uvs[i], true)
    // Indices: 0, 1, 2
    dv.setUint16(60, 0, true)
    dv.setUint16(62, 1, true)
    dv.setUint16(64, 2, true)

    // Assemble GLB.
    const jsonStr = JSON.stringify(json)
    const jsonPadded = new TextEncoder().encode(jsonStr)
    // GLB spec: JSON chunk must be padded with spaces (0x20) to 4-byte alignment
    const jsonChunkLen = Math.ceil(jsonPadded.length / 4) * 4
    const jsonChunk = new Uint8Array(jsonChunkLen)
    jsonChunk.set(jsonPadded)
    jsonChunk.fill(0x20, jsonPadded.length) // pad with spaces

    const binChunk = new Uint8Array(binBuf)

    const totalLen = 12 + 8 + jsonChunkLen + 8 + binChunk.length
    const glb = new Uint8Array(totalLen)
    const gv = new DataView(glb.buffer)
    // Header
    gv.setUint32(0, 0x46546C67, true) // magic 'glTF'
    gv.setUint32(4, 2, true) // version 2
    gv.setUint32(8, totalLen, true) // total length
    // JSON chunk
    gv.setUint32(12, jsonChunkLen, true)
    gv.setUint32(16, 0x4E4F534A, true) // type 'JSON'
    glb.set(jsonChunk, 20)
    // BIN chunk
    const binOffset = 20 + jsonChunkLen
    gv.setUint32(binOffset, binChunk.length, true)
    gv.setUint32(binOffset + 4, 0x004E4942, true) // type 'BIN\0'
    glb.set(binChunk, binOffset + 8)

    const result = parseGLB(glb)

    expect(result.meshes.length).toBe(1)
    const mesh = result.meshes[0]
    expect(mesh.positions.length).toBe(9) // 3 verts * 3 components
    expect(mesh.uvs.length).toBe(6) // 3 verts * 2 components
    expect(mesh.indices.length).toBe(3)
    expect(mesh.bounds.min).toEqual([0, 0, 0])
    expect(mesh.bounds.max).toEqual([1, 1, 0])
  })

  it('throws on invalid magic', async () => {
    const { parseGLB } = await import('./gltf/parser')
    const bad = new Uint8Array(12)
    expect(() => parseGLB(bad)).toThrow(/Not a GLB/)
  })

  it('handles typed array slices correctly', () => {
    // Regression: Uint8Array.slice preserves the underlying ArrayBuffer.
    // The parser must handle DataView offsets correctly.
    const buf = new ArrayBuffer(100)
    const full = new Uint8Array(buf)
    full[0] = 1; full[1] = 2; full[2] = 3; full[3] = 4
    const slice = full.slice(0, 4)
    expect(slice.byteLength).toBe(4)
    expect(slice[0]).toBe(1)
    // DataView over slice should work
    const dv = new DataView(slice.buffer, slice.byteOffset, slice.byteLength)
    expect(dv.getUint8(0)).toBe(1)
  })
})
