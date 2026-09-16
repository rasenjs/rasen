import { describe, it, expect, vi } from 'vitest'
import { WebGLRenderer as BatchRenderer } from '../index'
import { createMockWebGLContext } from '../../../test-utils'
import type { BlendMode } from '../../base'

/**
 * Fast-lane (beginMesh/endMesh) sealed-run CONTRACT tests.
 *
 * These lock the three invariants the multi-page-atlas regression (NIKKE
 * c223/c233 "shredded character" / "smoke renders clothing") violated:
 *
 *   1. A merged sealed run draws at its OWN element-buffer offset
 *      (iBase * 4) — offset 0 reads the buffer start and renders garbage
 *      triangles for every run after the first.
 *   2. A sealed run's index count covers EVERY marker in the run
 *      (flushMerged must pass an EXCLUSIVE end to drawSealedRun) — an
 *      inclusive end silently drops the run's final attachment.
 *   3. A texture change between consecutive markers SPLITS the run —
 *      drawSealedRun binds one texture, so an unsplit run would sample the
 *      previous atlas page (wrong artwork on multi-page skeletons).
 *
 * Plus the texIndex re-zero rule: the re-zero upload must write ZEROS, not
 * the staging content (fast-lane producers never stage texIndices — the
 * staging range holds stale values from previous legacy multi-texture
 * groups).
 *
 * No rendering: assertions inspect the mock GL call log only.
 */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const COLOR = { r: 1, g: 1, b: 1, a: 1 }
const TRIANGLES = 0x0004
const UNSIGNED_INT = 0x1405
const ARRAY_BUFFER = 0x8892
const ELEMENT_ARRAY_BUFFER = 0x8893

/** Base mock + the WebGL2 entry points the fast lane requires. The base
 * mock intentionally lacks `createVertexArray`, which is exactly how the
 * BatchRenderer probes WebGL2 — adding it switches flush() to the merged
 * (flushMerged / drawSealedRun) path. */
function makeMockGl2() {
  const gl = createMockWebGLContext() as unknown as Record<string, any>
  gl.createVertexArray = vi.fn(() => ({}))
  gl.bindVertexArray = vi.fn()
  gl.deleteVertexArray = vi.fn()
  gl.bufferSubData = vi.fn()
  gl.drawElements = vi.fn()
  gl.blendFuncSeparate = vi.fn()
  gl.bindBufferBase = vi.fn()
  gl.uniformBlockBinding = vi.fn()
  gl.getUniformBlockIndex = vi.fn(() => 0)
  gl.uniform1iv = vi.fn()
  gl.UNIFORM_BUFFER = 0x8a11
  gl.ELEMENT_ARRAY_BUFFER = ELEMENT_ARRAY_BUFFER
  gl.UNSIGNED_INT = UNSIGNED_INT
  return gl
}

/** Submit one sealed mesh: 4 verts / 2 triangles (6 indices). Positions are
 * filled with the vertex's global staging index so uploads are assertable;
 * indices are the vBase-offseted quad triangulation. */
function sealMesh(r: BatchRenderer, texture: WebGLTexture, blendMode: BlendMode = 'normal'): void {
  const m = r.beginMesh(4, 6)!
  for (let v = 0; v < 4; v++) {
    m.pos[m.vBase * 3 + v * 3] = m.vBase + v
    m.pos[m.vBase * 3 + v * 3 + 1] = m.vBase + v
    m.pos[m.vBase * 3 + v * 3 + 2] = 0
    for (let k = 0; k < 4; k++) m.col[m.vBase * 4 + v * 4 + k] = 255
    m.uv[m.vBase * 2 + v * 2] = 0.5
    m.uv[m.vBase * 2 + v * 2 + 1] = 0.5
  }
  const tris = [0, 1, 2, 0, 2, 3]
  for (let i = 0; i < 6; i++) m.idx[m.iBase + i] = tris[i] + m.vBase
  r.endMesh(m, 4, 6, texture, blendMode, false, false)
}

/** Element-buffer uploads: (byteOffset, Uint32Array content). */
function elementUploads(gl: Record<string, any>): Array<{ offset: number; data: Uint32Array }> {
  return gl.bufferSubData.mock.calls
    .filter((c: unknown[]) => c[0] === ELEMENT_ARRAY_BUFFER)
    .map((c: unknown[]) => ({ offset: c[1] as number, data: c[2] as Uint32Array }))
}

/** drawElements calls: [mode, count, type, byteOffset]. */
function elementDraws(gl: Record<string, any>): Array<[number, number, number, number]> {
  return gl.drawElements.mock.calls.map((c: unknown[]) => c as [number, number, number, number])
}

describe('BatchRenderer sealed runs (fast lane)', () => {
  it('merges same-key markers into ONE run covering every marker at the run offset', () => {
    const gl = makeMockGl2()
    const r = new BatchRenderer(gl, IDENTITY)
    const tex = {} as WebGLTexture
    sealMesh(r, tex)
    sealMesh(r, tex)
    sealMesh(r, tex)
    r.flush()
    // One merged run → one drawElements. 18 indices = 3 markers × 6 — an
    // INCLUSIVE end passed to drawSealedRun would draw only 12 (the last
    // marker's attachment silently dropped).
    const draws = elementDraws(gl)
    expect(draws.length).toBe(1)
    expect(draws[0]).toEqual([TRIANGLES, 18, UNSIGNED_INT, 0])
    // The uploaded element range carries all three markers' offseted indices.
    const uploads = elementUploads(gl)
    expect(uploads.length).toBe(1)
    expect(Array.from(uploads[0].data)).toEqual([
      0, 1, 2, 0, 2, 3,
      4, 5, 6, 4, 6, 7,
      8, 9, 10, 8, 10, 11,
    ])
  })

  it('draws each run at its OWN element offset — not the buffer start', () => {
    const gl = makeMockGl2()
    const r = new BatchRenderer(gl, IDENTITY)
    const texA = {} as WebGLTexture
    const texB = {} as WebGLTexture
    sealMesh(r, texA) // run 1: vBase 0, iBase 0
    sealMesh(r, texB) // texture change splits → run 2: vBase 4, iBase 6
    sealMesh(r, texB) // same texture merges into run 2
    r.flush()
    const draws = elementDraws(gl)
    expect(draws.length).toBe(2)
    expect(draws[0]).toEqual([TRIANGLES, 6, UNSIGNED_INT, 0])
    // Run 2 starts at element index 6 → byte offset 24. Drawing at offset 0
    // (the pre-fix behavior) reads run 1's indices and renders garbage.
    expect(draws[1]).toEqual([TRIANGLES, 12, UNSIGNED_INT, 24])
    const uploads = elementUploads(gl)
    expect(uploads.length).toBe(2)
    expect(uploads[1].offset).toBe(24)
    expect(Array.from(uploads[1].data)).toEqual([
      4, 5, 6, 4, 6, 7,
      8, 9, 10, 8, 10, 11,
    ])
  })

  it('splits sealed runs on texture change and binds each run its own texture', () => {
    const gl = makeMockGl2()
    const r = new BatchRenderer(gl, IDENTITY)
    const texA = {} as WebGLTexture
    const texB = {} as WebGLTexture
    sealMesh(r, texA)
    sealMesh(r, texB)
    sealMesh(r, texA)
    r.flush()
    // A | B | A → three runs. An unsplit merge would draw once bound to texA
    // and the texB/texA meshes would sample page A (the "smoke renders
    // clothing" bug).
    expect(elementDraws(gl).length).toBe(3)
    const binds = gl.bindTexture.mock.calls.map((c: unknown[]) => c[1])
    expect(binds).toEqual([texA, texB, texA])
  })

  it('keeps separate blend modes in separate runs (key change splits)', () => {
    const gl = makeMockGl2()
    const r = new BatchRenderer(gl, IDENTITY)
    const tex = {} as WebGLTexture
    sealMesh(r, tex, 'normal')
    sealMesh(r, tex, 'additive')
    r.flush()
    expect(elementDraws(gl).length).toBe(2)
    expect(elementDraws(gl)[0]).toEqual([TRIANGLES, 6, UNSIGNED_INT, 0])
    expect(elementDraws(gl)[1]).toEqual([TRIANGLES, 6, UNSIGNED_INT, 24])
  })

  it('re-zeroes the texIndex attribute with ZEROS after a multi-texture legacy group', () => {
    const gl = makeMockGl2()
    const r = new BatchRenderer(gl, IDENTITY)
    const texA = {} as WebGLTexture
    const texB = {} as WebGLTexture
    // Two adjacent legacy items with different textures merge into one
    // multi-texture drawGroup → texIndexStale = true (the buffer holds
    // non-zero slot indices).
    const verts = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    r.addShape(verts, COLOR, IDENTITY, undefined, texA)
    r.addShape(verts, COLOR, IDENTITY, undefined, texB)
    // Sealed mesh staged AFTER the legacy group.
    sealMesh(r, texA)
    r.flush()
    // The sealed run's texIndex re-zero upload: bufferSubData(ARRAY_BUFFER,
    // vBase*4, Float32Array(vCount)). It must carry ZEROS — the staging
    // range was never written by the fast-lane producer and holds the
    // legacy group's stale slot indices.
    const texIndexUpload = gl.bufferSubData.mock.calls.find(
      (c: unknown[]) =>
        c[0] === ARRAY_BUFFER &&
        c[1] === 0 && // vBase 0 → byte offset 0 (color upload is Uint8Array, uv is at offset 0 too but length 8)
        c[2] instanceof Float32Array &&
        (c[2] as Float32Array).length === 4
    )
    expect(texIndexUpload).toBeTruthy()
    expect(Array.from(texIndexUpload![2] as Float32Array)).toEqual([0, 0, 0, 0])
  })
})
