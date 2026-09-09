import { describe, it, expect, vi } from 'vitest'
import { BatchRenderer } from './batch'
import { createMockWebGLContext } from '../test-utils'

/** WebGL mock capturing blendFuncSeparate calls. */
function makeMockGl() {
  const calls: number[][] = []
  const gl = createMockWebGLContext() as unknown as WebGLRenderingContext & {
    blendFuncSeparate: (...args: number[]) => void
  }
  gl.blendFuncSeparate = (...args: number[]) => { calls.push(args) }
  // Constants used by the blend switch.
  ;(gl as unknown as Record<string, number>).ONE = 1
  ;(gl as unknown as Record<string, number>).ONE_MINUS_SRC_COLOR = 774
  ;(gl as unknown as Record<string, number>).DST_COLOR = 776
  return { gl, calls }
}

describe('BatchRenderer blend modes', () => {
  it('uses normal blend for default items', () => {
    const { gl, calls } = makeMockGl()
    const r = new BatchRenderer(gl, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    r.addShape(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), { r: 1, g: 1, b: 1, a: 1 }, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    r.flush()
    expect(calls.length).toBeGreaterThan(0)
    // normal + straight alpha: SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA
    expect(calls[0]).toEqual([770, 771, 1, 771])
  })

  it('uses additive blend for additive items', () => {
    const { gl, calls } = makeMockGl()
    const r = new BatchRenderer(gl, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    r.addShape(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), { r: 1, g: 1, b: 1, a: 1 }, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], undefined, null, undefined, undefined, undefined, undefined, undefined, false, 'additive')
    r.flush()
    expect(calls.length).toBeGreaterThan(0)
    // additive + straight alpha: SRC_ALPHA, ONE, ONE, ONE
    expect(calls[0]).toEqual([770, 1, 1, 1])
  })

  it('uses additive blend with ONE src for PMA additive items', () => {
    const { gl, calls } = makeMockGl()
    const r = new BatchRenderer(gl, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    r.addShape(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), { r: 1, g: 1, b: 1, a: 1 }, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], undefined, null, undefined, undefined, undefined, undefined, undefined, true, 'additive')
    r.flush()
    expect(calls.length).toBeGreaterThan(0)
    // additive + PMA: ONE, ONE, ONE, ONE
    expect(calls[0]).toEqual([1, 1, 1, 1])
  })

  it('uses multiply blend', () => {
    const { gl, calls } = makeMockGl()
    const r = new BatchRenderer(gl, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    r.addShape(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), { r: 1, g: 1, b: 1, a: 1 }, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], undefined, null, undefined, undefined, undefined, undefined, undefined, false, 'multiply')
    r.flush()
    expect(calls.length).toBeGreaterThan(0)
    // multiply: DST_COLOR, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA
    expect(calls[0]).toEqual([776, 771, 1, 771])
  })

  it('uses screen blend', () => {
    const { gl, calls } = makeMockGl()
    const r = new BatchRenderer(gl, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    r.addShape(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), { r: 1, g: 1, b: 1, a: 1 }, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], undefined, null, undefined, undefined, undefined, undefined, undefined, false, 'screen')
    r.flush()
    expect(calls.length).toBeGreaterThan(0)
    // screen: ONE, ONE_MINUS_SRC_COLOR, ONE, ONE_MINUS_SRC_COLOR
    expect(calls[0]).toEqual([1, 774, 1, 774])
  })

  it('preserves draw order across blend modes (contiguous runs, not grouping)', () => {
    const { gl, calls } = makeMockGl()
    const r = new BatchRenderer(gl, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    const verts = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    const color = { r: 1, g: 1, b: 1, a: 1 }
    // Draw order: normal, additive, normal, additive — must stay in this order.
    r.addShape(verts, color, m, undefined, null, undefined, undefined, undefined, undefined, undefined, false, 'normal')
    r.addShape(verts, color, m, undefined, null, undefined, undefined, undefined, undefined, undefined, false, 'additive')
    r.addShape(verts, color, m, undefined, null, undefined, undefined, undefined, undefined, undefined, false, 'normal')
    r.addShape(verts, color, m, undefined, null, undefined, undefined, undefined, undefined, undefined, false, 'additive')
    r.flush()
    // 4 contiguous runs → 4 blendFuncSeparate calls in draw order.
    expect(calls.length).toBe(4)
    expect(calls[0]).toEqual([770, 771, 1, 771]) // normal
    expect(calls[1]).toEqual([770, 1, 1, 1]) // additive
    expect(calls[2]).toEqual([770, 771, 1, 771]) // normal
    expect(calls[3]).toEqual([770, 1, 1, 1]) // additive
  })
})

describe('BatchRenderer indexed items', () => {
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

  it('expands indices into a flat triangle list on the legacy (non-indexed) path', () => {
    const { gl } = makeMockGl()
    const r = new BatchRenderer(gl, IDENTITY)
    // Quad as two triangles sharing an edge: 4 unique vertices, 6 indices.
    const verts = new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0])
    const indices = [0, 1, 2, 0, 2, 3]
    r.addShape(verts, { r: 1, g: 1, b: 1, a: 1 }, IDENTITY, undefined, null, undefined, undefined, undefined, undefined, undefined, undefined, undefined, indices)
    r.flush()
    // drawArrays draws the EXPANDED count (2 triangles = 6 vertices), not 4.
    expect(gl.drawArrays).toHaveBeenCalledWith(4 /* TRIANGLES */, 0, 6)
    // First 18-element bufferData call = positions: v0,v1,v2 then v0,v2,v3.
    const posCall = gl.bufferData.mock.calls.find((c) => (c[1] as { length?: number })?.length === 18)
    expect(posCall).toBeTruthy()
    expect(Array.from(posCall![1] as Float32Array)).toEqual([
      0, 0, 0, 10, 0, 0, 10, 10, 0,
      0, 0, 0, 10, 10, 0, 0, 10, 0,
    ])
  })

  it('handles a mixed indexed/non-indexed group (indexed item expands, other draws as-is)', () => {
    const { gl } = makeMockGl()
    const r = new BatchRenderer(gl, IDENTITY)
    const quad = new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0])
    const tri = new Float32Array([50, 0, 0, 60, 0, 0, 55, 10, 0])
    r.addShape(quad, { r: 1, g: 1, b: 1, a: 1 }, IDENTITY, undefined, null, undefined, undefined, undefined, undefined, undefined, undefined, undefined, [0, 1, 2, 0, 2, 3])
    r.addShape(tri, { r: 1, g: 1, b: 1, a: 1 }, IDENTITY)
    r.flush()
    // 6 expanded vertices from the quad + 3 from the triangle = 9.
    expect(gl.drawArrays).toHaveBeenCalledWith(4 /* TRIANGLES */, 0, 9)
  })
})