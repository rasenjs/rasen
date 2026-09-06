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