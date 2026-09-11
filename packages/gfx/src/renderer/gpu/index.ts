/**
 * WebGPU renderer — the WebGPU implementation of {@link Renderer}.
 *
 * Everything device-agnostic (batching decisions, grouping, staging, the
 * transform loop) lives in the base class. This file only executes WebGPU
 * calls: pipelines, bind groups, the interleaved vertex upload, and the frame
 * submission.
 *
 * The WebGPU-specific facts below are NOT trivia, they are the reasons the
 * first version of this file drew a black frame or a wrong image while
 * reporting no error. They are asserted by the equivalence gate
 * (`benchmark/gfx/verify-backend-equivalence.mjs`).
 *
 *  1. `COPY_SRC` must be in the canvas `configure({ usage })`, or the frame
 *     texture cannot be copied out for readback.
 *  2. A canvas texture is unusable after the frame is presented: the readback
 *     copy is recorded into the SAME command buffer as the draws.
 *  3. A bind group is created against ONE layout that lists every binding —
 *     not one layout per entry.
 *  4. Vertex locations are the attribute's position in the layout. A name
 *     table mixed with positional fallback collides and the pipeline is
 *     rejected.
 *  5. Sampler filtering comes from the bound texture; a default of `linear`
 *     blurs nearest-filtered atlases.
 *  6. The canvas is `bgra8unorm` on most platforms; readback swizzles to RGBA.
 *
 * Scope matches what the spine path uses: `addShape` (per-vertex, with
 * optional indices/vertex colours/packed colour/normals), `beginMesh`/
 * `endMesh` (the sealed fast lane), `flush(layer)`, and the frame matrices.
 * Instancing and the shadow/overlay post passes are not here yet (see
 * docs/GPU-BACKEND-DESIGN.md).
 */

import { Mat4x4f } from '@rasenjs/math'
import { computeCameraMatrix, type CameraConfig } from '../../camera'
import { Renderer, MAX_TEXTURES_PER_DRAW, type BatchItem, type BlendMode, type GroupStreams, type TextureHandle } from '../base'
import type { TransformState, TransformInput } from '../../transform-stack'
import {
  DEFAULT_FRAGMENT_WGSL,
  DEFAULT_VERTEX_WGSL,
  ENGINE_BINDINGS,
  ENGINE_TEXTURE_BINDINGS,
  FRAME_LAYOUT,
} from './shaders'

/** position(3) + color(4) + uv(2) + normal(3) + texIndex(1) floats per vertex. */
const FLOATS_PER_VERTEX = 13
const STRIDE = FLOATS_PER_VERTEX * 4

const BLEND: Record<BlendMode, { src: GPUBlendFactor; dst: GPUBlendFactor; srcA: GPUBlendFactor; dstA: GPUBlendFactor }> = {
  normal: { src: 'src-alpha', dst: 'one-minus-src-alpha', srcA: 'one', dstA: 'one-minus-src-alpha' },
  additive: { src: 'one', dst: 'one', srcA: 'one', dstA: 'one' },
  multiply: { src: 'dst', dst: 'one-minus-src-alpha', srcA: 'one', dstA: 'one-minus-src-alpha' },
  screen: { src: 'one', dst: 'one-minus-src', srcA: 'one', dstA: 'one-minus-src' },
}

function parseColor(s: string): [number, number, number, number] {
  const rgba = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/)
  if (rgba) return [Number(rgba[1]) / 255, Number(rgba[2]) / 255, Number(rgba[3]) / 255, rgba[4] ? Number(rgba[4]) : 1]
  if (s.startsWith('#')) {
    const h = s.slice(1)
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
      h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    ]
  }
  return [0, 0, 0, 0]
}

/** Result of an upload: where the draw reads its indices and how they map
 * onto the vertex stream. */
interface DrawRange {
  firstIndex: number
  baseVertex: number
}

/** Canvas → renderer registry. The dom bridge mounts the renderer internally;
 * hosts that need the instance back (e.g. an async pixel readback for a
 * camera fit) look it up by the canvas element. WeakMap: GC-friendly when a
 * canvas is unmounted and its renderer dropped. */
const rendererByCanvas = new WeakMap<HTMLCanvasElement, WebGPURenderer>()

/** Get the WebGPURenderer previously mounted on this canvas, if any. */
export function getWebGPURenderer(canvas: HTMLCanvasElement): WebGPURenderer | null {
  return rendererByCanvas.get(canvas) ?? null
}

export class WebGPURenderer extends Renderer {
  get ctx(): unknown {
    return this.canvas
  }
  private device: GPUDevice
  private canvas: HTMLCanvasElement
  private context: GPUCanvasContext
  private format: GPUTextureFormat

  private uniforms: GPUBuffer
  private uniformData: Float32Array
  /** Second copy of the frame uniforms with skipTonemap=1. GL sets
   * u_skipTonemap per draw; WebGPU uniforms are frame-level, so per-item
   * tonemap selection binds a different uniform buffer instead. Without
   * this, spine atlases got the ACES+gamma pass GL skips — washed-out
   * colours and visible seams between parts. */
  private uniformsSkipTonemap: GPUBuffer
  private uniformDataSkip: Float32Array

  private pipelines = new Map<string, GPURenderPipeline>()
  private bindGroups = new Map<string, GPUBindGroup>()
  private samplers = new Map<string, GPUSampler>()
  /** The ONE layout every pipeline and bind group here uses. Created lazily. */
  private layout: GPUBindGroupLayout | null = null
  private white: GPUTexture | null = null

  // GPU buffers, grown on demand via the base's capacity hooks. The SoA→AOS
  // interleaving happens at upload time.
  private vertexBuffer: GPUBuffer | null = null
  private vertexBufferBytes = 0
  private indexBuffer: GPUBuffer | null = null
  private indexBufferBytes = 0

  private shadowTexture: GPUTexture | null = null
  /** Stable identity for cache keys: GPUTexture has no intrinsic id, and
   * every texture falling back to the same key made the bind-group cache
   * return the FIRST model's atlas forever ("vertices update, texture
   * doesn't" on model switch). */
  private textureIds = new WeakMap<GPUTexture, number>()
  private nextTextureId = 1

  /** Per-frame write cursor into the vertex/index buffers, in vertices /
   * indices. WebGPU defers ALL queue work to submit time — unlike GL, a
   * later upload to the same offset overwrites what an earlier recorded
   * draw will read. Every draw therefore gets its own non-overlapping
   * region and targets it via drawIndexed's firstIndex/baseVertex. Reset
   * in beginFrame. */
  private writeCursor = 0
  private indexWriteCursor = 0

  /** Buffers replaced by a mid-frame capacity growth. A recorded command
   * buffer may still reference the old one (WebGPU checks liveness at SUBMIT
   * time, not record time), so they are destroyed only after the next
   * submission. */
  private pendingDestroy: GPUBuffer[] = []

  /** Open pass owned by the frame-level entry points (the frame loop). */
  private framePass: GPURenderPassEncoder | null = null
  private frameEncoder: GPUCommandEncoder | null = null

  private clear: [number, number, number, number] = [0, 0, 0, 0]
  private width: number
  private height: number
  camera?: CameraConfig

  constructor(canvas: HTMLCanvasElement, device: GPUDevice, options: WebGPURendererOptions = {}) {
    super(options)
    this.device = device
    this.canvas = canvas
    rendererByCanvas.set(canvas, this)
    // Camera math works in LOGICAL pixels; the drawing buffer may be dpr×
    // larger (the dom bridge sizes canvas.width = logical * dpr).
    this.width = options.logicalWidth ?? canvas.width
    this.height = options.logicalHeight ?? canvas.height
    this.format = (navigator as unknown as { gpu: { getPreferredCanvasFormat(): GPUTextureFormat } }).gpu.getPreferredCanvasFormat()
    const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null
    if (!ctx) throw new Error('WebGPU: canvas.getContext("webgpu") returned null')
    this.context = ctx
    // COPY_SRC is required to read the frame back (see note 1 in the class doc).
    ctx.configure({
      device,
      format: this.format,
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    })

    this.uniformData = new Float32Array(FRAME_LAYOUT.byteLength / 4)
    this.uniforms = device.createBuffer({
      size: FRAME_LAYOUT.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.uniformDataSkip = new Float32Array(FRAME_LAYOUT.byteLength / 4)
    this.uniformsSkipTonemap = device.createBuffer({
      size: FRAME_LAYOUT.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    if (options.clearColor) this.clear = parseColor(options.clearColor)
    this.camera = options.camera
    // Mirror the GL renderer: camera-derived matrices are computed from the
    // shared computeCameraMatrix ONCE here (and on setCamera/resize) —
    // beginFrame must not overwrite a projection set externally via
    // setProjectionMatrix.
    this.applyCameraProjection()
  }

  /** Reactive camera updates (the dom bridge's camera watch calls this).
   * A new config object defeats Object.is and recomputes the matrices. */
  setCamera(camera: CameraConfig): void {
    this.camera = camera
    this.applyCameraProjection()
  }

  /** Same camera math as the WebGL renderer (computeCameraMatrix), so both
   * backends fit/pan/zoom identically — including the NDC-centering ortho
   * and the y-flip (an ad-hoc ortho here rendered the character upside
   * down and mis-fitted). */
  private applyCameraProjection() {
    const { projection, view } = computeCameraMatrix(this.camera, this.width, this.height)
    this.setProjectionMatrix(projection)
    this.setViewMatrix(view)
  }

  protected get mergedGrouping(): boolean {
    return true
  }

  /**
   * Upload an atlas page.
   *
   * Mirrors the GL helper's semantics (nearest filtering by default, cached by
   * the caller). The `__filter` marker is read by `samplerFor` — WebGPU keeps
   * filtering in the sampler, GL in texParameteri, and the difference is a real
   * rendering difference, not a naming one.
   */
  createTexture(source: HTMLImageElement | HTMLCanvasElement | ImageBitmap, options?: { minFilter?: number; magFilter?: number; wrapS?: number; wrapT?: number }): GPUTexture {
    // The GL helper sizes the texture from the source; WebGPU needs it up front.
    const width = (source as HTMLImageElement).naturalWidth ?? (source as HTMLCanvasElement).width
    const height = (source as HTMLImageElement).naturalHeight ?? (source as HTMLCanvasElement).height
    if (!width || !height) throw new Error('WebGPU createTexture: source has no size')
    const texture = this.device.createTexture({
      size: { width, height },
      format: 'rgba8unorm',
      // COPY_SRC: readbacks and debug probes copy texture contents out; a
      // texture without it makes the copy a validation error that poisons
      // the whole command buffer.
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    this.device.queue.copyExternalImageToTexture({ source }, { texture }, { width, height })
    // GL's default mag/min filter is NEAREST in this engine's helper (0x2600),
    // so mirror that rather than WebGPU's linear default.
    const nearest = options?.magFilter === undefined || options.magFilter === 0x2600
    ;(texture as unknown as { __filter: 'nearest' | 'linear' }).__filter = nearest ? 'nearest' : 'linear'
    return texture
  }

  deleteTexture(texture: GPUTexture): void {
    texture.destroy()
  }

  // -- backend contract ------------------------------------------------------

  /** Allocate GPU vertex storage to hold cursor + count vertices
   * (interleaved stream). Also the base's capacity hook — the base calls it
   * with the staging capacity, which only ever over-allocates. */
  protected ensureBufferCapacity(totalVertices: number): void {
    const bytes = (this.writeCursor + totalVertices) * STRIDE
    if (this.vertexBuffer && this.vertexBufferBytes >= bytes) return
    const cap = Math.max(bytes, Math.ceil(this.vertexBufferBytes * 1.5))
    if (this.vertexBuffer) this.pendingDestroy.push(this.vertexBuffer)
    this.vertexBuffer = this.device.createBuffer({
      size: cap,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    this.vertexBufferBytes = cap
  }

  /** The GPU index buffer follows the base's indexCapacity watermark AND
   * this file's per-frame index cursor. */
  protected growIndexBuffer(indexCapacity: number): void {
    const needed = Math.max(indexCapacity, this.indexWriteCursor)
    const bytes = Math.max(1, needed) * 4
    if (this.indexBuffer && this.indexBufferBytes >= bytes) return
    const cap = Math.max(bytes, Math.ceil(this.indexBufferBytes * 1.5))
    if (this.indexBuffer) this.pendingDestroy.push(this.indexBuffer)
    this.indexBuffer = this.device.createBuffer({
      size: cap,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })
    this.indexBufferBytes = cap
  }

  /** Destroy buffers replaced since the last submission. Call after every
   * queue.submit of command encoders that may reference them. */
  private flushPendingDestroys(): void {
    for (const b of this.pendingDestroy) b.destroy()
    this.pendingDestroy.length = 0
  }

  // -- draws (called by the base's flush → flushMerged) -----------------------

  /** Draw a run of consecutive fast-lane markers as one indexed draw: their
   * staging ranges are contiguous by construction (beginMesh reserves from a
   * monotonic watermark), so one upload covers the merged range. */
  protected drawSealedRun(items: BatchItem[], start: number, end: number): void {
    const first = items[start].sealed!
    const last = items[end - 1].sealed!
    const vBase = first.vBase
    const vCount = last.vBase + last.vCount - vBase
    const iBase = first.iBase
    const iCount = last.iBase + last.iCount - iBase

    const textures = [first.textures[0]] as (GPUTexture | null)[]
    const b = BLEND[first.blendMode]

    const { firstIndex, baseVertex } = this.uploadStaging(vBase, vCount, iBase, iCount)
    this.pass().setPipeline(this.pipeline(b, first.premultiplied, false))
    this.pass().setBindGroup(0, this.bindGroup(textures, first.skipTonemap))
    this.pass().setVertexBuffer(0, this.vertexBuffer!)
    this.pass().setIndexBuffer(this.indexBuffer!, 'uint32')
    this.pass().drawIndexed(iCount, 1, firstIndex, baseVertex)
  }

  protected drawGroup(items: BatchItem[], textures: (TextureHandle | null)[]): void {
    // The transform math lives in the base: it fills the shared SoA scratch,
    // and this file only interleaves + uploads + draws.
    const s = this.transformGroup(items, textures, true)

    const b = BLEND[items[0]?.blendMode ?? 'normal']
    const premultiplied = items.some((it) => it.premultiplied === true)
    // GL sets u_skipTonemap per group (items.every); mirror that.
    const skipTonemap = items.every((it) => it.skipTonemap === true)

    const { firstIndex, baseVertex } = this.uploadStreams(s)
    this.pass().setPipeline(this.pipeline(b, premultiplied, s.hasNormals))
    this.pass().setBindGroup(0, this.bindGroup(textures as (GPUTexture | null)[], skipTonemap))
    this.pass().setVertexBuffer(0, this.vertexBuffer!)
    this.pass().setIndexBuffer(this.indexBuffer!, 'uint32')
    // Indexed groups draw their joined index list; the fallback (index-
    // expanded) path draws the trivial 0..n-1 list uploadStreams generated —
    // GL mirrors this with drawArrays(totalVertices). Using totalIndices
    // here drew NOTHING for non-indexed groups (totalIndices is 0 there).
    const count = s.allIndexed ? s.totalIndices : s.totalVertices
    this.pass().drawIndexed(count, 1, firstIndex, baseVertex)
  }

  // -- frame hooks (Renderer frame loop) --------------------------------------

  /** open the command buffer + single clear render pass; draws record into it */
  protected beginFrame(): void {
    this.writeFrameUniforms()
    // All data written last frame has been consumed (submit happened in
    // endFrame); restart the per-frame buffer cursors.
    this.writeCursor = 0
    this.indexWriteCursor = 0
    const encoder = this.device.createCommandEncoder({})
    this.framePass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: this.clear[0], g: this.clear[1], b: this.clear[2], a: this.clear[3] },
        },
      ],
    })
    this.frameEncoder = encoder
  }

  protected drawWorld(): void {
    // No shadow pass yet (docs/GPU-BACKEND-DESIGN.md §4); the batch holds
    // every layer. Overlay layers are drawn after the world in the same pass.
    if (this.getBatchItems().length > 0) this.flush()
    // reset the frame queues for the next pass within this frame
    // (base flush already reset its watermarks)
  }

  protected drawOverlay(): void {
    // Overlay layers would flush here with their own camera; none yet.
  }

  protected endFrame(): void {
    if (this.framePass) {
      this.framePass.end()
      this.framePass = null
    }
    if (this.frameEncoder) {
      this.device.queue.submit([this.frameEncoder.finish()])
      this.frameEncoder = null
    }
    this.submitLoosePasses()
    this.flushPendingDestroys()
  }

  /** Logical-size update from the dom bridge (which has already resized the
   *  canvas drawing buffer to logical × dpr). Does NOT touch canvas.width —
   *  doing so would drop the DPR sharpness. */
  resize(width: number, height: number) {
    this.width = width
    this.height = height
    this.applyCameraProjection()
    this.markDirty()
  }

  // -- scene state ------------------------------------------------------------

  getCurrentTransform(): TransformState {
    return this.transforms.snapshot()
  }

  pushTransform(transform: Partial<TransformState> | TransformInput): void {
    this.transforms.push(transform)
  }

  popTransform(): void {
    this.transforms.pop()
  }

  getViewMatrix(): Mat4x4f {
    return this.viewMatrix
  }

  /** readback entry for the equivalence gate (see the base class doc).
   *  Runs the FULL frame loop (scene traversal included) inside the readback
   *  command buffer — a canvas texture cannot be read after present. */
  async flushAndRead(filterLayer?: number): Promise<Uint8ClampedArray> {
    this.needsFullRedraw = true
    this.beginFrame()
    const encoder = this.frameEncoder!
    const pass = this.framePass!
    try {
      // scene traversal → submissions
      for (const root of this.children) root.draw()
      if (this.getBatchItems().length === 0) throw new Error('flushAndRead: scene produced no items')
      this.flush(filterLayer)
    } finally {
      this.framePass = null
      this.frameEncoder = null
    }
    pass.end()

    const width = this.canvas.width
    const height = this.canvas.height
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256
    const readback = this.device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })
    encoder.copyTextureToBuffer(
      { texture: this.context.getCurrentTexture() },
      { buffer: readback, bytesPerRow, rowsPerImage: height },
      { width, height }
    )
    this.device.pushErrorScope('validation')
    this.device.queue.submit([encoder.finish()])
    const validationError = this.device.popErrorScope()
    validationError.then((err) => {
      if (err) console.error('[webgpu validation]', err.message)
      ;(window as unknown as { __gpuValidationError?: string }).__gpuValidationError = err?.message
    })
    this.flushPendingDestroys()

    const mapped = readback as unknown as {
      mapAsync(mode: number): Promise<void>
      getMappedRange(): ArrayBuffer
      unmap(): void
    }
    await mapped.mapAsync(1)
    const src = new Uint8Array(mapped.getMappedRange())
    const out = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      const rs = y * bytesPerRow
      for (let x = 0; x < width; x++) {
        const s = rs + x * 4
        const d = y * width * 4 + x * 4
        if (this.format === 'bgra8unorm') {
          out[d] = src[s + 2]
          out[d + 1] = src[s + 1]
          out[d + 2] = src[s]
          out[d + 3] = src[s + 3]
        } else {
          out[d] = src[s]
          out[d + 1] = src[s + 1]
          out[d + 2] = src[s + 2]
          out[d + 3] = src[s + 3]
        }
      }
    }
    mapped.unmap()
    readback.destroy()
    return out
  }

  setShadowMap(texture: GPUTexture | null, matrix: Mat4x4f | null): void {
    super.setShadowMap(texture, matrix)
    this.shadowTexture = texture
    if (matrix) this.uniformData.set(matrix.source, FRAME_LAYOUT.shadowMatrix / 4)
  }

  destroy() {
    this.pointerHandlers.clear()
    if (this.cancelScheduled !== null) {
      this.cancelScheduled()
      this.cancelScheduled = null
    }
    if (this.cancelContinuous !== null) {
      this.cancelContinuous()
      this.cancelContinuous = null
    }
    this.children.length = 0
    this.transforms.reset()
    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()
    this.uniforms.destroy()
    this.uniformsSkipTonemap.destroy()
    this.pipelines.clear()
    this.bindGroups.clear()
    this.white?.destroy()
  }

  // -- internals -------------------------------------------------------------

  /** The pass draws record into: the frame owner's single pass when one is
   * open, otherwise a per-group load-op pass (bare flush() path). */
  private pass(): GPURenderPassEncoder {
    if (this.framePass) return this.framePass
    // Bare flush(): each group gets its own pass over the current frame
    // texture. Functionally correct, more passes than the frame-owner path.
    const encoder = this.device.createCommandEncoder({})
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: this.context.getCurrentTexture().createView(), loadOp: 'load', storeOp: 'store' },
      ],
    })
    this.loosePasses.push({ encoder, pass })
    return pass
  }
  private loosePasses: { encoder: GPUCommandEncoder; pass: GPURenderPassEncoder }[] = []

  /** Close and submit any per-group passes opened by a bare flush(). */
  protected submitLoosePasses(): void {
    for (const { encoder, pass } of this.loosePasses) {
      pass.end()
      this.device.queue.submit([encoder.finish()])
    }
    this.loosePasses.length = 0
    this.flushPendingDestroys()
  }

  private writeFrameUniforms() {
    const p = this.uniformData
    p.set(this.viewMatrix.source, FRAME_LAYOUT.view / 4)
    p.set(this.projectionMatrix.source, FRAME_LAYOUT.projection / 4)
    // Default directional light, matching the GL renderer's values exactly.
    p[FRAME_LAYOUT.lightDir / 4] = -0.906308
    p[FRAME_LAYOUT.lightDir / 4 + 1] = 0.323744
    p[FRAME_LAYOUT.lightDir / 4 + 2] = -0.271654
    p[FRAME_LAYOUT.ambient / 4] = 0.66
    p[FRAME_LAYOUT.ambient / 4 + 1] = 0.7
    p[FRAME_LAYOUT.ambient / 4 + 2] = 0.76
    p[FRAME_LAYOUT.useTexture / 4] = 1
    p[FRAME_LAYOUT.useLighting / 4] = 0
    p[FRAME_LAYOUT.useShadow / 4] = this.shadowTexture ? 1 : 0
    p[FRAME_LAYOUT.skipTonemap / 4] = 0
    this.device.queue.writeBuffer(this.uniforms, 0, p.buffer)
    // The skip-variant shares every field except skipTonemap=1 (GL sets
    // u_skipTonemap per draw; here the bind group picks the buffer).
    const q = this.uniformDataSkip
    q.set(p)
    q[FRAME_LAYOUT.skipTonemap / 4] = 1
    this.device.queue.writeBuffer(this.uniformsSkipTonemap, 0, q.buffer)
  }

  /** Seal-path upload: the staging already holds world-space data (packed
   * RGBA8 colors). Interleave the reserved range into the vertex stream at
   * the frame cursor and upload the run's absolute (vBase-offseted) index
   * range at the index cursor; the draw targets both via firstIndex and
   * baseVertex = cursor - vBase. Fast-lane producers never stage texIndices
   * (the staging slot may hold stale legacy values) — always write 0. */
  private uploadStaging(vBase: number, vCount: number, iBase: number, iCount: number): DrawRange {
    const st = this.getStaging()
    this.ensureBufferCapacity(vCount)
    const base = this.writeCursor
    this.writeCursor += vCount
    const scratch = new Float32Array(vCount * FLOATS_PER_VERTEX)
    const pos = st.positions!
    const col = st.packedColors!
    const uv = st.uvs!
    for (let v = 0; v < vCount; v++) {
      const o = v * FLOATS_PER_VERTEX
      const s = vBase + v
      scratch[o] = pos[s * 3]
      scratch[o + 1] = pos[s * 3 + 1]
      scratch[o + 2] = pos[s * 3 + 2]
      scratch[o + 3] = col[s * 4] / 255
      scratch[o + 4] = col[s * 4 + 1] / 255
      scratch[o + 5] = col[s * 4 + 2] / 255
      scratch[o + 6] = col[s * 4 + 3] / 255
      scratch[o + 7] = uv[s * 2]
      scratch[o + 8] = uv[s * 2 + 1]
      // normals stay 0: fast-lane producers don't carry them
      // texIndex stays 0: single-texture lane, see the class doc
    }
    this.device.queue.writeBuffer(this.vertexBuffer!, base * STRIDE, scratch.buffer as ArrayBuffer)

    const indices = st.indices!
    const firstIndex = this.indexWriteCursor
    this.indexWriteCursor += iCount
    this.growIndexBuffer(this.indexWriteCursor)
    this.device.queue.writeBuffer(this.indexBuffer!, firstIndex * 4, indices.buffer as ArrayBuffer, iBase * 4, iCount * 4)
    return { firstIndex, baseVertex: base - vBase }
  }

  /** Legacy-path upload: interleave the base's transformGroup streams at the
   * frame cursor; rebase the group's (group-relative) indices onto that
   * cursor so the draw survives every later upload in the same submission. */
  private uploadStreams(s: GroupStreams): DrawRange {
    const vCount = s.totalVertices
    this.ensureBufferCapacity(vCount)
    const base = this.writeCursor
    this.writeCursor += vCount
    const scratch = new Float32Array(vCount * FLOATS_PER_VERTEX)
    const packed = s.allPackedColor
    for (let v = 0; v < vCount; v++) {
      const o = v * FLOATS_PER_VERTEX
      scratch[o] = s.positions[v * 3]
      scratch[o + 1] = s.positions[v * 3 + 1]
      scratch[o + 2] = s.positions[v * 3 + 2]
      if (packed) {
        scratch[o + 3] = s.packedColors[v * 4] / 255
        scratch[o + 4] = s.packedColors[v * 4 + 1] / 255
        scratch[o + 5] = s.packedColors[v * 4 + 2] / 255
        scratch[o + 6] = s.packedColors[v * 4 + 3] / 255
      } else {
        scratch[o + 3] = s.colors[v * 4]
        scratch[o + 4] = s.colors[v * 4 + 1]
        scratch[o + 5] = s.colors[v * 4 + 2]
        scratch[o + 6] = s.colors[v * 4 + 3]
      }
      scratch[o + 7] = s.uvs[v * 2]
      scratch[o + 8] = s.uvs[v * 2 + 1]
      scratch[o + 9] = s.normals[v * 3]
      scratch[o + 10] = s.normals[v * 3 + 1]
      scratch[o + 11] = s.normals[v * 3 + 2]
      scratch[o + 12] = s.texIndices[v]
    }
    this.device.queue.writeBuffer(this.vertexBuffer!, base * STRIDE, scratch.buffer as ArrayBuffer)

    // Index list: the base joined per-item index lists (allIndexed, values
    // relative to the group start) — rebase them onto `base`. Non-indexed
    // groups get the trivial sequential list at the cursor.
    const indexCount = s.allIndexed ? s.totalIndices : vCount
    const firstIndex = this.indexWriteCursor
    this.indexWriteCursor += indexCount
    this.growIndexBuffer(this.indexWriteCursor)
    if (s.allIndexed) {
      const rebased = new Uint32Array(indexCount)
      for (let i = 0; i < indexCount; i++) rebased[i] = s.indices[i] + base
      this.device.queue.writeBuffer(this.indexBuffer!, firstIndex * 4, rebased.buffer as ArrayBuffer)
    } else {
      const trivial = new Uint32Array(indexCount)
      for (let i = 0; i < indexCount; i++) trivial[i] = base + i
      this.device.queue.writeBuffer(this.indexBuffer!, firstIndex * 4, trivial.buffer as ArrayBuffer)
    }
    return { firstIndex, baseVertex: base }
  }

  /**
   * The pipeline's bind group layout.
   *
   * This must be the SAME object used by `bindGroup()`. Creating the pipeline
   * with `layout: 'auto'` while the group uses a hand-built layout makes WebGPU
   * reject the draw with "created with a default layout, and is not compatible
   * with the BindGroup set at group index 0" — and the command buffer is
   * dropped, leaving the canvas at whatever the previous frame drew.
   */
  private getLayout(): GPUBindGroupLayout {
    if (!this.layout) {
      this.layout = this.device.createBindGroupLayout({
        entries: [
          {
            binding: ENGINE_BINDINGS.uniforms,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
          ...ENGINE_TEXTURE_BINDINGS.map((binding) => ({
            binding,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' as const },
          })),
          { binding: ENGINE_BINDINGS.sampler, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          {
            binding: ENGINE_BINDINGS.shadowMap,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' as const },
          },
        ],
      })
    }
    return this.layout
  }

  private pipeline(
    b: { src: GPUBlendFactor; dst: GPUBlendFactor; srcA: GPUBlendFactor; dstA: GPUBlendFactor },
    premultiplied: boolean,
    hasNormals: boolean
  ): GPURenderPipeline {
    const src = premultiplied ? 'one' : b.src
    const key = `${src}|${b.dst}|${b.srcA}|${b.dstA}|${hasNormals}`
    let p = this.pipelines.get(key)
    if (!p) {
      p = this.device.createRenderPipeline({
        // A GPUBindGroupLayout cannot be handed to the pipeline directly: it must
        // be wrapped in a GPUPipelineLayout, which is what declares the group
        // indices the bind groups bind at.
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.getLayout()] }),
        vertex: {
          module: this.device.createShaderModule({ code: DEFAULT_VERTEX_WGSL }),
          entryPoint: 'vs_main',
          buffers: [
            {
              arrayStride: STRIDE,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' },
                { shaderLocation: 1, offset: 12, format: 'float32x4' },
                { shaderLocation: 2, offset: 28, format: 'float32x2' },
                { shaderLocation: 3, offset: 36, format: 'float32x3' },
                { shaderLocation: 4, offset: 48, format: 'float32' },
              ],
            },
          ],
        },
        fragment: {
          module: this.device.createShaderModule({ code: DEFAULT_FRAGMENT_WGSL }),
          entryPoint: 'fs_main',
          targets: [
            {
              format: this.format,
              blend: {
                color: { srcFactor: src, dstFactor: b.dst, operation: 'add' },
                alpha: { srcFactor: b.srcA, dstFactor: b.dstA, operation: 'add' },
              },
            },
          ],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
      })
      this.pipelines.set(key, p)
    }
    return p
  }

  private samplerFor(textures: (GPUTexture | null)[]): GPUSampler {
    // Filtering follows the first bound texture: WebGL takes it from
    // texParameteri at bind time, and a device that silently always samples
    // linearly blurs nearest-filtered atlases (that cost 31% of pixels on the
    // equivalence scene while corners matched exactly).
    const filter = (textures[0] as unknown as { __filter?: 'nearest' | 'linear' })?.__filter ?? 'nearest'
    let s = this.samplers.get(filter)
    if (!s) {
      const mode: GPUFilterMode = filter === 'nearest' ? 'nearest' : 'linear'
      s = this.device.createSampler({ magFilter: mode, minFilter: mode })
      this.samplers.set(filter, s)
    }
    return s
  }

  private textureId(t: GPUTexture | null): number {
    if (!t) return 0
    let id = this.textureIds.get(t)
    if (id === undefined) {
      id = this.nextTextureId++
      this.textureIds.set(t, id)
    }
    return id
  }

  private bindGroup(textures: (GPUTexture | null)[], skipTonemap: boolean): GPUBindGroup {
    const key = textures.map((t) => this.textureId(t)).join(',') + (skipTonemap ? '|s' : '')
    let g = this.bindGroups.get(key)
    if (!g) {
      const list: GPUTexture[] = []
      for (let i = 0; i < MAX_TEXTURES_PER_DRAW; i++) list.push(textures[i] ?? this.whiteTexture())
      const layout = this.getLayout()
      g = this.device.createBindGroup({
        layout,
        entries: [
          { binding: ENGINE_BINDINGS.uniforms, resource: { buffer: skipTonemap ? this.uniformsSkipTonemap : this.uniforms } },
          ...ENGINE_TEXTURE_BINDINGS.map((binding, i) => ({
            binding,
            resource: list[i].createView(),
          })),
          { binding: ENGINE_BINDINGS.sampler, resource: this.samplerFor(textures) },
          { binding: ENGINE_BINDINGS.shadowMap, resource: (this.shadowTexture ?? this.whiteTexture()).createView() },
        ],
      })
      this.bindGroups.set(key, g)
    }
    return g
  }

  private whiteTexture(): GPUTexture {
    if (!this.white) {
      this.white = this.device.createTexture({
        size: { width: 1, height: 1 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      })
      // Opaque white, written through a staging buffer whose usage includes
      // COPY_SRC (the queue's writeBuffer requires COPY_DST on the target).
      const staging = this.device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      })
      new Uint8Array(staging.getMappedRange()).set([255, 255, 255, 255])
      staging.unmap()
      const enc = this.device.createCommandEncoder({})
      enc.copyBufferToTexture({ buffer: staging }, { texture: this.white }, { width: 1, height: 1 })
      this.device.queue.submit([enc.finish()])
      staging.destroy()
    }
    return this.white
  }
}

export interface WebGPURendererOptions {
  clearColor?: string
  continuousRender?: boolean
  camera?: CameraConfig
  /** Logical (CSS) size — the camera math uses it, while the canvas drawing
   *  buffer may be larger by the device pixel ratio (the dom bridge sets
   *  canvas.width = logical * dpr). Defaults to the canvas buffer size. */
  logicalWidth?: number
  logicalHeight?: number
  schedule?: (cb: () => void) => () => void
}

/**
 * Async factory: `requestDevice` is awaited here so the caller gets a ready
 * root. The dom bridge's mount is synchronous, which is why the device is
 * created before the canvas mounts rather than inside it.
 */
export async function createWebGPURoot(
  canvas: HTMLCanvasElement,
  options: WebGPURendererOptions = {}
): Promise<WebGPURenderer> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(o?: unknown): Promise<{ requestDevice(d?: unknown): Promise<GPUDevice> } | null> } }).gpu
  if (!gpu) throw new Error('WebGPU unavailable: navigator.gpu is missing')
  const adapter = await gpu.requestAdapter()
  if (!adapter) throw new Error('WebGPU: requestAdapter() returned null')
  const device = await adapter.requestDevice()
  return new WebGPURenderer(canvas, device, options)
}
