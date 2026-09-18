/**
 * Renderer — the abstract per-canvas engine, and the ONLY render concept.
 *
 * One Renderer owns everything a drawing surface needs:
 *
 *   - the batch: staging, grouping decisions and the transform loop
 *     (addShape / beginMesh / endMesh / flush), inherited by every backend
 *   - the frame loop: markDirty / requestRedraw → beginFrame → scene
 *     traversal → drawWorld → drawOverlay → endFrame
 *   - scene state: the group transform stack, camera, pointer handlers
 *
 * The subclasses fill in the graphics-API execution:
 *
 *   renderer/gl/index.ts  → WebGLRenderer
 *   renderer/gpu/index.ts → WebGPURenderer
 *
 * A tree's root GfxNode OWNS a Renderer (composition, not inheritance):
 * components see the node, the node forwards to the renderer.
 *
 * The sealed fast lane (beginMesh/endMesh) is documented at those methods.
 */

import { Mat4x4f, mat4x4f } from '@rasenjs/math'
import { rafSchedule } from '@rasenjs/core'
import type { Color } from '../types'
import type { BitmapSource, TextureOptions } from '../utils'
import { TransformStack } from '../transform-stack'
import type { TransformState, TransformInput } from '../transform-stack'
import type { GfxNode } from '../node'

/** 2D blend equation (affects how a draw is blended). Used for both 2D shapes
 *  and 2D-style meshes that emulate an additive/multiply/screen draw. */
export type BlendMode = 'normal' | 'additive' | 'multiply' | 'screen'

export type GlPointerEventType = 'click' | 'pointerdown'

/**
 * Pointer handler registered by scene components (e.g. the spine pick).
 * Receives canvas-local CSS coordinates. Returns true if the event was
 * consumed (stops bubbling to remaining handlers).
 */
export type GlPointerHandler = (type: GlPointerEventType, x: number, y: number) => boolean

/**
 * Opaque texture handle.
 *
 * WebGL hands out a `WebGLTexture`, WebGPU a `GPUTexture`. The batch layer
 * only ever passes handles back to the renderer that produced them, so it
 * does not need to know which — and must not pretend both APIs share a type.
 */
export type TextureHandle = any

/**
 * A sealed fast-lane mesh group (see beginMesh/endMesh). The component
 * writes world-space positions / packed colors / uvs / indices directly into
 * the shared staging arrays at [vBase..] / [iBase..]; the group is drawn
 * with a straight upload of those ranges — no per-vertex copy pass.
 */
export interface SealedMesh {
  vBase: number
  vCount: number
  iBase: number
  iCount: number
  textures: (TextureHandle | null)[]
  blendMode: BlendMode
  premultiplied: boolean
  skipTonemap: boolean
  /** Producer guarantee: this mesh did NOT write its uv / packed-color /
   *  index streams into the staging this frame, so the staging bytes at the
   *  mesh's range are identical to what was there last frame. The backend
   *  may then skip re-uploading those streams IF it knows the GPU buffer
   *  still holds that content (its own range/epoch bookkeeping decides).
   *  Positions are never covered — animated producers rewrite them every
   *  frame. Defaults to false (always upload) — a wrong `true` skips a
   *  needed upload and renders stale streams. */
  unchangedUv?: boolean
  unchangedColor?: boolean
  unchangedIndices?: boolean
}

export interface BatchItem {
  vertices: Float32Array
  color: Color
  transform: Mat4x4f
  uv?: Float32Array
  texture?: TextureHandle | null
  /** Optional per-vertex colors (RGB per vertex, overrides uniform color). */
  vertexColors?: Float32Array
  /** Optional per-vertex world-space normals (enables per-pixel lighting). */
  normals?: Float32Array
  /** Disable depth writing (e.g. skybox). Defaults to true. */
  depthWrite?: boolean
  /** Render layer (0 = main world, others = overlay passes). Default 0. */
  layer?: number
  /** Skip tonemapping (e.g. skybox keeps its original vivid colours). */
  skipTonemap?: boolean
  /** Use premultiplied-alpha blending (ONE, ONE_MINUS_SRC_ALPHA). Required
   *  for atlases exported with premultiplied alpha (pma:true). Default false
   *  uses straight-alpha blending (SRC_ALPHA, ONE_MINUS_SRC_ALPHA). */
  premultiplied?: boolean
  /** 2D blend equation (normal/additive/multiply/screen). Default normal. */
  blendMode?: BlendMode
  /** Optional triangle index list into `vertices` (3 entries per triangle).
   * When EVERY item in a group carries indices, the group draws indexed:
   * unique vertices are transformed and uploaded once instead of once per
   * triangle (~3× less CPU transform work and upload on shared-vertex
   * meshes). Backends that cannot draw indexed (and mixed groups) expand
   * indexed items through the index list inside the transform loop. */
  indices?: Uint16Array | number[]
  /** Hint that `transform` is a pure translation matrix (only source[12..14]
   * non-zero, all other diagonal=1 off-diagonal=0). The transform pass then
   * skips 9 multiplies per vertex and adds source[12..14] directly. */
  translationOnly?: boolean
  /** Opt-in RGBA8 packed color. Two forms accepted:
   *  - `Uint8Array` of length 4 * vertexCount (per-vertex RGBA8 stream)
   *  - a `{ r, g, b, a }` uniform color object — the batch renderer
   *    expands it once into the group's packed stream (avoids caller-side
   *    per-frame allocation for the common single-tint-per-shape case).
   * Mutually exclusive with `vertexColors`. When set, the group is uploaded
   * as normalized bytes (shader still sees vec4 [0,1]). */
  packedColor?: Uint8Array | Color
  /** Fast-lane sealed mesh (beginMesh/endMesh). When present, the item is a
   * group marker: the backend uploads the staging ranges directly and draws
   * indexed — no per-vertex transform/copy pass. */
  sealed?: SealedMesh
}

/** Max textures merged into one draw call (sampler array size in the
 *  fragment shaders). Validated by benchmark/gfx A/B E4. */
export const MAX_TEXTURES_PER_DRAW = 4

/** Item-level grouping key for the merged flush. Every component is an
 * item-level boolean so groups are flag-homogeneous — the some()/every()
 * derivations in a backend's drawGroup then reduce to the shared item value
 * and per-item output matches the legacy (texture, blend) grouping exactly.
 * Numeric bitfield (not a template string): flushMerged evaluates this per
 * item per flush — 60k+ string allocations/frame at 200 spine instances.
 *
 * Exported so every backend's flush groups items IDENTICALLY. Two copies of
 * this rule that drift apart would make the APIs emit different draw
 * groupings, and therefore different pixels. */
export function mergedGroupKey(it: BatchItem): number {
  const blend = it.blendMode === 'additive' ? 1 : it.blendMode === 'multiply' ? 2 : it.blendMode === 'screen' ? 3 : 0
  return blend
    | (it.texture ? 4 : 0)
    | (it.premultiplied === true ? 8 : 0)
    | (it.skipTonemap === true ? 16 : 0)
    | (it.depthWrite === false ? 32 : 0)
    | (it.normals && it.normals.length > 0 ? 64 : 0)
    | (it.sealed ? 128 : 0)
}


/** Object-form transform → matrix (Mat4x4f / raw arrays pass through). */
function toMatrixInput(transform: Mat4x4f | Float32Array | number[] | TransformInput): Mat4x4f {
  if (transform instanceof Mat4x4f) return transform
  if (transform instanceof Float32Array || Array.isArray(transform)) {
    return Mat4x4f.fromArray(transform)
  }
  return Mat4x4f.identity()
    .multiply(Mat4x4f.translate(transform.tx, transform.ty, transform.tz ?? 0))
    .multiply(Mat4x4f.rotateX(transform.rotationX ?? 0))
    .multiply(Mat4x4f.rotateY(transform.rotationY ?? 0))
    .multiply(Mat4x4f.rotateZ(transform.rotationZ ?? 0))
    .multiply(Mat4x4f.scale(transform.scaleX ?? 1, transform.scaleY ?? 1, transform.scaleZ ?? 1))
}

/**
 * The vertex streams a legacy group produces, in one build pass.
 *
 * A backend's drawGroup receives these streams and only uploads + draws them.
 * Keeping the build here means the transform math exists ONCE — a duplicated
 * loop in a second backend would drift and render differently per API.
 */
export interface GroupStreams {
  /** Dedicated scratch arrays; valid up to the *Count fields. */
  positions: Float32Array
  colors: Float32Array
  packedColors: Uint8Array
  uvs: Float32Array
  normals: Float32Array
  texIndices: Float32Array
  /** Combined index list (indexed path), undefined on the fallback path. */
  indices: Uint32Array
  totalVertices: number
  totalIndices: number
  /** Every item carries an index list AND the backend can draw indexed. */
  allIndexed: boolean
  hasNormals: boolean
  /** Every item uses the RGBA8 packed-color stream. */
  allPackedColor: boolean
  hasTexture: boolean
  /** Filled element counts (the upload reads up to these). */
  colorCount: number
  packedColorCount: number
  uvCount: number
  normalCount: number
}

export abstract class Renderer {
  private batchItems: BatchItem[] = []
  private maxBatchSize = 100000

  // --- shared CPU staging (the fast lane writes into these directly) --------
  private positionsArray: Float32Array | null = null
  private colorsArray: Float32Array | null = null
  /** Packed RGBA8 per-vertex color stream (opt-in via BatchItem.packedColor).
   *  The shader still sees vec4 [0,1] via the normalized upload. */
  private packedColorsArray: Uint8Array | null = null
  private uvsArray: Float32Array | null = null
  private normalsArray: Float32Array | null = null
  private currentCapacity = 0
  /** texIndex staging. Fast-lane producers never stage texIndices (single
   *  texture per run), so this holds stale values from legacy multi-texture
   *  groups — the sealed path must upload ZEROS over its range, not this. */
  protected texIndicesArray: Float32Array | null = null

  /** Legacy-group transform scratch — DEDICATED, never the shared fast-lane
   *  staging (see transformGroup). Grown lazily to the largest group. */
  private groupPositions: Float32Array | null = null
  private groupColors: Float32Array | null = null
  private groupPackedColors: Uint8Array | null = null
  private groupUvs: Float32Array | null = null
  private groupNormals: Float32Array | null = null
  private groupTexIndices: Float32Array | null = null

  /** Index-list scratch. SHARED between the legacy groups (transformGroup,
   *  grows WITHOUT copy — it rewrites the whole list) and the fast lane
   *  (beginMesh, grows WITH COPY — staged ranges must survive). */
  private indicesArray: Uint32Array | null = null
  private indexCapacity = 0

  protected viewMatrix: Mat4x4f
  protected projectionMatrix: Mat4x4f
  /** Set by the camera setters; backends use it to skip redundant uploads. */
  protected frameDirty = true

  /** Active shadow map (opaque handle + light view-projection). */
  private activeShadow: { map: TextureHandle; matrix: Mat4x4f } | null = null

  /** Recycled BatchItem objects (see addShape / flush). */
  private itemPool: BatchItem[] = []

  /** O(1) pending-vertex counter (a per-addShape O(n) reduce used to make the
   *  whole flush O(n²) in high-volume shape scenes). */
  private _pendingVertexCount = 0

  /** Recycled SealedMesh payloads (see endMesh / releaseItems). */
  private sealedPool: SealedMesh[] = []

  /** Reusable span view handed out by beginMesh (one per batch, mutated).
   *  The `unchanged*` fields are the producer's clean-stream declaration read
   *  by endMesh; beginMesh clears them so a span can never leak a previous
   *  mesh's declaration. */
  private meshSpan: {
    vBase: number; iBase: number; vCap: number; iCap: number
    pos: Float32Array; col: Uint8Array; uv: Float32Array; idx: Uint32Array
    unchangedUv?: boolean; unchangedColor?: boolean; unchangedIndices?: boolean
  } | null = null
  /** Staging vertices reserved this frame (legacy addShape items and fast
   *  lane reservations share one watermark so ranges never overlap). Reset
   *  to 0 by flush. */
  private vertexWatermark = 0
  private indexWatermark = 0

  /** Cached zero-filled texIndex scratch for the sealed path's re-zero upload
   *  (grown on demand; content stays zero forever). */
  private zeroTexIndicesScratch: Float32Array = new Float32Array(0)

  readonly parent = null
  readonly children: GfxNode[] = []
  /** Backend context handle (GL context / canvas). */
  abstract get ctx(): unknown

  protected readonly options: {
    clearColor: string
    continuousRender: boolean
    schedule?: (cb: () => void) => () => void
  }

  /** 解析后的帧调度器（构造期确定，不依赖全局探测时序） */
  protected readonly scheduleFrame: (cb: () => void) => () => void
  protected cancelScheduled: (() => void) | null = null
  protected cancelContinuous: (() => void) | null = null
  protected needsFullRedraw = true

  /** Group-hierarchy transform stack (shared implementation, see transform-stack.ts). */
  protected transforms = new TransformStack()
  /** Scene-registered pointer handlers (pure — fed by the host adapter). */
  protected pointerHandlers = new Set<GlPointerHandler>()

  constructor(options: { clearColor?: string; continuousRender?: boolean; schedule?: (cb: () => void) => () => void } = {}) {
    this.options = {
      clearColor: options.clearColor ?? '#000000',
      continuousRender: options.continuousRender ?? false,
      schedule: options.schedule,
    }
    this.projectionMatrix = Mat4x4f.identity()
    this.viewMatrix = Mat4x4f.identity()
    // 帧源：注入优先，否则用 core 的默认（rAF，无 rAF 时 setTimeout 兜底）。
    // 它保证返回可用帧源，所以连续渲染不需要再判断"有没有帧源"。
    this.scheduleFrame = options.schedule ?? rafSchedule()
    if (this.options.continuousRender) {
      const loop = () => {
        this.needsFullRedraw = true
        this.draw()
        this.cancelContinuous = this.scheduleFrame(loop)
      }
      this.cancelContinuous = this.scheduleFrame(loop)
    }
  }

  // --- frame loop -----------------------------------------------------------

  /** 标脏：调度一次重绘（v1 一律全量重绘） */
  markDirty() {
    this.needsFullRedraw = true
    this.scheduleDraw()
  }

  private scheduleDraw() {
    // Continuous mode redraws every frame — no need to schedule event-driven
    // redraws on top of that.
    if (this.options.continuousRender) return
    if (this.cancelScheduled !== null) return

    const cancel = this.scheduleFrame(() => {
      this.cancelScheduled = null
      this.draw()
    })
    // Wrap: external cancel must also reset the pending state, otherwise
    // subsequent markDirty calls would be dead-locked.
    this.cancelScheduled = () => {
      cancel()
      this.cancelScheduled = null
    }
  }

  /**
   * 宿主显式请求重绘 —— **同步执行**（如 dom <canvas> 改了绘图缓冲尺寸后调用：
   * 尺寸变了就得立刻按新尺寸画一帧，否则会看到一帧拉伸 / 空白）。
   *
   * 与 markDirty 的区别：1) 同步（markDirty 只排一次绘制）；
   * 2) 无视 continuousRender 模式（连续模式下 scheduleDraw 是 no-op，
   * 但宿主主动触发的重绘仍应执行）。canvas-2d 后端的同名方法语义与此一致。
   */
  requestRedraw() {
    if (this.cancelScheduled !== null) {
      this.cancelScheduled()
      this.cancelScheduled = null
    }
    this.needsFullRedraw = true
    this.draw()
  }

  /** The frame: begin → scene traversal (submissions) → world → overlay → end. */
  draw() {
    if (!this.needsFullRedraw) return
    this.needsFullRedraw = false
    this.beginFrame()
    // Pre-order traversal of the scene-tree roots. Group nodes push their
    // transform before recursing children and pop afterwards, so subtree
    // transforms compose naturally.
    for (const root of this.children) root.draw()
    this.drawWorld()
    this.drawOverlay()
    this.endFrame()
  }

  /** Prepare the drawing surface: viewport + clear (GL) / open the clear pass (WebGPU). */
  protected abstract beginFrame(): void
  /** Draw the main world (layer 0). GL additionally renders the shadow pass first. */
  protected abstract drawWorld(): void
  /** Composite the overlay layer (dual-camera passes), if one is configured. */
  protected abstract drawOverlay(): void
  /** Flush/submit the frame (WebGPU ends + submits the command buffer). */
  protected abstract endFrame(): void

  // --- scene state ----------------------------------------------------------

  /** Camera configuration (2D pan/zoom pair; backends may extend). */
  camera?: { x?: number; y?: number; zoom?: number }

  getCurrentTransform(): TransformState {
    return this.transforms.snapshot()
  }

  pushTransform(transform: Partial<TransformState> | TransformInput) {
    this.transforms.push(transform)
  }

  popTransform() {
    this.transforms.pop()
  }

  getViewMatrix(): Mat4x4f {
    return this.viewMatrix
  }

  addPointerHandler(handler: GlPointerHandler): () => void {
    this.pointerHandlers.add(handler)
    return () => this.pointerHandlers.delete(handler)
  }

  /** PUBLIC entry for host adapters: dispatch a pointer event (canvas-local
   *  CSS coordinates) to registered scene handlers. The renderer never sees
   *  native event objects — same contract as the canvas-2d dispatchPointer. */
  dispatchPointer(type: GlPointerEventType, x: number, y: number): void {
    for (const handler of this.pointerHandlers) {
      if (handler(type, x, y)) return
    }
  }

  /** GfxNode tree hooks (the root node registers itself here). */
  addRoot(node: GfxNode): void {
    this.children.push(node)
    this.markDirty()
  }

  removeRoot(node: GfxNode): void {
    const i = this.children.indexOf(node)
    if (i >= 0) this.children.splice(i, 1)
    this.markDirty()
  }

  // --- backend contract -----------------------------------------------------

  /** Whether this backend merges same-flag different-texture neighbours into
   *  one draw (needs a sampler array). WebGL2 yes, WebGL1 no, WebGPU yes. */
  protected abstract get mergedGrouping(): boolean

  /** Allocate GPU vertex storage for `totalVertices` (orphaning is fine). */
  protected abstract ensureBufferCapacity(totalVertices: number): void
  /** Grow the GPU-side index buffer to `indexCapacity` elements. */
  protected abstract growIndexBuffer(indexCapacity: number): void

  protected abstract drawGroup(items: BatchItem[], textures: (TextureHandle | null)[]): void
  protected abstract drawSealedRun(items: BatchItem[], start: number, end: number): void

  abstract createTexture(source: BitmapSource, options?: TextureOptions): TextureHandle
  abstract deleteTexture(texture: TextureHandle): void
  abstract destroy(): void

  // --- camera ---------------------------------------------------------------

  setViewMatrix(view: Mat4x4f) {
    this.viewMatrix = view
    this.frameDirty = true
  }

  setProjectionMatrix(projection: Mat4x4f) {
    this.projectionMatrix = projection
    this.frameDirty = true
  }

  /**
   * Expose the pending batch items (used by the shadow pass before flush).
   */
  getBatchItems(): BatchItem[] {
    return this.batchItems
  }

  /**
   * Enable/disable shadow mapping for the next draw.
   * @param shadowMap depth texture
   * @param shadowMatrix light view-projection matrix (maps world → light clip)
   */
  setShadowMap(shadowMap: TextureHandle | null, shadowMatrix: Mat4x4f | null) {
    this.activeShadow = shadowMap && shadowMatrix ? { map: shadowMap, matrix: shadowMatrix } : null
  }

  /** Shadow state accessor for backends (drawGroup/drawSealedRun apply it). */
  protected getShadow(): { map: TextureHandle; matrix: Mat4x4f } | null {
    return this.activeShadow
  }

  // --- submission -----------------------------------------------------------

  /** Component-facing form: addShape(batchKey, vertices, color, transform, ...)
   *  (batchKey is a debug tag, ignored) or the raw addShape(vertices, color,
   *  transform, ...) form. */
  addShape(
    batchKeyOrVertices: string | Float32Array,
    colorOrVertices?: Color | Float32Array,
    transformOrColor?: Mat4x4f | Float32Array | number[] | TransformInput | Color,
    uvOrTransform?: Float32Array | Mat4x4f | Float32Array | number[] | TransformInput,
    textureOrUv?: TextureHandle | null | Float32Array,
    vertexColorsOrTexture?: Float32Array | TextureHandle | null,
    depthWriteOrVertexColors?: boolean | Float32Array,
    normalsOrDepthWrite?: Float32Array | boolean,
    layerOrNormals?: number | Float32Array,
    skipTonemapOrLayer?: boolean | number,
    premultipliedOrSkipTonemap?: boolean,
    blendModeOrPremultiplied?: BlendMode,
    indicesOrBlendMode?: Uint16Array | number[] | BlendMode,
    translationOnlyOrIndices?: boolean | Uint16Array | number[],
    packedColorOrTranslationOnly?: Uint8Array | Color | boolean,
  ): void {
    if (typeof batchKeyOrVertices === 'string') {
      // component form: shift args by one
      this.addShapeInternal(
        colorOrVertices as Float32Array,                    // vertices
        transformOrColor as Color,                          // color
        toMatrixInput(uvOrTransform as Mat4x4f | Float32Array | number[] | TransformInput), // transform
        textureOrUv as Float32Array | undefined,            // uv
        vertexColorsOrTexture as TextureHandle | null | undefined, // texture
        depthWriteOrVertexColors as Float32Array | undefined,      // vertexColors
        normalsOrDepthWrite as boolean | undefined,                // depthWrite
        layerOrNormals as Float32Array | undefined,                // normals
        skipTonemapOrLayer as number | undefined,                  // layer
        premultipliedOrSkipTonemap as boolean | undefined,         // skipTonemap
        blendModeOrPremultiplied as boolean | undefined,           // premultiplied
        indicesOrBlendMode as BlendMode | undefined,               // blendMode
        translationOnlyOrIndices as Uint16Array | number[] | undefined, // indices
        packedColorOrTranslationOnly as boolean | undefined,       // translationOnly
        arguments[15] as Uint8Array | Color | undefined,           // packedColor
      )
      return
    }
    this.addShapeInternal(
      batchKeyOrVertices,
      colorOrVertices as Color,
      toMatrixInput(transformOrColor as Mat4x4f | Float32Array | number[]),
      uvOrTransform as Float32Array | undefined,
      textureOrUv as TextureHandle | null | undefined,
      vertexColorsOrTexture as Float32Array | undefined,
      depthWriteOrVertexColors as boolean | undefined,
      normalsOrDepthWrite as Float32Array | undefined,
      layerOrNormals as number | undefined,
      skipTonemapOrLayer as boolean | undefined,
      premultipliedOrSkipTonemap as boolean | undefined,
      blendModeOrPremultiplied as BlendMode | undefined,
      indicesOrBlendMode as Uint16Array | number[] | undefined,
      translationOnlyOrIndices as boolean | undefined,
      packedColorOrTranslationOnly as Uint8Array | Color | undefined,
    )
  }

  private addShapeInternal(
    vertices: Float32Array,
    color: Color,
    transform: Mat4x4f | Float32Array | number[],
    uv?: Float32Array,
    texture?: TextureHandle | null,
    vertexColors?: Float32Array,
    depthWrite?: boolean,
    normals?: Float32Array,
    layer?: number,
    skipTonemap?: boolean,
    premultiplied?: boolean,
    blendMode?: BlendMode,
    indices?: Uint16Array | number[],
    translationOnly?: boolean,
    packedColor?: Uint8Array | Color,
  ) {
    const transformMatrix = transform instanceof Mat4x4f
      ? transform
      : mat4x4f(transform instanceof Float32Array ? Array.from(transform) : transform)
    let effectiveTranslationOnly = !!translationOnly
    if (!effectiveTranslationOnly) {
      const s = transformMatrix.source
      if (s[0] === 1 && s[5] === 1 && s[10] === 1 && s[1] === 0 && s[2] === 0 && s[4] === 0 && s[6] === 0 && s[8] === 0 && s[9] === 0) {
        effectiveTranslationOnly = true
      }
    }

    // Pooled item object — high-volume submitters (skeletal renderers) push
    // tens of thousands of shapes per frame; recycling avoids GC churn.
    // All fields are (re)assigned below, including undefineds.
    const item = this.itemPool.pop() ?? ({} as BatchItem)
    item.vertices = vertices
    item.color = color
    item.transform = transformMatrix
    item.uv = uv
    item.texture = texture
    item.vertexColors = vertexColors
    item.depthWrite = depthWrite
    item.normals = normals
    item.layer = layer ?? 0
    item.skipTonemap = skipTonemap
    item.premultiplied = premultiplied
    item.blendMode = blendMode
    item.indices = indices
    item.translationOnly = effectiveTranslationOnly
    item.packedColor = packedColor
    this.batchItems.push(item)
    this._pendingVertexCount += vertices.length / 3

    if (this._pendingVertexCount >= this.maxBatchSize) {
      this.flush()
    }
  }

  /** Return drawn items to the pool, dropping references to caller-owned
   * buffers (vertices/uv/indices/packedColor may be reused component arrays —
   * retaining them across frames would pin them). */
  private releaseItems(items: BatchItem[], start: number, end: number): void {
    for (let i = start; i < end; i++) {
      const it = items[i]
      it.vertices = undefined as never
      it.color = undefined as never
      it.transform = undefined as never
      it.uv = undefined
      it.texture = undefined
      it.vertexColors = undefined
      it.normals = undefined
      it.indices = undefined
      it.packedColor = undefined
      // Recycle the sealed payload instead of dropping it: it is re-created
      // for every sealed mesh otherwise (see endMesh). `sealed = undefined`
      // is the "this item is not a sealed marker" signal that mergedGroupKey
      // and the layer-filtered flush branch rely on, so the payload moves to
      // its own pool rather than staying on the item.
      if (it.sealed) {
        this.sealedPool.push(it.sealed)
        it.sealed = undefined
      }
      this.itemPool.push(it)
    }
  }

  // --- fast lane: direct staging write (beginMesh / endMesh) ----------------
  // High-throughput geometry producers (skeletal renderers, particle systems)
  // write world-space vertices straight into the shared staging arrays at a
  // reserved base, then seal the range as a group. This eliminates the
  // intermediate component buffer + the per-vertex re-copy — the staging write
  // the component performs IS the final content.

  /**
   * Reserve staging space for a fast-lane mesh and return write views.
   *
   * The caller writes world-space positions into `pos` at
   * `[vBase*3 .. vBase*3 + n*3)`, packed RGBA8 colors into `col` at
   * `[vBase*4 ..]`, uvs into `uv` at `[vBase*2 ..]`, and (optionally
   * vBase-offseted) triangle indices into `idx` at `[iBase ..]`, then calls
   * {@link endMesh} with the actual counts. All views are live slices of the
   * shared staging arrays — writes land directly where the upload reads.
   */
  beginMesh(vertexCap: number, indexCap: number): {
    vBase: number; iBase: number
    pos: Float32Array; col: Uint8Array; uv: Float32Array; idx: Uint32Array
    unchangedUv?: boolean; unchangedColor?: boolean; unchangedIndices?: boolean
  } {
    this.ensureStaging(this.vertexWatermark + vertexCap)
    if (this.indexCapacity < this.indexWatermark + indexCap) {
      const next = Math.max(this.indexWatermark + indexCap, Math.ceil(this.indexCapacity * 1.5))
      this.indexCapacity = next
      // Grow WITH COPY (same contract as ensureStaging): without this the
      // first frame's mid-frame growth would let the sealed run's
      // indicesArray.subarray read past the old JS-array end and silently
      // clamp, losing everything staged before the growth. (transformGroup's
      // legacy growth is copy-free because it rewrites the whole list.)
      const nextArr = new Uint32Array(next)
      if (this.indicesArray && this.indicesArray.length) nextArr.set(this.indicesArray)
      this.indicesArray = nextArr
      this.growIndexBuffer(next)
    }
    const vBase = this.vertexWatermark
    const iBase = this.indexWatermark
    this.vertexWatermark += vertexCap
    this.indexWatermark += indexCap

    let span = this.meshSpan
    if (!span) {
      span = this.meshSpan = {
        vBase: 0, iBase: 0, vCap: 0, iCap: 0,
        pos: this.positionsArray!, col: this.packedColorsArray!,
        uv: this.uvsArray!, idx: this.indicesArray!
      }
    }
    span.vBase = vBase
    span.iBase = iBase
    span.vCap = vertexCap
    span.iCap = indexCap
    span.pos = this.positionsArray!
    span.col = this.packedColorsArray!
    span.uv = this.uvsArray!
    span.idx = this.indicesArray!
    // Clear any clean-stream declaration left by the previous mesh — the
    // span is one recycled object, and a stale `true` here would make endMesh
    // seal a mesh as "streams unchanged" when the producer never said so.
    span.unchangedUv = false
    span.unchangedColor = false
    span.unchangedIndices = false
    return span
  }

  /**
   * Seal a fast-lane mesh range previously reserved by {@link beginMesh}.
   * The staged content becomes a drawable group; consecutive seals with the
   * same key (texture/blend/flags) merge into one draw at flush time.
   * Indices in `idx` must already be offset by the span's vBase.
   */
  endMesh(
    span: {
      vBase: number; iBase: number
      /** Producer clean-stream declarations (see SealedMesh.unchangedUv). */
      unchangedUv?: boolean; unchangedColor?: boolean; unchangedIndices?: boolean
    },
    vertexCount: number,
    indexCount: number,
    texture?: TextureHandle | null,
    blendMode?: BlendMode,
    premultiplied?: boolean,
    skipTonemap?: boolean,
  ): void {
    const item = this.itemPool.pop() ?? ({} as BatchItem)
    // Fast-lane markers only read these fields in the sealed path; the legacy
    // per-vertex fields stay undefined. Force layer=0: pooled items may
    // carry a stale layer from a previous life, and flush(0) filters by
    // layer — a stale non-zero layer would drop the sealed item entirely.
    item.vertices = undefined as never
    item.color = undefined as never
    item.transform = undefined as never
    item.layer = 0
    // Reuse a recycled sealed payload when one is available (see releaseItems):
    // high-volume producers submit one sealed mesh per attachment per frame
    // (36k/frame on the c310 bench), so allocating a fresh payload plus its
    // single-element texture array here was 72k short-lived allocations per
    // frame of pure GC pressure.
    const sealed = this.sealedPool.pop()
    if (sealed) {
      sealed.vBase = span.vBase
      sealed.vCount = vertexCount
      sealed.iBase = span.iBase
      sealed.iCount = indexCount
      sealed.blendMode = blendMode ?? 'normal'
      sealed.premultiplied = premultiplied ?? false
      sealed.skipTonemap = skipTonemap ?? false
      sealed.textures[0] = texture ?? null
      // Clean-stream declarations are per-mesh, read fresh from the span.
      // A recycled payload must not keep the previous mesh's flags.
      sealed.unchangedUv = span.unchangedUv === true
      sealed.unchangedColor = span.unchangedColor === true
      sealed.unchangedIndices = span.unchangedIndices === true
      item.sealed = sealed
    } else {
      item.sealed = {
        vBase: span.vBase, vCount: vertexCount,
        iBase: span.iBase, iCount: indexCount,
        textures: [texture ?? null],
        blendMode: blendMode ?? 'normal',
        premultiplied: premultiplied ?? false,
        skipTonemap: skipTonemap ?? false,
        unchangedUv: span.unchangedUv === true,
        unchangedColor: span.unchangedColor === true,
        unchangedIndices: span.unchangedIndices === true,
      }
    }
    // Mirror the sealed flags onto the item-level fields mergedGroupKey
    // reads. Pooled items carry STALE values from a previous legacy life —
    // without this, sealed markers key by garbage: blend changes between
    // consecutive attachments don't split runs, so an additive mesh merged
    // into a normal run draws with the run's first blend mode (wrong
    // blending on same-page blend transitions; multi-page atlases only
    // masked it because the texture split happened to fire first).
    item.blendMode = blendMode ?? 'normal'
    item.premultiplied = premultiplied ?? false
    item.skipTonemap = skipTonemap ?? false
    item.texture = texture ?? null
    item.depthWrite = undefined
    item.normals = undefined
    item.uv = undefined
    item.indices = undefined
    item.packedColor = undefined
    item.vertexColors = undefined
    item.translationOnly = undefined
    this.batchItems.push(item)
  }

  /** Grow the shared staging arrays to cover `needVerts` vertices. Same
   * orphaning contract as ensureBufferCapacity. */
  private ensureStaging(needVerts: number): void {
    if (this.positionsArray && this.currentCapacity >= needVerts) return
    const next = Math.max(needVerts, Math.ceil(this.currentCapacity * 1.5))
    // Grow WITH COPY: fast-lane producers stage vertex data at submit time
    // (before flush). Replacing arrays with fresh zeroed ones would wipe
    // every mesh staged earlier in the same frame. (Only the per-vertex
    // elements need reallocating — batchItems and items arrays grow on
    // demand elsewhere.)
    const grow = <T extends Float32Array | Uint8Array>(
      old: T | null,
      stride: number,
      Ctor: new (n: number) => T
    ): T => {
      const nextArr = new Ctor(next * stride)
      if (old && old.length) nextArr.set(old)
      return nextArr
    }
    this.positionsArray = grow(this.positionsArray, 3, Float32Array)
    this.colorsArray = grow(this.colorsArray, 4, Float32Array)
    this.packedColorsArray = grow(this.packedColorsArray, 4, Uint8Array)
    this.uvsArray = grow(this.uvsArray, 2, Float32Array)
    this.normalsArray = grow(this.normalsArray, 3, Float32Array)
    this.texIndicesArray = grow(this.texIndicesArray, 1, Float32Array)
    this.currentCapacity = next
    this.ensureBufferCapacity(next)
  }

  // --- flush ----------------------------------------------------------------

  /**
   * Flush buffered items. Pass a `filterLayer` to flush only that layer's
   * items (leaving others queued for a later pass); omit to flush everything.
   */
  flush(filterLayer?: number) {
    if (this.batchItems.length === 0) return

    const toDraw = filterLayer === undefined
      ? this.batchItems
      : this.batchItems.filter((it) => it.layer === filterLayer)
    if (toDraw.length === 0) return

    // Merged grouping where the backend supports it (sampler array);
    // otherwise contiguous runs of (texture, blendMode) — one texture per draw.
    if (this.mergedGrouping) {
      this.flushMerged(toDraw)
    } else {
      let start = 0
      let curTexture = toDraw[0].texture ?? null
      let curBlend: BlendMode = toDraw[0].blendMode ?? 'normal'
      for (let i = 1; i <= toDraw.length; i++) {
        const item = i < toDraw.length ? toDraw[i] : null
        const tex = item ? item.texture ?? null : null
        const blend: BlendMode = item ? item.blendMode ?? 'normal' : curBlend
        if (i === toDraw.length || tex !== curTexture || blend !== curBlend) {
          this.drawGroup(toDraw.slice(start, i), [curTexture])
          start = i
          curTexture = tex
          curBlend = blend
        }
      }
    }

    // Return drawn items to the pool, keep other layers queued for later
    // passes. Full flush releases everything and reuses the items array;
    // layer-filtered flush releases only the drawn subset.
    //
    // Watermark reset: fast-lane producers write into staging at submit
    // time (before flush). The watermarks MUST reset here, otherwise the
    // very first frame's capacity grows unboundedly across subsequent
    // frames (staging would absorb ~1.5 GB/frame at 200 spine instances).
    // Layer-filtered flush also drops kept sealed markers — their staging
    // ranges are invalidated by the reset — and the kept legacy items
    // re-copy from their own buffers at draw time so they survive intact.
    if (filterLayer === undefined) {
      this.releaseItems(toDraw, 0, toDraw.length)
      this.batchItems.length = 0
      this._pendingVertexCount = 0
      this.vertexWatermark = 0
      this.indexWatermark = 0
    } else {
      this.releaseItems(toDraw, 0, toDraw.length)
      const kept = this.batchItems.filter(
        (it) => it.layer !== filterLayer && !it.sealed
      )
      this.batchItems = kept
      this._pendingVertexCount = 0
      for (const it of kept) this._pendingVertexCount += it.vertices.length / 3
      this.vertexWatermark = 0
      this.indexWatermark = 0
    }
  }

  /** Merged flush: CONTIGUOUS runs of (blendMode, hasTexture, per-item
   * flags), then chunks of ≤ MAX_TEXTURES_PER_DRAW distinct textures per
   * draw. Every key component is an item-level boolean, so each group is
   * flag-homogeneous and the some()/every() derivations in a backend's
   * drawGroup reduce to the shared item value — per-item output is identical
   * to the legacy grouping; only same-flag different-texture neighbours merge
   * into one draw call (validated by benchmark/gfx A/B E4). Draw order is
   * preserved (item order is preserved — important for painter's-order draws). */
  private flushMerged(toDraw: BatchItem[]): void {
    let start = 0
    while (start < toDraw.length) {
      const key = mergedGroupKey(toDraw[start])
      const textures: TextureHandle[] = []
      const slots = new Map<TextureHandle, number>()
      let i = start
      let sawSealed = false
      let sealedFirst = -1
      let sealedLast = -1
      // Flush the sealed run collected so far. `end` is EXCLUSIVE —
      // drawSealedRun reads items[end - 1] for the run's last marker, and
      // passing the inclusive sealedLast here dropped the final attachment of
      // every run (invisible on single-texture skeletons, catastrophic on
      // multi-texture/multi-blend ones like the NIKKE c223/c233 atlases
      // where most meshes disappeared).
      const flushSealed = (): void => {
        this.drawSealedRun(toDraw, sealedFirst, sealedLast + 1)
        sawSealed = false
        sealedFirst = -1
        sealedLast = -1
      }
      // True once ANY sealed marker in this key group has been drawn. Groups
      // are sealed-homogeneous (mergedGroupKey carries the sealed bit), so a
      // drawn run means the whole [start, i) span is consumed — drawGroup
      // must not see it again.
      let sealedDrawn = false
      while (i < toDraw.length) {
        const it = toDraw[i]
        if (mergedGroupKey(it) !== key) {
          // Key change ends the run — draw a trailing sealed run before the
          // outer loop re-keys to the next group.
          if (sawSealed) { flushSealed(); sealedDrawn = true }
          break
        }
        if (it.sealed) {
          // The sealed path binds ONE texture (first.textures[0]). A multi-page
          // atlas alternates pages between consecutive attachments, so a
          // texture change must split the run — otherwise later meshes sample
          // the previous page (the "smoke renders clothing" class of bug on
          // the NIKKE c223/c233 atlases). Blend/flags are already
          // key-homogeneous; only texture identity needs an explicit split.
          const runTex = sawSealed ? toDraw[sealedFirst].sealed!.textures[0] : null
          if (sawSealed && it.sealed.textures[0] !== runTex) {
            flushSealed()
            sealedDrawn = true
          }
          if (!sawSealed) { sawSealed = true; sealedFirst = i }
          sealedLast = i
          i++
          continue
        }
        // A legacy item inside a sealed run splits it (draw both parts).
        if (sawSealed) { flushSealed(); sealedDrawn = true }
        const tex = it.texture ?? null
        if (tex && !slots.has(tex)) {
          if (textures.length >= MAX_TEXTURES_PER_DRAW) break
          slots.set(tex, textures.length)
          textures.push(tex)
        }
        i++
      }
      if (sawSealed) {
        flushSealed()
        start = i
        continue
      }
      if (sealedDrawn) {
        // Sealed run ended on a key change; the remaining items belong to the
        // next group.
        start = i
        continue
      }
      this.drawGroup(toDraw.slice(start, i), textures.length > 0 ? textures : [null])
      start = i
    }
  }

  /** Cached zero-filled texIndex scratch for the sealed path's re-zero upload
   * (grown on demand; content stays zero forever). */
  protected zeroTexIndices(count: number): Float32Array {
    if (this.zeroTexIndicesScratch.length < count) {
      this.zeroTexIndicesScratch = new Float32Array(Math.max(count, Math.ceil(this.zeroTexIndicesScratch.length * 1.5)))
    }
    return this.zeroTexIndicesScratch.subarray(0, count)
  }

  /** Fast-lane staging accessor (sealed-path uploads read these ranges). */
  protected getStaging(): {
    positions: Float32Array | null
    colors: Float32Array | null
    packedColors: Uint8Array | null
    uvs: Float32Array | null
    normals: Float32Array | null
    texIndices: Float32Array | null
    indices: Uint32Array | null
  } {
    return {
      positions: this.positionsArray,
      colors: this.colorsArray,
      packedColors: this.packedColorsArray,
      uvs: this.uvsArray,
      normals: this.normalsArray,
      texIndices: this.texIndicesArray,
      indices: this.indicesArray,
    }
  }

  /**
   * Build the vertex streams for a legacy group.
   *
   * Extracted from the GL implementation so the transform math exists once: a
   * backend's drawGroup receives these streams and only uploads + draws them.
   *
   * Writes into DEDICATED scratch arrays — NOT the shared fast-lane staging.
   * The staging arrays hold fast-lane producers' content written at submit
   * time; a legacy transform writing [0..N) there would clobber sealed ranges
   * that later runs in the same flush still upload (garbage positions/colors
   * for every sealed run drawn after a legacy group — latent on any skeleton
   * mixing clipped addShape meshes with fast-lane meshes).
   *
   * @param indexedCapable whether the backend can draw indexed (drawElements).
   *   Backends that can't (and mixed groups) expand indexed items through
   *   their index list inside the loop.
   */
  protected transformGroup(items: BatchItem[], textures: (TextureHandle | null)[], indexedCapable: boolean): GroupStreams {
    const allIndexed = indexedCapable && items.every((it) => it.indices !== undefined && it.indices.length > 0)
    // Staging/draw vertex count: unique vertices on the indexed path,
    // index-expanded vertices on the fallback path.
    const totalVertices = allIndexed
      ? items.reduce((sum, item) => sum + item.vertices.length / 3, 0)
      : items.reduce((sum, item) => sum + (item.indices && item.indices.length > 0 ? item.indices.length : item.vertices.length / 3), 0)
    const totalIndices = allIndexed ? items.reduce((sum, item) => sum + item.indices!.length, 0) : 0
    const hasTexture = textures[0] !== null

    // Scratch grows lazily to the largest group seen and is reused; legacy
    // groups are a small fraction of a frame.
    if (!this.groupPositions || this.groupPositions.length < totalVertices * 3) {
      const prevCap = this.groupPositions ? this.groupPositions.length / 3 : 0
      const cap = Math.max(totalVertices, Math.ceil(prevCap * 1.5))
      this.groupPositions = new Float32Array(cap * 3)
      this.groupColors = new Float32Array(cap * 4)
      this.groupPackedColors = new Uint8Array(cap * 4)
      this.groupUvs = new Float32Array(cap * 2)
      this.groupNormals = new Float32Array(cap * 3)
      this.groupTexIndices = new Float32Array(cap)
    }

    const positions = this.groupPositions!
    const colors = this.groupColors!
    const packedColors = this.groupPackedColors!
    const uvs = this.groupUvs!
    const normals = this.groupNormals!
    const texIndices = this.groupTexIndices!

    // Does any item carry normals? (enables per-pixel lighting for the group)
    const hasNormals = items.some((item) => item.normals && item.normals.length > 0)
    // Every item opting into the packed-color stream means the group can use
    // the normalized-byte path. Mixed groups fall back to the float-color
    // path (vertexColors take precedence for the few non-packed items, the
    // rest pay the float upload).
    const allPackedColor = items.length > 0 && items.every((item) => item.packedColor !== undefined)

    // texture → slot within this group (multi-texture merge)
    const slotOf = new Map<TextureHandle, number>()
    for (let s = 0; s < textures.length; s++) {
      const t = textures[s]
      if (t) slotOf.set(t, s)
    }

    let posOffset = 0
    let colorOffset = 0
    let packedColorOffset = 0
    let uvOffset = 0
    let normOffset = 0
    let texIdxOffset = 0

    for (const item of items) {
      const vertexCount = item.vertices.length / 3
      // Fallback path indirection: output vertex i reads source vertex
      // idx[i] (index expansion). The allIndexed path transforms each unique
      // vertex once — idx stays null and sources read sequentially.
      const idx = allIndexed ? null : item.indices && item.indices.length > 0 ? item.indices : null
      const outCount = idx ? idx.length : vertexCount
      const m = item.transform.source
      const itemUv = item.uv
      const itemNormals = item.normals
      const texSlot = (item.texture ? slotOf.get(item.texture) : undefined) ?? 0
      const transOnly = !!item.translationOnly
      const tx = m[12]
      const ty = m[13]
      const tz = m[14]

      for (let i = 0; i < outCount; i++) {
        const s = idx ? idx[i] : i
        const x = item.vertices[s * 3]
        const y = item.vertices[s * 3 + 1]
        const z = item.vertices[s * 3 + 2] || 0

        if (transOnly) {
          positions[posOffset++] = x + tx
          positions[posOffset++] = y + ty
          positions[posOffset++] = z + tz
        } else {
          const transformedX = m[0] * x + m[4] * y + m[8] * z + m[12]
          const transformedY = m[1] * x + m[5] * y + m[9] * z + m[13]
          const transformedZ = m[2] * x + m[6] * y + m[10] * z + m[14]
          positions[posOffset++] = transformedX
          positions[posOffset++] = transformedY
          positions[posOffset++] = transformedZ
        }

        // Transform normals by the model matrix's 3x3 (rotation+scale) part,
        // then normalize in the shader. Good enough for uniform-ish scales.
        if (itemNormals) {
          if (transOnly) {
            normals[normOffset++] = itemNormals[s * 3]
            normals[normOffset++] = itemNormals[s * 3 + 1]
            normals[normOffset++] = itemNormals[s * 3 + 2]
          } else {
            const nx = itemNormals[s * 3]
            const ny = itemNormals[s * 3 + 1]
            const nz = itemNormals[s * 3 + 2]
            normals[normOffset++] = m[0] * nx + m[4] * ny + m[8] * nz
            normals[normOffset++] = m[1] * nx + m[5] * ny + m[9] * nz
            normals[normOffset++] = m[2] * nx + m[6] * ny + m[10] * nz
          }
        } else {
          normals[normOffset++] = 0
          normals[normOffset++] = 0
          normals[normOffset++] = 0
        }

        // Per-vertex color: prefer the optional packedColor stream (4 bytes
        // per vertex), then vertexColors (per-vertex float), then uniform
        // color.
        if (item.packedColor !== undefined) {
          if (item.packedColor instanceof Uint8Array) {
            const pc = item.packedColor
            packedColors[packedColorOffset++] = pc[s * 4]
            packedColors[packedColorOffset++] = pc[s * 4 + 1]
            packedColors[packedColorOffset++] = pc[s * 4 + 2]
            packedColors[packedColorOffset++] = pc[s * 4 + 3]
          } else {
            const c = item.packedColor
            packedColors[packedColorOffset++] = (c.r * 255) | 0
            packedColors[packedColorOffset++] = (c.g * 255) | 0
            packedColors[packedColorOffset++] = (c.b * 255) | 0
            packedColors[packedColorOffset++] = (c.a * 255) | 0
          }
        } else if (item.vertexColors) {
          colors[colorOffset++] = item.vertexColors[s * 3]
          colors[colorOffset++] = item.vertexColors[s * 3 + 1]
          colors[colorOffset++] = item.vertexColors[s * 3 + 2]
          colors[colorOffset++] = item.color.a
        } else {
          colors[colorOffset++] = item.color.r
          colors[colorOffset++] = item.color.g
          colors[colorOffset++] = item.color.b
          colors[colorOffset++] = item.color.a
        }

        if (itemUv) {
          uvs[uvOffset++] = itemUv[s * 2]
          uvs[uvOffset++] = itemUv[s * 2 + 1]
        } else {
          uvs[uvOffset++] = 0
          uvs[uvOffset++] = 0
        }
        texIndices[texIdxOffset++] = texSlot
      }
    }

    let indices: Uint32Array
    if (allIndexed) {
      // Join the per-item index lists into one group index list, offsetting
      // each item's indices by its base vertex position in the staging area.
      if (!this.indicesArray || this.indexCapacity < totalIndices) {
        this.indexCapacity = Math.max(totalIndices, Math.ceil(this.indexCapacity * 1.5))
        this.indicesArray = new Uint32Array(this.indexCapacity)
      }
      indices = this.indicesArray
      let io = 0
      let base = 0
      for (const item of items) {
        const itemIndices = item.indices!
        for (let i = 0; i < itemIndices.length; i++) indices[io++] = itemIndices[i] + base
        base += item.vertices.length / 3
      }
    } else {
      // Fallback path draws non-indexed; keep the scratch as-is.
      indices = this.indicesArray ?? new Uint32Array(0)
    }

    return {
      positions,
      colors,
      packedColors,
      uvs,
      normals,
      texIndices,
      indices,
      totalVertices,
      totalIndices,
      allIndexed,
      hasNormals,
      allPackedColor,
      hasTexture,
      colorCount: colorOffset,
      packedColorCount: packedColorOffset,
      uvCount: uvOffset,
      normalCount: normOffset,
    }
  }
}
