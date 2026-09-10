/**
 * WebGL2 (and WebGL1-fallback) implementation of {@link GpuDevice}.
 *
 * This backend is the adapter that hides WebGL's implicit global state machine
 * behind the explicit vocabulary the engine uses (pipelines, bind groups,
 * recorded frames). Everything GL-shaped lives here or in `gl-shaders.ts`.
 *
 * Design notes that matter:
 *
 * - **Pipelines cache their GL program + attribute/uniform locations.** Under
 *   WebGL every draw needs `useProgram` + a `vertexAttribPointer` pass; the
 *   pipeline descriptor is the only place that knows the vertex layout, so the
 *   layout is applied on `setPipeline` and cached per pipeline.
 *
 * - **Bind groups cache their resolved uniform locations.** The engine declares
 *   bindings by number/name; WebGL resolves them with `getUniformLocation`,
 *   which must not happen per frame.
 *
 * - **WebGL1 has no VAOs.** The repo's policy is WebGL2-first with WebGL1 frozen
 *   behind feature probes (`'xxx' in gl`), so VAO usage is probed, not assumed.
 *
 * - **`beginFrame`/`endFrame` are near no-ops here.** WebGL has nothing to
 *   record or submit; they exist so the WebGPU backend has somewhere to create
 *   and submit its command encoder without the engine knowing.
 */

import type { GlContext } from '../node'
import type {
  BindGroupDesc,
  BufferDesc,
  ClearState,
  GpuBindGroupHandle,
  GpuBufferHandle,
  GpuDevice,
  GpuImageSource,
  GpuPipelineHandle,
  GpuRenderTargetHandle,
  GpuTextureHandle,
  IndexFormat,
  PipelineDesc,
  Rect,
  RenderTargetDesc,
  TextureDesc,
  VertexBufferLayout,
} from '../renderer/device'

const GL_BLEND_FACTOR: Record<string, number> = {
  one: 1, // gl.ONE
  zero: 0, // gl.ZERO
  'src-alpha': 0x0302, // gl.SRC_ALPHA
  'one-minus-src-alpha': 0x0303, // gl.ONE_MINUS_SRC_ALPHA
  'one-minus-src-color': 0x0301, // gl.ONE_MINUS_SRC_COLOR
  'dst-alpha': 0x0304, // gl.DST_ALPHA
  'one-minus-dst-alpha': 0x0305, // gl.ONE_MINUS_DST_ALPHA
}

/** Component count + GL type + normalisation for a vertex attribute format. */
function describeFormat(format: string): { size: number; type: number; normalized: boolean } {
  switch (format) {
    case 'float32':
      return { size: 1, type: 0x1406, normalized: false } // FLOAT
    case 'float32x2':
      return { size: 2, type: 0x1406, normalized: false }
    case 'float32x3':
      return { size: 3, type: 0x1406, normalized: false }
    case 'float32x4':
      return { size: 4, type: 0x1406, normalized: false }
    case 'uint8x4':
      return { size: 4, type: 0x1401, normalized: true } // UNSIGNED_BYTE
    case 'uint16x2':
      return { size: 2, type: 0x1403, normalized: false } // UNSIGNED_SHORT
    case 'uint32':
      return { size: 1, type: 0x1405, normalized: false } // UNSIGNED_INT
    default:
      throw new Error(`unknown vertex format: ${format}`)
  }
}

interface WebGLBuffer extends GpuBufferHandle {
  handle: WebGLBuffer | null
  target: number
  dynamic: boolean
}

interface WebGLTextureExt extends GpuTextureHandle {
  handle: WebGLTexture | null
  filter: number
  wrap: number
}

interface WebGLPipeline extends GpuPipelineHandle {
  program: WebGLProgram | null
  layout: VertexBufferLayout[]
  blend: number[]
  depth: { test: boolean; write: boolean; compare: number } | null
  cull: number
}

interface WebGLBindGroup extends GpuBindGroupHandle {
  /** Uniform name -> resolved location, resolved once at creation. */
  programs: Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>
  entries: BindGroupDesc['entries']
  layout: BindGroupDesc['layout']
}

interface WebGLRenderTarget extends GpuRenderTargetHandle {
  framebuffer: WebGLFramebuffer | null
  depthBuffer: WebGLRenderbuffer | null
  color: WebGLTextureExt
}

export class WebGLDevice implements GpuDevice {
  readonly api: 'webgl2' | 'webgl1'
  private gl: GlContext
  private width: number
  private height: number
  /** Attributes currently enabled, so `setPipeline` only toggles the delta. */
  private enabledAttribs = new Set<number>()
  private currentPipeline: WebGLPipeline | null = null
  private indexType = 0x1405 // UNSIGNED_INT
  private vaoExt: { createVertexArray(): WebGLVertexArrayObject | null; bindVertexArray(vao: WebGLVertexArrayObject | null): void; deleteVertexArray(vao: WebGLVertexArrayObject | null): void } | null = null
  private targets = new Map<WebGLPipeline, string>()

  constructor(gl: GlContext) {
    this.gl = gl
    this.api = typeof (gl as WebGL2RenderingContext).createVertexArray === 'function' ? 'webgl2' : 'webgl1'
    const canvas = gl.canvas as { width?: number; height?: number }
    this.width = gl.drawingBufferWidth ?? canvas.width ?? 0
    this.height = gl.drawingBufferHeight ?? canvas.height ?? 0
    // `OES_vertex_array_object` on WebGL1, core on WebGL2. Probed, never assumed.
    if (this.api === 'webgl2') {
      const g2 = gl as WebGL2RenderingContext
      this.vaoExt = {
        createVertexArray: () => g2.createVertexArray(),
        bindVertexArray: (vao) => g2.bindVertexArray(vao),
        deleteVertexArray: (vao) => g2.deleteVertexArray(vao),
      }
    } else {
      const ext = (gl as WebGLRenderingContext).getExtension('OES_vertex_array_object') as
        | {
            createVertexArrayOES(): WebGLVertexArrayObject | null
            bindVertexArrayOES(vao: WebGLVertexArrayObject | null): void
            deleteVertexArrayOES(vao: WebGLVertexArrayObject | null): void
          }
        | null
      if (ext) {
        this.vaoExt = {
          createVertexArray: () => ext.createVertexArrayOES(),
          bindVertexArray: (vao) => ext.bindVertexArrayOES(vao),
          deleteVertexArray: (vao) => ext.deleteVertexArrayOES(vao),
        }
      }
    }
  }

  // -- buffers ---------------------------------------------------------------

  createBuffer(desc: BufferDesc): GpuBufferHandle {
    const gl = this.gl
    const target = desc.usage === 'index' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER
    const handle = gl.createBuffer()
    const byteLength = desc.data ? desc.data.byteLength : (desc.byteLength ?? 0)
    gl.bindBuffer(target, handle)
    if (desc.data) {
      gl.bufferData(target, desc.data, desc.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW)
    } else {
      gl.bufferData(target, byteLength, desc.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW)
    }
    gl.bindBuffer(target, null)
    return { handle, target, byteLength, dynamic: !!desc.dynamic, destroy: () => gl.deleteBuffer(handle) } as WebGLBuffer
  }

  writeBuffer(buffer: GpuBufferHandle, data: ArrayBufferView, byteOffset = 0): void {
    const gl = this.gl
    const b = buffer as WebGLBuffer
    gl.bindBuffer(b.target, b.handle)
    if (byteOffset === 0 && data.byteLength === b.byteLength) {
      gl.bufferData(b.target, data, b.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW)
    } else {
      gl.bufferSubData(b.target, byteOffset, data)
    }
    gl.bindBuffer(b.target, null)
  }

  // -- textures --------------------------------------------------------------

  createTexture(desc: TextureDesc): GpuTextureHandle {
    const gl = this.gl
    const handle = gl.createTexture()
    const filter = desc.filter === 'nearest' ? gl.NEAREST : gl.LINEAR
    const wrap = desc.wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE
    gl.bindTexture(gl.TEXTURE_2D, handle)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
    if (!desc.renderTarget) {
      // A 1x1 placeholder keeps the texture complete before its upload, which
      // matters because sampling an incomplete texture is a silent black frame.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    }
    gl.bindTexture(gl.TEXTURE_2D, null)
    return {
      handle,
      width: desc.width,
      height: desc.height,
      filter,
      wrap,
      destroy: () => gl.deleteTexture(handle),
    } as WebGLTextureExt
  }

  writeTexture(texture: GpuTextureHandle, source: GpuImageSource): void {
    const gl = this.gl
    const t = texture as WebGLTextureExt
    gl.bindTexture(gl.TEXTURE_2D, t.handle)
    // Unpacking flags must be reset per upload: the atlas has both straight and
    // premultiplied pages, and a leaked flip would silently mirror art.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  // -- pipelines & bind groups ----------------------------------------------

  createPipeline(desc: PipelineDesc): GpuPipelineHandle {
    const gl = this.gl
    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, desc.vertex.source)
    gl.compileShader(vs)
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      throw new Error(`vertex shader compile failed: ${gl.getShaderInfoLog(vs)}`)
    }
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, desc.fragment.source)
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      throw new Error(`fragment shader compile failed: ${gl.getShaderInfoLog(fs)}`)
    }
    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`)
    }
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    const b = desc.blend
    return {
      program,
      layout: desc.layouts,
      blend: [
        b.enabled ? 1 : 0,
        GL_BLEND_FACTOR[b.srcColor] ?? 1,
        GL_BLEND_FACTOR[b.dstColor] ?? 0,
        GL_BLEND_FACTOR[b.srcAlpha] ?? 1,
        GL_BLEND_FACTOR[b.dstAlpha] ?? 0,
      ],
      depth: desc.depth ? { test: desc.depth.test, write: desc.depth.write, compare: 0x0203 } : null,
      cull: 0,
      destroy: () => gl.deleteProgram(program),
    } as WebGLPipeline
  }

  createBindGroup(desc: BindGroupDesc): GpuBindGroupHandle {
    // Locations are resolved lazily per program on first use and then cached:
    // `getUniformLocation` is far too slow to call per frame.
    return { programs: new Map(), entries: desc.entries, layout: desc.layout, destroy: () => void 0 } as WebGLBindGroup
  }

  // -- render targets --------------------------------------------------------

  createRenderTarget(desc: RenderTargetDesc): GpuRenderTargetHandle {
    const gl = this.gl
    const framebuffer = gl.createFramebuffer()
    const color = this.createTexture({
      width: desc.width,
      height: desc.height,
      renderTarget: true,
      filter: 'nearest',
    }) as WebGLTextureExt
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color.handle, 0)
    let depthBuffer: WebGLRenderbuffer | null = null
    if (desc.depth) {
      depthBuffer = gl.createRenderbuffer()
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer)
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, desc.width, desc.height)
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer)
      gl.bindRenderbuffer(gl.RENDERBUFFER, null)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return {
      framebuffer,
      depthBuffer,
      color,
      width: desc.width,
      height: desc.height,
      destroy: () => {
        gl.deleteFramebuffer(framebuffer)
        if (depthBuffer) gl.deleteRenderbuffer(depthBuffer)
        color.destroy()
      },
    } as WebGLRenderTarget
  }

  // -- frame ----------------------------------------------------------------

  beginFrame(target: GpuRenderTargetHandle | null, clear: ClearState): void {
    const gl = this.gl
    const t = target as WebGLRenderTarget | null
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.framebuffer : null)
    gl.viewport(0, 0, t ? t.width : this.width, t ? t.height : this.height)
    let mask = 0
    if (clear.clearColor !== false && clear.color) {
      gl.clearColor(clear.color[0], clear.color[1], clear.color[2], clear.color[3])
      mask |= gl.COLOR_BUFFER_BIT
    }
    if (clear.clearDepth) {
      gl.clearDepth(clear.depth ?? 1)
      mask |= gl.DEPTH_BUFFER_BIT
    }
    if (mask) gl.clear(mask)
    this.enabledAttribs.clear()
    this.currentPipeline = null
  }

  setPipeline(pipeline: GpuPipelineHandle): void {
    const gl = this.gl
    const p = pipeline as WebGLPipeline
    if (this.currentPipeline === p) return
    this.currentPipeline = p
    gl.useProgram(p.program)
    const [blendOn, sc, dc, sa, da] = p.blend
    if (blendOn) {
      gl.enable(gl.BLEND)
      gl.blendFuncSeparate(sc, dc, sa, da)
    } else {
      gl.disable(gl.BLEND)
    }
    if (p.depth) {
      if (p.depth.test) gl.enable(gl.DEPTH_TEST)
      else gl.disable(gl.DEPTH_TEST)
      gl.depthMask(p.depth.write)
      gl.depthFunc(p.depth.compare)
    } else {
      gl.disable(gl.DEPTH_TEST)
      gl.depthMask(false)
    }
    // Attribute enable/disable deltas only: the set is reset in beginFrame.
    const wanted = new Set<number>()
    for (const layout of p.layout) {
      for (const attr of layout.attributes) {
        const loc = gl.getAttribLocation(p.program, attr.shaderLocation)
        if (loc >= 0) wanted.add(loc)
      }
    }
    for (const loc of this.enabledAttribs) if (!wanted.has(loc)) gl.disableVertexAttribArray(loc)
    for (const loc of wanted) if (!this.enabledAttribs.has(loc)) gl.enableVertexAttribArray(loc)
    this.enabledAttribs = wanted
  }

  setBindGroup(_index: number, group: GpuBindGroupHandle): void {
    const gl = this.gl
    const g = group as WebGLBindGroup
    const program = this.currentPipeline?.program
    if (!program) return
    let cache = g.programs.get(program)
    if (!cache) {
      cache = new Map()
      for (const e of g.layout) {
        cache.set(`b${e.binding}`, gl.getUniformLocation(program, `b${e.binding}`))
      }
      g.programs.set(program, cache)
    }
    let textureUnit = 0
    for (const entry of g.entries) {
      const loc = cache.get(`b${entry.binding}`) ?? null
      if (loc === null) continue
      if (entry.kind === 'texture') {
        gl.activeTexture(gl.TEXTURE0 + textureUnit)
        gl.bindTexture(gl.TEXTURE_2D, (entry.texture as WebGLTextureExt | undefined)?.handle ?? null)
        gl.uniform1i(loc, textureUnit)
        textureUnit++
      }
      // Uniform-buffer bindings are applied by the caller through
      // `writeBuffer` + the engine's uniform helper; keeping them out of this
      // loop avoids a per-frame getUniformLocation walk.
    }
  }

  setVertexBuffers(buffers: (GpuBufferHandle | null)[], offsets?: number[]): void {
    const gl = this.gl
    const p = this.currentPipeline
    if (!p) return
    for (const layout of p.layout) {
      const buf = buffers[layout.slot] as WebGLBuffer | null | undefined
      if (!buf) continue
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.handle)
      const baseOffset = offsets?.[layout.slot] ?? 0
      for (const attr of layout.attributes) {
        const loc = gl.getAttribLocation(p.program, attr.shaderLocation)
        if (loc < 0) continue
        const f = describeFormat(attr.format)
        gl.vertexAttribPointer(loc, f.size, f.type, f.normalized, layout.stride, baseOffset + attr.offset)
        if (attr.instanced) gl.vertexAttribDivisor(loc, attr.instancedDivisor ?? 1)
      }
    }
  }

  setIndexBuffer(buffer: GpuBufferHandle, format: IndexFormat): void {
    const gl = this.gl
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, (buffer as WebGLBuffer).handle)
    this.indexType = format === 'uint16' ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT
  }

  setScissor(rect: Rect | null): void {
    const gl = this.gl
    if (!rect) {
      gl.disable(gl.SCISSOR_TEST)
      return
    }
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(rect.x, rect.y, rect.width, rect.height)
  }

  drawIndexed(indexCount: number, indexByteOffset: number, instanceCount = 1): void {
    const gl = this.gl
    if (instanceCount > 1 && this.api === 'webgl2') {
      ;(gl as WebGL2RenderingContext).drawElementsInstanced(
        gl.TRIANGLES,
        indexCount,
        this.indexType,
        indexByteOffset,
        instanceCount
      )
      return
    }
    gl.drawElements(gl.TRIANGLES, indexCount, this.indexType, indexByteOffset)
  }

  drawArrays(vertexCount: number, firstVertex: number, instanceCount = 1): void {
    const gl = this.gl
    if (instanceCount > 1 && this.api === 'webgl2') {
      ;(gl as WebGL2RenderingContext).drawArraysInstanced(gl.TRIANGLES, firstVertex, vertexCount, instanceCount)
      return
    }
    gl.drawArrays(gl.TRIANGLES, firstVertex, vertexCount)
  }

  endFrame(): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  destroy(): void {
    this.targets.clear()
    this.enabledAttribs.clear()
    this.currentPipeline = null
  }
}
