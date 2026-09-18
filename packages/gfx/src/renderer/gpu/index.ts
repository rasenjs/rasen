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
import { isCompressedTextureSource, type CompressedTextureSource } from '../../utils'
import { Renderer, MAX_TEXTURES_PER_DRAW, type BatchItem, type BlendMode, type GroupStreams, type TextureHandle } from '../base'
import type { TransformState, TransformInput } from '../../transform-stack'
import type { GpuCanvasContext } from '../../node'
import {
  DEFAULT_FRAGMENT_WGSL,
  DEFAULT_VERTEX_WGSL,
  ENGINE_BINDINGS,
  ENGINE_TEXTURE_BINDINGS,
  FRAME_LAYOUT,
} from './shaders'

/** position(3) + color(4) + uv(2) + normal(3) + texIndex(1) floats per vertex. */
/**
 * Per-attribute strides (bytes). The vertex stream is SPLIT into one buffer
 * per attribute, exactly like the GL backend's separated attributes — that is
 * what lets a staging slice upload with NO per-vertex conversion.
 *
 * The previous single interleaved buffer cost 2.7 ms/frame of pure JS
 * (SoA→AOS: 9 scalar writes + 4 divisions per vertex) plus 1.4 ms/frame of
 * upload, and moved 36 B/vertex; the split stream moves 24 B/vertex and
 * copies straight from the staging arrays.
 *
 * Colors are RGBA8 (`unorm8x4`) whenever the group opted into the packed
 * stream — same 4 B/vertex the GL path uploads — and only float-color groups
 * pay 16 B.
 */
const POS_STRIDE = 12
const COL_PACKED_STRIDE = 4
const COL_FLOAT_STRIDE = 16
const UV_STRIDE = 8
const NORMAL_STRIDE = 12
const TEXINDEX_STRIDE = 4

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

/** Context → renderer registry, mirroring the GL backend's `getRenderContext`.
 * One renderer per WebGPU context; hosts that need the instance back look it
 * up by the context they passed in. WeakMap: GC-friendly when a context is
 * dropped (the browser path implies its canvas goes with it). */
const rendererByContext = new WeakMap<GpuCanvasContext, WebGPURenderer>()

/**
 * A bitmap supplied as raw RGBA8 pixels rather than a platform bitmap object.
 *
 * This is the WebGPU-side analogue of the library's `BitmapSource = object`
 * policy: the backend accepts whatever bitmap the host can produce and picks
 * the upload path by shape at runtime. `copyExternalImageToTexture` only
 * accepts platform images, so a host with no DOM (and therefore no `ImageData`
 * or `ImageBitmap` class) hands its decoded bytes here and they go in through
 * `writeTexture` instead.
 *
 * Bytes are tightly packed, row-major, top-left origin, straight (not
 * premultiplied) alpha — i.e. `ImageData`'s layout, which is what a PNG
 * decoder produces.
 */
export interface RawPixelSource {
  readonly width: number
  readonly height: number
  readonly bytes: Uint8Array
}

/**
 * Structural test for {@link RawPixelSource}.
 *
 * Deliberately not `instanceof Uint8Array`: hosts that wrap their own buffer
 * objects would fail that check even though the bytes are addressable.
 */
export function isRawPixelSource(source: unknown): source is RawPixelSource {
  if (!source || typeof source !== 'object') return false
  const s = source as Partial<RawPixelSource>
  if (typeof s.width !== 'number' || typeof s.height !== 'number') return false
  const bytes = s.bytes as Uint8Array | undefined
  return !!bytes && typeof bytes === 'object' &&
    typeof (bytes as Uint8Array).byteLength === 'number'
}

/** Get the WebGPURenderer previously mounted on this context, if any. */
export function getWebGPURenderer(context: GpuCanvasContext): WebGPURenderer | null {
  return rendererByContext.get(context) ?? null
}

export class WebGPURenderer extends Renderer {
  get ctx(): unknown {
    // The backend context handle a child component may need — same value the
    // GL backend exposes (its context), so node.ctx means one thing per tree.
    return this.context
  }
  private device: GPUDevice
  /** The domlike canvas context this renderer draws into (see
   *  GpuCanvasContext) — injected, never derived from a canvas here. */
  private context: GpuCanvasContext
  private format: GPUTextureFormat
  /** Surface extent in PHYSICAL pixels — the readback size. Camera math uses
   *  the LOGICAL `width`/`height` fields declared above. */
  private widthPx: number
  private heightPx: number

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

  // GPU buffers, grown on demand via the base's capacity hooks. One buffer
  // per attribute (see the stride note above): uploads are staging slices.
  private posBuffer: GPUBuffer | null = null
  private colBufferPacked: GPUBuffer | null = null
  private colBufferFloat: GPUBuffer | null = null
  private uvBuffer: GPUBuffer | null = null
  private normalBuffer: GPUBuffer | null = null
  private texIndexBuffer: GPUBuffer | null = null
  /** All-zero texIndex stream, bound by producers that do not stage
   *  texIndices (the sealed fast lane). A dedicated zero buffer removes the
   *  GL-side "re-zero once after a multi-texture group" staleness dance. */
  private zeroTexIndexBuffer: GPUBuffer | null = null
  /** Capacity of every per-vertex buffer above, in BYTES (they all cover the
   *  same vertex count, so one watermark keeps them in step). */
  private vertexCapacityBytes = 0
  private indexBuffer: GPUBuffer | null = null
  private indexBufferBytes = 0

  private shadowTexture: GPUTexture | null = null
  /** Reused interleave + index-rebase scratch.
   *
   * Both were allocated per draw — `new Float32Array(vCount * 13)` for a spine
   * mesh is tens of thousands of floats every frame, which is sustained GC
   * pressure for no reason: the size is stable across a looping animation, so
   * one buffer per size class is enough.
   *
   * Sized EXACTLY rather than "at least": the upload passes `scratch.buffer`
   * whole, so an oversized scratch would upload trailing bytes that belong to
   * the previous draw. Exact-size reuse therefore allocates only when the mesh
   * size actually changes — which for a looping animation is never. */
  private indexScratch: Uint32Array | null = null
  /** Stable identity for cache keys: GPUTexture has no intrinsic id, and
   * every texture falling back to the same key made the bind-group cache
   * return the FIRST model's atlas forever ("vertices update, texture
   * doesn't" on model switch). */
  private textureIds = new WeakMap<GPUTexture, number>()
  /** The same dedup the GL helper performs (utils.ts caches per context +
   *  source + options). Without it every component instance re-created the
   *  atlas page and re-uploaded it: 200 NIKKE instances meant 200 × 2048²
   *  textures ≈ 3.2 GB VRAM and 200 full-atlas copies — that is what made
   *  instance creation take ~7 s and the steady frame 13 ms slower than GL. */
  private textureCache = new Map<object, Map<string, GPUTexture>>()
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

  constructor(
    context: GpuCanvasContext,
    device: GPUDevice,
    options: WebGPURendererOptions = {}
  ) {
    super(options)
    this.device = device
    this.context = context
    rendererByContext.set(context, this)

    // Camera math works in LOGICAL pixels; the surface is PHYSICAL — the
    // host reports its drawing buffer in `canvas.width/height`, exactly the
    // physical values a browser <canvas> exposes (the dom bridge sizes
    // canvas.width = logical * dpr).
    this.widthPx = context.canvas.width
    this.heightPx = context.canvas.height
    this.width = options.logicalWidth ?? this.widthPx
    this.height = options.logicalHeight ?? this.heightPx

    // Only a browser can answer this; a host passes the format its surface was
    // created with (see GpuCanvasContext).
    this.format = options.format
      ?? (navigator as unknown as { gpu: { getPreferredCanvasFormat(): GPUTextureFormat } }).gpu.getPreferredCanvasFormat()
    // COPY_SRC is required to read the frame back (see note 1 in the class doc).
    context.configure({
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

  /**
   * Replace the clear colour.
   *
   * Symmetric with `setCamera`: `this.clear` is read when the frame's render
   * pass is encoded, so a host that lets the user pick a background can write it
   * between frames instead of rebuilding the renderer.
   */
  setClearColor(color: string): void {
    this.clear = parseColor(color)
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
  createTexture(source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | RawPixelSource | CompressedTextureSource, options?: { minFilter?: number; magFilter?: number; wrapS?: number; wrapT?: number }): GPUTexture {
    // Cache key = source (by reference) + sampling options, exactly like the
    // GL helper: one shared atlas must upload ONCE regardless of how many
    // components (or instances) ask for it.
    const optionKey = options
      ? `${options.wrapS ?? 'c'}|${options.wrapT ?? 'c'}|${options.minFilter ?? 'n'}|${options.magFilter ?? 'n'}`
      : 'default'
    let byOptions = this.textureCache.get(source as object)
    if (!byOptions) {
      byOptions = new Map<string, GPUTexture>()
      this.textureCache.set(source as object, byOptions)
    }
    const cachedTexture = byOptions.get(optionKey)
    if (cachedTexture) return cachedTexture

    // Compressed blocks: the bytes are already in GPU block format — upload
    // level by level at the format the host declares. No CPU decode ever.
    if (isCompressedTextureSource(source)) {
      if (!source.gpuFormat) throw new Error('WebGPU createTexture: compressed source needs gpuFormat')
      const texture = this.device.createTexture({
        size: { width: source.width, height: source.height },
        format: source.gpuFormat as GPUTextureFormat,
        mipLevelCount: source.levels.length,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
      })
      for (let level = 0; level < source.levels.length; level++) {
        const lw = Math.max(1, source.width >> level)
        const lh = Math.max(1, source.height >> level)
        this.device.queue.writeTexture(
          { texture, mipLevel: level },
          source.levels[level].data as unknown as GPUAllowSharedBufferSource,
          { bytesPerRow: source.levels[level].data.byteLength / Math.max(1, lh), rowsPerImage: lh },
          { width: lw, height: lh },
        )
      }
      ;(texture as unknown as { __filter: 'nearest' | 'linear' }).__filter = 'linear'
      byOptions.set(optionKey, texture)
      return texture
    }
    // Raw pixels carry their own size; platform bitmaps are measured.
    const raw = isRawPixelSource(source) ? source : null
    const width = raw ? raw.width
      : ((source as HTMLImageElement).naturalWidth ?? (source as HTMLCanvasElement).width)
    const height = raw ? raw.height
      : ((source as HTMLImageElement).naturalHeight ?? (source as HTMLCanvasElement).height)
    if (!width || !height) throw new Error('WebGPU createTexture: source has no size')
    const texture = this.device.createTexture({
      size: { width, height },
      format: 'rgba8unorm',
      // COPY_SRC: readbacks and debug probes copy texture contents out; a
      // texture without it makes the copy a validation error that poisons
      // the whole command buffer.
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    if (raw) {
      // `copyExternalImageToTexture` only accepts platform bitmaps, so bytes
      // go in through `writeTexture`. Same data, same format; this is the
      // branch that lets a DOM-less host upload a decoded PNG.
      this.device.queue.writeTexture(
        { texture },
        // The DOM lib types this parameter as GPUAllowSharedBufferSource, which
        // a plain Uint8Array satisfies structurally; the cast is the lib gap,
        // not a real mismatch.
        raw.bytes as unknown as GPUAllowSharedBufferSource,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width, height },
      )
    } else {
      // `raw` was null, so `source` is one of the platform bitmap types — TS
      // cannot narrow it back from the `raw` test, hence the cast.
      const bitmap = source as GPUCopyExternalImageSource
      this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, { width, height })
    }
    // GL's default mag/min filter is NEAREST in this engine's helper (0x2600),
    // so mirror that rather than WebGPU's linear default.
    const nearest = options?.magFilter === undefined || options.magFilter === 0x2600
    ;(texture as unknown as { __filter: 'nearest' | 'linear' }).__filter = nearest ? 'nearest' : 'linear'
    byOptions.set(optionKey, texture)
    return texture
  }

  deleteTexture(texture: GPUTexture): void {
    // Drop cache entries that point at the texture being destroyed, so a later
    // createTexture for the same source cannot hand back a destroyed handle.
    for (const [source, byOptions] of this.textureCache) {
      for (const [key, tex] of byOptions) {
        if (tex === texture) byOptions.delete(key)
      }
      if (byOptions.size === 0) this.textureCache.delete(source)
    }
    texture.destroy()
  }

  // -- backend contract ------------------------------------------------------

  /** Allocate the per-attribute vertex buffers to hold cursor + count
   * vertices. Also the base's capacity hook — the base calls it with the
   * staging capacity, which only ever over-allocates. */
  protected ensureBufferCapacity(totalVertices: number): void {
    const needBytes = (this.writeCursor + totalVertices) * POS_STRIDE
    if (this.posBuffer && this.vertexCapacityBytes >= needBytes) return
    const bytes = Math.max(needBytes, Math.ceil(this.vertexCapacityBytes * 1.5))
    const verts = Math.ceil(bytes / POS_STRIDE)
    const usage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    const alloc = (b: GPUBuffer | null, size: number): GPUBuffer => {
      if (b) this.pendingDestroy.push(b)
      return this.device.createBuffer({ size: Math.max(4, size), usage })
    }
    this.posBuffer = alloc(this.posBuffer, verts * POS_STRIDE)
    this.colBufferPacked = alloc(this.colBufferPacked, verts * COL_PACKED_STRIDE)
    this.colBufferFloat = alloc(this.colBufferFloat, verts * COL_FLOAT_STRIDE)
    this.uvBuffer = alloc(this.uvBuffer, verts * UV_STRIDE)
    this.normalBuffer = alloc(this.normalBuffer, verts * NORMAL_STRIDE)
    this.texIndexBuffer = alloc(this.texIndexBuffer, verts * TEXINDEX_STRIDE)
    // Freshly created GPU buffers read as zeros, and nothing ever writes this
    // one — so it stays a valid all-zero stream at any capacity.
    this.zeroTexIndexBuffer = alloc(this.zeroTexIndexBuffer, verts * TEXINDEX_STRIDE)
    this.vertexCapacityBytes = verts * POS_STRIDE
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

  /**
   * Bind this frame's per-attribute vertex streams for a draw.
   *
   * `packed` picks the RGBA8 color stream (unorm8x4, what the packed path
   * uploads) over the float one; `texIndices` false binds the shared all-zero
   * stream, which is what a single-texture fast-lane run needs — its
   * producers never stage texIndices. Every stream is grown together (one
   * capacity watermark) so all of them cover the draw's vertex range.
   */
  private bindVertexStreams(packed: boolean, texIndices: boolean): void {
    const p = this.pass()
    p.setVertexBuffer(0, this.posBuffer!)
    p.setVertexBuffer(1, packed ? this.colBufferPacked! : this.colBufferFloat!)
    p.setVertexBuffer(2, this.uvBuffer!)
    p.setVertexBuffer(3, this.normalBuffer!)
    p.setVertexBuffer(4, texIndices ? this.texIndexBuffer! : this.zeroTexIndexBuffer!)
  }

  /** Index-rebase scratch holding exactly `count` indices. */
  private scratchIndices(count: number): Uint32Array {
    if (!this.indexScratch || this.indexScratch.length !== count) {
      this.indexScratch = new Uint32Array(count)
    }
    return this.indexScratch
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
    this.pass().setPipeline(this.pipeline(b, first.premultiplied, false, true))
    this.pass().setBindGroup(0, this.bindGroup(textures, first.skipTonemap))
    this.bindVertexStreams(true, false)
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
    this.pass().setPipeline(this.pipeline(b, premultiplied, s.hasNormals, s.allPackedColor))
    this.pass().setBindGroup(0, this.bindGroup(textures as (GPUTexture | null)[], skipTonemap))
    this.bindVertexStreams(s.allPackedColor, true)
    this.pass().setIndexBuffer(this.indexBuffer!, 'uint32')
    // Indexed groups draw their joined index list; the fallback (index-
    // expanded) path draws the trivial 0..n-1 list uploadStreams generated —
    // GL mirrors this with drawArrays(totalVertices). Using totalIndices
    // here drew NOTHING for non-indexed groups (totalIndices is 0 there).
    const count = s.allIndexed ? s.totalIndices : s.totalVertices
    this.pass().drawIndexed(count, 1, firstIndex, baseVertex)
  }

  // -- frame hooks (Renderer frame loop) --------------------------------------

  /** This frame's surface texture. One call per frame — a host-owned
   *  swapchain is expected to rotate its image on each call, and calling it
   *  twice in a frame would hand out two different images. */
  private currentTexture(): GPUTexture {
    return this.context.getCurrentTexture()
  }

  /** The view draws render into. */
  private currentTextureView(): GPUTextureView {
    return this.currentTexture().createView()
  }

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
          view: this.currentTextureView(),
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
    // Presentation is deliberately NOT done here. A browser canvas context
    // presents implicitly; a host-owned swapchain presents on its own, once
    // the queue is submitted (see GpuCanvasContext). Keeping it out lets the
    // host choose, and keeps a host that reads the frame back from presenting
    // a torn image.
  }

  /** Logical-size update from the dom bridge (which has already resized the
   *  canvas drawing buffer to logical × dpr). Does NOT touch canvas.width —
   *  doing so would drop the DPR sharpness. */
  resize(width: number, height: number) {
    this.width = width
    this.height = height
    // Re-read the PHYSICAL size: the bridge resizes the drawing buffer before
    // calling this (`canvas.width = logical * dpr`), and `flushAndRead` sizes
    // its readback buffer from it. Caching the constructor-time value here
    // would make every readback after a resize copy the wrong rectangle.
    this.widthPx = this.context.canvas.width
    this.heightPx = this.context.canvas.height
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

    const width = this.widthPx
    const height = this.heightPx
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256
    const readback = this.device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })
    encoder.copyTextureToBuffer(
      { texture: this.currentTexture() },
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
    this.posBuffer?.destroy()
    this.colBufferPacked?.destroy()
    this.colBufferFloat?.destroy()
    this.uvBuffer?.destroy()
    this.normalBuffer?.destroy()
    this.texIndexBuffer?.destroy()
    this.zeroTexIndexBuffer?.destroy()
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
        { view: this.currentTextureView(), loadOp: 'load', storeOp: 'store' },
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
    // Straight staging slices — no per-vertex loop. writeBuffer copies the
    // bytes at call time, so the shared staging arrays can be rewritten by the
    // next producer without disturbing this upload.
    const q = this.device.queue
    const vEnd = vBase + vCount
    q.writeBuffer(this.posBuffer!, base * POS_STRIDE, st.positions!.subarray(vBase * 3, vEnd * 3) as unknown as GPUAllowSharedBufferSource)
    q.writeBuffer(
      this.colBufferPacked!,
      base * COL_PACKED_STRIDE,
      st.packedColors!.subarray(vBase * 4, vEnd * 4) as unknown as GPUAllowSharedBufferSource
    )
    q.writeBuffer(this.uvBuffer!, base * UV_STRIDE, st.uvs!.subarray(vBase * 2, vEnd * 2) as unknown as GPUAllowSharedBufferSource)
    // Normals are absent by contract (fast-lane producers carry none) and
    // texIndex is 0 for a single-texture run — both stay in the buffers'
    // zero-initialized state via the shared zero stream bound at draw time.

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
    const packed = s.allPackedColor
    const q = this.device.queue
    q.writeBuffer(this.posBuffer!, base * POS_STRIDE, s.positions.subarray(0, vCount * 3) as unknown as GPUAllowSharedBufferSource)
    if (packed) {
      q.writeBuffer(
        this.colBufferPacked!,
        base * COL_PACKED_STRIDE,
        s.packedColors.subarray(0, vCount * 4) as unknown as GPUAllowSharedBufferSource
      )
    } else {
      q.writeBuffer(this.colBufferFloat!, base * COL_FLOAT_STRIDE, s.colors.subarray(0, vCount * 4) as unknown as GPUAllowSharedBufferSource)
    }
    q.writeBuffer(this.uvBuffer!, base * UV_STRIDE, s.uvs.subarray(0, vCount * 2) as unknown as GPUAllowSharedBufferSource)
    if (s.hasNormals) {
      q.writeBuffer(this.normalBuffer!, base * NORMAL_STRIDE, s.normals.subarray(0, vCount * 3) as unknown as GPUAllowSharedBufferSource)
    }
    q.writeBuffer(this.texIndexBuffer!, base * TEXINDEX_STRIDE, s.texIndices.subarray(0, vCount) as unknown as GPUAllowSharedBufferSource)

    // Index list: the base joined per-item index lists (allIndexed, values
    // relative to the group start) — rebase them onto `base`. Non-indexed
    // groups get the trivial sequential list at the cursor.
    const indexCount = s.allIndexed ? s.totalIndices : vCount
    const firstIndex = this.indexWriteCursor
    this.indexWriteCursor += indexCount
    this.growIndexBuffer(this.indexWriteCursor)
    if (s.allIndexed) {
      const rebased = this.scratchIndices(indexCount)
      for (let i = 0; i < indexCount; i++) rebased[i] = s.indices[i] + base
      this.device.queue.writeBuffer(this.indexBuffer!, firstIndex * 4, rebased.buffer as ArrayBuffer)
    } else {
      const trivial = this.scratchIndices(indexCount)
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
    hasNormals: boolean,
    packedColor: boolean
  ): GPURenderPipeline {
    const src = premultiplied ? 'one' : b.src
    // The color stream's FORMAT is pipeline state in WebGPU (unlike GL's
    // per-VAO attribute pointer), so packed and float-color groups need
    // distinct pipelines — the same split the GL backend expresses with its
    // (normals, texture, packedColor) VAO variants.
    const key = `${src}|${b.dst}|${b.srcA}|${b.dstA}|${hasNormals}|${packedColor}`
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
          // One buffer per attribute, each tightly packed (stride =
          // attribute size): the uploads are staging slices with no
          // interleaving pass. Order and shader locations match the WGSL in
          // shaders.ts; the entry index is the vertex-buffer SLOT that
          // bindVertexStreams fills.
          buffers: [
            {
              arrayStride: POS_STRIDE,
              attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
            },
            {
              arrayStride: packedColor ? COL_PACKED_STRIDE : COL_FLOAT_STRIDE,
              attributes: [
                {
                  shaderLocation: 1,
                  offset: 0,
                  format: packedColor ? 'unorm8x4' : 'float32x4',
                },
              ],
            },
            {
              arrayStride: UV_STRIDE,
              attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }],
            },
            {
              arrayStride: NORMAL_STRIDE,
              attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x3' }],
            },
            {
              arrayStride: TEXINDEX_STRIDE,
              attributes: [{ shaderLocation: 4, offset: 0, format: 'float32' }],
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
  /** Surface format to configure the context with.
   *
   *  Only a browser can ask for this (`navigator.gpu.getPreferredCanvasFormat()`),
   *  so a host — which created its surface, and therefore knows its format —
   *  states it here. Left unset, the browser answer is used. Note a host whose
   *  surface is `bgra8unorm-srgb` must still pass the non-sRGB
   *  `bgra8unorm`: the swapchain is configured non-sRGB in the browser too
   *  (an sRGB swapchain double-gammas, washing colours out). */
  format?: GPUTextureFormat
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
 * renderer. The dom bridge's mount is synchronous, which is why the device is
 * created before the canvas mounts rather than inside it.
 *
 * Browser-only by design: a host that has no `navigator.gpu` creates its own
 * device and calls the constructor directly with a {@link GpuCanvasContext}.
 */
export async function createWebGPURoot(
  context: GpuCanvasContext,
  options: WebGPURendererOptions = {}
): Promise<WebGPURenderer> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(o?: unknown): Promise<{ requestDevice(d?: unknown): Promise<GPUDevice> } | null> } }).gpu
  if (!gpu) throw new Error('WebGPU unavailable: navigator.gpu is missing')
  const adapter = await gpu.requestAdapter()
  if (!adapter) throw new Error('WebGPU: requestAdapter() returned null')
  const device = await adapter.requestDevice()
  return new WebGPURenderer(context, device, options)
}
