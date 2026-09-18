import { describe, it, expect, vi } from 'vitest'
import { createTexture, isCompressedTextureSource } from '../../utils'
import type { CompressedTextureSource } from '../utils'
import { createMockWebGLContext } from '../../test-utils'

/** A 4x4 ASTC-4x4 block: one 16-byte block covers the whole 4x4 image. */
function oneBlockSource(): CompressedTextureSource {
  return {
    compressed: true,
    width: 4,
    height: 4,
    glFormat: 0x93b0, // COMPRESSED_RGBA_ASTC_4x4_KHR
    gpuFormat: 'astc-4x4-unorm',
    levels: [{ data: new Uint8Array(16) }],
  }
}

describe('CompressedTextureSource (capability seam)', () => {
  it('isCompressedTextureSource accepts a well-formed source and rejects lookalikes', () => {
    expect(isCompressedTextureSource(oneBlockSource())).toBe(true)
    expect(isCompressedTextureSource({})).toBe(false)
    expect(isCompressedTextureSource(null)).toBe(false)
    // A raw pixel source must NOT be classified as compressed (no marker).
    expect(isCompressedTextureSource({ width: 4, height: 4, bytes: new Uint8Array(64) })).toBe(false)
    // Missing levels / non-numeric glFormat
    expect(isCompressedTextureSource({ compressed: true, width: 4, height: 4, glFormat: 1, levels: [] })).toBe(false)
    expect(isCompressedTextureSource({ compressed: true, width: 4, height: 4, glFormat: 'x', levels: [{ data: new Uint8Array(1) }] })).toBe(false)
  })

  it('createTexture uploads every mip level via compressedTexImage2D (no texImage2D)', () => {
    const gl = createMockWebGLContext() as unknown as Record<string, any>
    gl.compressedTexImage2D = vi.fn()
    const src = oneBlockSource()
    src.levels.push({ data: new Uint8Array(4) }) // 2x2 mip
    src.levels.push({ data: new Uint8Array(1) }) // placeholder 1x1 mip (16B block but fine for the mock)
    const tex = createTexture(gl as never, src)
    expect(tex).toBeTruthy()
    expect(gl.compressedTexImage2D.mock.calls.length).toBe(3)
    // Level 0 at full extent, level 1 halved, level 2 clamped to 1x1.
    expect(gl.compressedTexImage2D.mock.calls[0].slice(1, 5)).toEqual([0, 0x93b0, 4, 4])
    expect(gl.compressedTexImage2D.mock.calls[1].slice(1, 5)).toEqual([1, 0x93b0, 2, 2])
    expect(gl.compressedTexImage2D.mock.calls[2].slice(1, 5)).toEqual([2, 0x93b0, 1, 1])
    // The RGBA texImage2D path must not have run for a compressed source.
    expect(gl.texImage2D).not.toHaveBeenCalled()
  })

  it('createTexture throws on a compressed source when the context lacks compressedTexImage2D', () => {
    const gl = createMockWebGLContext() as unknown as Record<string, any>
    // No compressedTexImage2D stub — the branch must fail loudly, not
    // silently fall through to the RGBA path (which would re-decode).
    expect(() => createTexture(gl as never, oneBlockSource())).toThrow(/compressedTexImage2D/)
  })

  it('caches compressed sources per context like bitmap sources', () => {
    const gl = createMockWebGLContext() as unknown as Record<string, any>
    gl.compressedTexImage2D = vi.fn()
    const src = oneBlockSource()
    const a = createTexture(gl as never, src)
    const b = createTexture(gl as never, src)
    expect(a).toBe(b)
    expect(gl.compressedTexImage2D.mock.calls.length).toBe(1)
  })
})
