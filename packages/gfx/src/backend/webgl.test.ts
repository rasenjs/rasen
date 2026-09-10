/**
 * Backend contract tests for the WebGL implementation of {@link GpuDevice}.
 *
 * Two kinds of assertion here, and the distinction matters:
 *
 *  1. **Emitted-GL assertions** — that the backend performs the *right* GL calls
 *     (exclusive end offsets, per-draw state deltas, texture-unit assignment).
 *     These pin behaviour the WebGPU backend must reproduce equivalently.
 *  2. **Interface assertions** — that the backend never requires the engine to
 *     know a GL type. That is what makes the second backend possible at all.
 *
 * The mock context records every call, so these are real assertions about the
 * command stream rather than smoke tests.
 */
import { describe, expect, it, vi } from 'vitest'
import { WebGLDevice } from '../backend/webgl'
import { createMockWebGL2Context, createMockWebGLContext } from '../test-utils'
import type { GlContext } from '../node'

/**
 * The device tests use the **WebGL2** mock: the backend promises indexed /
 * instanced draws and render targets, and the default mock is deliberately a
 * WebGL1 context (see createMockWebGL2Context). The WebGL1 fallback is covered
 * separately at the bottom of this file.
 */
function device(): { dev: WebGLDevice; gl: GlContext } {
  const gl = createMockWebGL2Context()
  return { dev: new WebGLDevice(gl), gl }
}

const basePipeline = {
  vertex: { stage: 'vertex' as const, source: 'void main(){}' },
  fragment: { stage: 'fragment' as const, source: 'void main(){}' },
  layouts: [],
  bindGroupLayout: [],
  blend: { enabled: true, srcColor: 'one' as const, dstColor: 'one-minus-src-alpha' as const, srcAlpha: 'one' as const, dstAlpha: 'one-minus-src-alpha' as const },
}

describe('WebGLDevice — buffers', () => {
  it('creates a vertex buffer with the right target and initial data', () => {
    const { dev, gl } = device()
    const data = new Float32Array([1, 2, 3, 4])
    const buf = dev.createBuffer({ usage: 'vertex', data })

    expect(gl.createBuffer).toHaveBeenCalledTimes(1)
    expect(gl.bindBuffer).toHaveBeenCalledWith(gl.ARRAY_BUFFER, expect.anything())
    expect(gl.bufferData).toHaveBeenCalledWith(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    // The binding must be released, otherwise a later draw rebinds by accident.
    expect(gl.bindBuffer).toHaveBeenLastCalledWith(gl.ARRAY_BUFFER, null)
    expect(buf.byteLength).toBe(16)
  })

  it('uses the element-array target for index buffers and infers the index type', () => {
    const { dev, gl } = device()
    const idx = new Uint32Array([0, 1, 2])
    const buf = dev.createBuffer({ usage: 'index', data: idx })
    expect(gl.bindBuffer).toHaveBeenCalledWith(gl.ELEMENT_ARRAY_BUFFER, expect.anything())

    dev.beginFrame(null, {})
    dev.setIndexBuffer(buf, 'uint32')
    dev.drawIndexed(3, 0)
    expect(gl.drawElements).toHaveBeenCalledWith(gl.TRIANGLES, 3, gl.UNSIGNED_INT, 0)
  })

  it('honours uint16 index format', () => {
    const { dev, gl } = device()
    const buf = dev.createBuffer({ usage: 'index', data: new Uint16Array([0, 1, 2]) })
    dev.beginFrame(null, {})
    dev.setIndexBuffer(buf, 'uint16')
    dev.drawIndexed(3, 0)
    expect(gl.drawElements).toHaveBeenCalledWith(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0)
  })

  it('passes the byte offset through to drawElements unchanged', () => {
    // Offsets are bytes, not elements. Getting this wrong is exactly the bug the
    // sealed-run path shipped once (drawSealedRun must use iBase * 4).
    const { dev, gl } = device()
    const buf = dev.createBuffer({ usage: 'index', data: new Uint32Array(64) })
    dev.beginFrame(null, {})
    dev.setIndexBuffer(buf, 'uint32')
    dev.drawIndexed(6, 24)
    expect(gl.drawElements).toHaveBeenCalledWith(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 24)
  })

  it('reallocates with bufferData when a full overwrite is the same size', () => {
    const { dev, gl } = device()
    const data = new Float32Array(4)
    const buf = dev.createBuffer({ usage: 'vertex', data, dynamic: true })
    vi.clearAllMocks()
    dev.writeBuffer(buf, data)
    expect(gl.bufferData).toHaveBeenCalledWith(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    expect(gl.bufferSubData).not.toHaveBeenCalled()
  })

  it('uses bufferSubData for a partial write', () => {
    const { dev, gl } = device()
    const buf = dev.createBuffer({ usage: 'vertex', byteLength: 64, dynamic: true })
    vi.clearAllMocks()
    dev.writeBuffer(buf, new Float32Array(2), 16)
    expect(gl.bufferSubData).toHaveBeenCalledWith(gl.ARRAY_BUFFER, 16, expect.anything())
  })
})

describe('WebGLDevice — textures', () => {
  it('sets filter and wrap from the descriptor', () => {
    const { dev, gl } = device()
    dev.createTexture({ width: 8, height: 8, filter: 'nearest', wrap: 'clamp' })
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  })

  it('pre-fills a sampled texture so it is never incomplete', () => {
    // Sampling an incomplete texture renders black with no error — a silent bug.
    const { dev, gl } = device()
    dev.createTexture({ width: 4, height: 4 })
    expect(gl.texImage2D).toHaveBeenCalled()
  })

  it('does not pre-fill a render-target texture', () => {
    const { dev, gl } = device()
    dev.createTexture({ width: 4, height: 4, renderTarget: true })
    expect(gl.texImage2D).not.toHaveBeenCalled()
  })

  it('resets unpack state on every upload', () => {
    // A leaked UNPACK_FLIP_Y would mirror every subsequent atlas upload.
    const { dev, gl } = device()
    const tex = dev.createTexture({ width: 4, height: 4 })
    vi.clearAllMocks()
    dev.writeTexture(tex, {} as CanvasImageSource)
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, 0)
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
    expect(gl.texImage2D).toHaveBeenCalled()
  })
})

describe('WebGLDevice — pipelines and state deltas', () => {
  it('compiles, links and enables blending from the descriptor', () => {
    const { dev, gl } = device()
    dev.beginFrame(null, {})
    dev.setPipeline(dev.createPipeline(basePipeline))
    expect(gl.linkProgram).toHaveBeenCalled()
    expect(gl.useProgram).toHaveBeenCalled()
    expect(gl.enable).toHaveBeenCalledWith(gl.BLEND)
    expect(gl.blendFuncSeparate).toHaveBeenCalled()
  })

  it('is re-entrant: setting the same pipeline twice is a no-op', () => {
    // Every draw goes through setPipeline; without the guard this is a
    // useProgram + full attribute rebind per draw run.
    const { dev, gl } = device()
    const p = dev.createPipeline(basePipeline)
    dev.beginFrame(null, {})
    dev.setPipeline(p)
    const after = (gl.useProgram as ReturnType<typeof vi.fn>).mock.calls.length
    dev.setPipeline(p)
    expect((gl.useProgram as ReturnType<typeof vi.fn>).mock.calls.length).toBe(after)
  })

  it('disables depth when the pipeline does not declare it', () => {
    const { dev, gl } = device()
    dev.beginFrame(null, {})
    dev.setPipeline(dev.createPipeline(basePipeline))
    expect(gl.disable).toHaveBeenCalledWith(gl.DEPTH_TEST)
  })

  it('maps vertex formats to the right component count and normalisation', () => {
    const { dev, gl } = device()
    const pipeline = dev.createPipeline({
      ...basePipeline,
      layouts: [
        {
          slot: 0,
          stride: 24,
          attributes: [
            { shaderLocation: 'a_pos', offset: 0, format: 'float32x2' },
            { shaderLocation: 'a_color', offset: 8, format: 'uint8x4' },
          ],
        },
      ],
    })
    dev.beginFrame(null, {})
    dev.setPipeline(pipeline)
    const buf = dev.createBuffer({ usage: 'vertex', data: new Float32Array(6) })
    dev.setVertexBuffers([buf])

    const calls = (gl.vertexAttribPointer as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c) => c[1] === 2 && c[2] === gl.FLOAT && c[4] === 24 && c[5] === 0)).toBe(true)
    expect(calls.some((c) => c[1] === 4 && c[2] === gl.UNSIGNED_BYTE && c[3] === true && c[5] === 8)).toBe(true)
  })

  it('applies the vertex-buffer byte offset on top of the attribute offset', () => {
    const { dev, gl } = device()
    const pipeline = dev.createPipeline({
      ...basePipeline,
      layouts: [{ slot: 0, stride: 8, attributes: [{ shaderLocation: 'a_pos', offset: 4, format: 'float32' }] }],
    })
    dev.beginFrame(null, {})
    dev.setPipeline(pipeline)
    dev.setVertexBuffers([dev.createBuffer({ usage: 'vertex', data: new Float32Array(8) })], [96])
    const calls = (gl.vertexAttribPointer as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c) => c[5] === 100)).toBe(true)
  })

  it('sets the instance divisor for instanced attributes', () => {
    const { dev, gl } = device()
    const pipeline = dev.createPipeline({
      ...basePipeline,
      layouts: [{ slot: 0, stride: 8, attributes: [{ shaderLocation: 'a_i', offset: 0, format: 'float32x2', instanced: true }] }],
    })
    dev.beginFrame(null, {})
    dev.setPipeline(pipeline)
    dev.setVertexBuffers([dev.createBuffer({ usage: 'vertex', data: new Float32Array(4) })])
    expect(gl.vertexAttribDivisor).toHaveBeenCalledWith(expect.any(Number), 1)
  })
})

describe('WebGLDevice — frame and render targets', () => {
  it('clears only the requested attachments', () => {
    const { dev, gl } = device()
    dev.beginFrame(null, { color: [1, 0, 0, 1], clearColor: true })
    expect(gl.clearColor).toHaveBeenCalledWith(1, 0, 0, 1)
    expect(gl.clear).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT)

    vi.clearAllMocks()
    dev.beginFrame(null, { color: [1, 0, 0, 1], clearColor: false, clearDepth: true })
    expect(gl.clear).toHaveBeenCalledWith(gl.DEPTH_BUFFER_BIT)
    expect(gl.clearColor).not.toHaveBeenCalled()
  })

  it('binds the default framebuffer when the target is null', () => {
    const { dev, gl } = device()
    dev.beginFrame(null, {})
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, null)
  })

  it('creates a colour attachment and a depth renderbuffer for a shadow target', () => {
    const { dev, gl } = device()
    const rt = dev.createRenderTarget({ width: 512, height: 512, depth: true })
    expect(gl.framebufferTexture2D).toHaveBeenCalled()
    expect(gl.renderbufferStorage).toHaveBeenCalledWith(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 512, 512)
    expect(gl.framebufferRenderbuffer).toHaveBeenCalled()
    expect(rt.width).toBe(512)
  })

  it('binds and sizes the viewport to the target on begin', () => {
    const { dev, gl } = device()
    const rt = dev.createRenderTarget({ width: 256, height: 128 })
    vi.clearAllMocks()
    dev.beginFrame(rt, {})
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, expect.anything())
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 256, 128)
  })

  it('restores the default framebuffer at endFrame', () => {
    const { dev, gl } = device()
    dev.beginFrame(dev.createRenderTarget({ width: 16, height: 16 }), {})
    vi.clearAllMocks()
    dev.endFrame()
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, null)
  })

  it('enables and disables scissor', () => {
    const { dev, gl } = device()
    dev.setScissor({ x: 1, y: 2, width: 3, height: 4 })
    expect(gl.enable).toHaveBeenCalledWith(gl.SCISSOR_TEST)
    expect(gl.scissor).toHaveBeenCalledWith(1, 2, 3, 4)
    dev.setScissor(null)
    expect(gl.disable).toHaveBeenCalledWith(gl.SCISSOR_TEST)
  })
})

describe('WebGLDevice — WebGL1 fallback', () => {
  // The repo's policy is WebGL2-first with WebGL1 frozen but working, behind
  // feature probes. The device must detect the version from capabilities rather
  // than assume, because the mock (and real old devices) lack VAOs.
  it('detects webgl1 when vertex-array objects are absent', () => {
    const dev = new WebGLDevice(createMockWebGLContext())
    expect(dev.api).toBe('webgl1')
  })

  it('detects webgl2 when they are present', () => {
    const dev = new WebGLDevice(createMockWebGL2Context())
    expect(dev.api).toBe('webgl2')
  })

  it('falls back to non-instanced draw on webgl1', () => {
    const gl = createMockWebGLContext()
    const dev = new WebGLDevice(gl)
    dev.drawArrays(3, 0, 4)
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3)
  })

  it('uses the instanced draw on webgl2', () => {
    const gl = createMockWebGL2Context()
    const dev = new WebGLDevice(gl)
    dev.drawArrays(3, 0, 4)
    expect(
      (gl as unknown as WebGL2RenderingContext).drawArraysInstanced
    ).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3, 4)
  })
})

describe('WebGLDevice — interface contract', () => {
  it('reports the api and drawing-buffer size', () => {
    const { dev } = device()
    expect(['webgl1', 'webgl2']).toContain(dev.api)
    expect(dev.width).toBe(800)
    expect(dev.height).toBe(600)
  })

  it('exposes no GL type in any handle it returns', () => {
    // The whole point of the abstraction: handles are opaque. If a `WebGL*`
    // value leaks out, the WebGPU backend cannot be a drop-in replacement.
    const { dev } = device()
    const handles = [
      dev.createBuffer({ usage: 'vertex', data: new Float32Array(2) }),
      dev.createTexture({ width: 2, height: 2 }),
      dev.createPipeline(basePipeline),
      dev.createBindGroup({ layout: [], entries: [] }),
      dev.createRenderTarget({ width: 2, height: 2 }),
    ]
    for (const h of handles) {
      for (const value of Object.values(h as unknown as Record<string, unknown>)) {
        if (typeof value === 'function') continue
        expect(String(Object.prototype.toString.call(value))).not.toMatch(/WebGL/)
      }
    }
  })
})
