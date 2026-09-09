/**
 * Batch renderer CONTRACT tests — the safety net for the WebGL2 performance
 * refactor (VAO / bufferSubData / UBO / multi-texture batching).
 *
 * Design rule: assertions are SEMANTIC, not call-sequence-exact. The refactor
 * is explicitly allowed to change HOW the GL state is set (VAO instead of
 * per-flush vertexAttribPointer, bufferSubData instead of bufferData, UBO
 * instead of per-group uniforms) — so the tests lock WHAT must stay true:
 *
 *   - draw-call grouping by (texture, blendMode) contiguous runs, order kept
 *   - total vertices per draw call
 *   - blend FACTORS per mode (normal / additive / multiply / screen, PMA)
 *   - uploaded vertex DATA (positions/colors/uvs bytes and values)
 *   - layer-filtered flush semantics
 *
 * If one of these fails after a perf refactor, rendering changed — stop.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot, createNode } from '../../node'
import { getRenderContext } from '../../render-context'
import { BatchRenderer } from '../../renderer/batch'
import { createMockWebGLContext } from '../../test-utils'
import { Mat4x4f } from '@rasenjs/math'
import type { GlContext } from '../../node'
import type { BlendMode } from '../../renderer/batch'

/** GL constants (real values — the mock mirrors them). */
const SRC_ALPHA = 0x0302
const ONE_MINUS_SRC_ALPHA = 0x0303
const ONE = 1
const DST_COLOR = 0x0306
const ONE_MINUS_SRC_COLOR = 0x0307

/** Two-triangle quad (6 verts × 3 floats) at (x,y) sized (w,h). */
function quad(x: number, y: number, w: number, h: number): Float32Array {
  return new Float32Array([
    x, y, 0, x + w, y, 0, x, y + h, 0,
    x + w, y, 0, x + w, y + h, 0, x, y + h, 0
  ])
}

/** Translation matrix (batch items carry full model matrices). */
function translate(x: number, y: number): Mat4x4f {
  const m = new Mat4x4f()
  m.source[12] = x
  m.source[13] = y
  return m
}

describe('BatchRenderer contract (WebGL2 perf-refactor safety net)', () => {
  let gl: GlContext
  let rafCallbacks: Array<() => void>
  let rafSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      ;(globalThis as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0
    }
    gl = createMockWebGLContext()
    rafCallbacks = []
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(() => cb(0))
      return rafCallbacks.length
    })
  })

  afterEach(() => {
    rafSpy.mockRestore()
    vi.clearAllMocks()
  })

  /** Run all pending rAF callbacks synchronously (one scheduled frame). */
  const pump = (): void => {
    const cbs = rafCallbacks.splice(0)
    for (const cb of cbs) cb()
  }

  /** Mount a node whose draw submits via the real RenderContext, then pump one frame. */
  function frame(submit: (rc: ReturnType<typeof getRenderContext>) => void): void {
    const root = createRoot(gl)
    createNode(root, {
      draw: () => {
        submit(getRenderContext(gl))
      }
    })
    pump()
    root.remove()
  }

  // -- mock inspection helpers -------------------------------------------------

  /** All drawArrays TRIANGLES vertex counts so far. */
  function draws(): number[] {
    return (gl.drawArrays as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => c[0] === gl.TRIANGLES)
      .map((c) => c[2] as number)
  }

  /** Every uploaded Float32Array (bufferData + bufferSubData if present).
   * Picks the Float32Array argument regardless of call signature
   * (bufferData(target, data, usage) vs bufferSubData(target, offset, data)). */
  function uploads(): Float32Array[] {
    const sub = (gl as unknown as { bufferSubData?: ReturnType<typeof vi.fn> }).bufferSubData
    const calls = [
      ...(gl.bufferData as unknown as ReturnType<typeof vi.fn>).mock.calls,
      ...(sub?.mock.calls ?? [])
    ]
    return calls
      .map((c) => c.find((a) => a instanceof Float32Array) as unknown)
      .filter((d): d is Float32Array => d instanceof Float32Array)
  }

  /** Last blend call's (srcRGB, dstRGB) — blendFuncSeparate preferred, blendFunc fallback. */
  function lastBlend(): [number, number] | undefined {
    const sep = (gl as unknown as { blendFuncSeparate?: ReturnType<typeof vi.fn> }).blendFuncSeparate
    if (sep?.mock.calls.length) {
      const c = sep.mock.calls[sep.mock.calls.length - 1]
      return [c[0] as number, c[1] as number]
    }
    const bf = (gl as unknown as { blendFunc?: ReturnType<typeof vi.fn> }).blendFunc
    if (bf?.mock.calls.length) {
      const c = bf.mock.calls[bf.mock.calls.length - 1]
      return [c[0] as number, c[1] as number]
    }
    return undefined
  }

  // -- grouping ----------------------------------------------------------------

  it('N items sharing texture+blend collapse into ONE draw call with all vertices', () => {
    const tex = { id: 't1' } as unknown as WebGLTexture
    frame((rc) => {
      for (let i = 0; i < 3; i++) {
        rc.addShape('test', quad(i * 10, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, translate(0, 0), undefined, tex)
      }
    })
    const ds = draws()
    expect(ds.length).toBe(1)
    expect(ds[0]).toBe(18) // 3 quads × 6 verts
  })

  it('alternating textures keep CONTIGUOUS runs and draw order (A,B,A → 3 calls)', () => {
    const tA = { id: 'a' } as unknown as WebGLTexture
    const tB = { id: 'b' } as unknown as WebGLTexture
    frame((rc) => {
      rc.addShape('test', quad(0, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, translate(0, 0), undefined, tA)
      rc.addShape('test', quad(10, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, translate(0, 0), undefined, tB)
      rc.addShape('test', quad(20, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, translate(0, 0), undefined, tA)
    })
    expect(draws()).toEqual([6, 6, 6])
  })

  it('blend-mode switches split groups even with one texture', () => {
    const tex = { id: 't' } as unknown as WebGLTexture
    const add = (rc: ReturnType<typeof getRenderContext>, x: number, mode: BlendMode): void => {
      rc.addShape('test', quad(x, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, translate(0, 0), undefined, tex, undefined, undefined, undefined, undefined, undefined, undefined, mode)
    }
    frame((rc) => {
      add(rc, 0, 'normal')
      add(rc, 10, 'additive')
      add(rc, 20, 'normal')
    })
    expect(draws().length).toBe(3)
  })

  // -- blend factors -------------------------------------------------------------

  it('normal blend uses SRC_ALPHA src factor; PMA swaps it to ONE', () => {
    const tex = { id: 't' } as unknown as WebGLTexture
    frame((rc) => {
      rc.addShape('test', quad(0, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, translate(0, 0), undefined, tex)
    })
    expect(lastBlend()?.[0]).toBe(SRC_ALPHA)

    ;(gl.drawArrays as unknown as ReturnType<typeof vi.fn>).mockClear()
    frame((rc) => {
      rc.addShape('test', quad(0, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, translate(0, 0), undefined, tex, undefined, undefined, undefined, undefined, undefined, true)
    })
    expect(lastBlend()?.[0]).toBe(ONE)
  })

  it('additive uses ONE dst; multiply uses DST_COLOR src; screen uses ONE src', () => {
    const tex = { id: 't' } as unknown as WebGLTexture
    // Non-PMA items: srcRgb = SRC_ALPHA for all modes (PMA swaps it to ONE —
    // covered by the PMA test above).
    const cases: Array<[BlendMode, number, number]> = [
      ['additive', SRC_ALPHA, ONE],
      ['multiply', DST_COLOR, ONE_MINUS_SRC_ALPHA],
      ['screen', ONE, ONE_MINUS_SRC_COLOR],
      ['normal', SRC_ALPHA, ONE_MINUS_SRC_ALPHA]
    ]
    for (const [mode, src, dst] of cases) {
      ;(gl.drawArrays as unknown as ReturnType<typeof vi.fn>).mockClear()
      ;((gl as unknown as { blendFunc: ReturnType<typeof vi.fn> }).blendFunc).mockClear()
      frame((rc) => {
        rc.addShape('test', quad(0, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, translate(0, 0), undefined, tex, undefined, undefined, undefined, undefined, undefined, undefined, mode)
      })
      expect(lastBlend()).toEqual([src, dst])
    }
  })

  // -- uploaded data ---------------------------------------------------------------

  it('uploads positions(3f)+colors(4f)+uvs(2f) for a textured quad', () => {
    const tex = { id: 't' } as unknown as WebGLTexture
    const uv = new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1])
    frame((rc) => {
      rc.addShape('test', quad(0, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, translate(0, 0), uv, tex)
    })
    const lens = uploads().map((d) => d.length)
    expect(lens).toContain(18) // positions: 6 verts × 3
    expect(lens).toContain(24) // colors: 6 verts × 4
    expect(lens).toContain(12) // uvs: 6 verts × 2
  })

  it('CPU transform is baked into uploaded positions (translation applied)', () => {
    const tex = { id: 't' } as unknown as WebGLTexture
    frame((rc) => {
      rc.addShape('test', quad(1, 2, 8, 4), { r: 1, g: 1, b: 1, a: 1 }, translate(10, 20), undefined, tex)
    })
    const pos = uploads().find((d) => d.length === 18)
    expect(pos).toBeDefined()
    // First vertex (1,2) + (10,20) → (11,22); second vertex (9,2) → (19,22)
    expect(pos![0]).toBeCloseTo(11)
    expect(pos![1]).toBeCloseTo(22)
    expect(pos![3]).toBeCloseTo(19)
    expect(pos![4]).toBeCloseTo(22)
  })

  it('untextured items skip the UV upload (solid color path)', () => {
    frame((rc) => {
      rc.addShape('test', quad(0, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, translate(0, 0))
    })
    expect(draws().length).toBe(1)
    const lens = uploads().map((d) => d.length)
    expect(lens).toContain(18) // positions
    expect(lens).toContain(24) // colors
    expect(lens).not.toContain(12) // no UV upload
  })

  // -- layers (direct BatchRenderer — layer flushing is driven by the overlay pass) --

  it('flush(layer) draws only that layer and keeps others queued', () => {
    const br = new BatchRenderer(gl, Mat4x4f.identity())
    const tex = { id: 't' } as unknown as WebGLTexture
    br.addShape(quad(0, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, Mat4x4f.identity(), undefined, tex, undefined, undefined, undefined, 0)
    br.addShape(quad(10, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, Mat4x4f.identity(), undefined, tex, undefined, undefined, undefined, 0)
    br.addShape(quad(20, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, Mat4x4f.identity(), undefined, tex, undefined, undefined, undefined, 1)

    ;(gl.drawArrays as unknown as ReturnType<typeof vi.fn>).mockClear()
    br.flush(0)
    expect(draws()).toEqual([12]) // two layer-0 quads in one call

    ;(gl.drawArrays as unknown as ReturnType<typeof vi.fn>).mockClear()
    br.flush()
    expect(draws()).toEqual([6]) // remaining layer-1 quad
  })

  // -- program -----------------------------------------------------------------

  it('uses the shader program at least once per flush', () => {
    frame((rc) => {
      rc.addShape('test', quad(0, 0, 8, 8), { r: 1, g: 1, b: 1, a: 1 }, translate(0, 0))
    })
    expect((gl.useProgram as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})
